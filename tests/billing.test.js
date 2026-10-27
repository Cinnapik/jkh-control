import { test } from 'node:test'
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { SCHEMA_SQL, SEED_SQL } from '../src/db/schema.js'
import { migrate } from '../src/db/migrations.js'
import {calculateCost} from '../src/lib/billing.js'
import * as db from '../src/db/database.js'
import * as api from '../src/db/api.js'
const tiers=[{limit:150,price:2.86},{limit:800,price:6.55},{limit:null,price:10.52}]
test('Последовательные диапазоны: все границы и превышения',()=>{
  for(const [volume,expected] of [[100,286],[150,429],[151,435.55],[200,756.5],[800,4686.5],[801,4697.02],[900,5738.5]]) assert.equal(calculateCost(volume,{kind:'tiered',tiers}),expected)
})
test('Миграция старой базы, операции, восстановление и сохранность истории',async t=>{
  const SQL=await initSqlJs()
  const legacy=new SQL.Database();legacy.run(SCHEMA_SQL);legacy.run(SEED_SQL)
  legacy.run("INSERT INTO readings(service_id,value,period,created_at) VALUES(1,0,'2026-08','old')")
  legacy.run("INSERT INTO tariffs(service_id,price,valid_from) VALUES(1,10,'2026-01-01')")
  legacy.run("INSERT INTO invoices(service_id,period,amount,is_paid,paid_at,created_at) VALUES(1,'2026-08',123,1,'2026-09-01','old')")
  const original=legacy.export(); let disk=original,fail=false
  globalThis.window={jkhAPI:{loadDB:async()=>disk,saveDB:async bytes=>{if(fail)return {ok:false,error:'Диск недоступен'};disk=bytes;return {ok:true}}}}
  await db.initDatabase()
  const internet=api.getServices().find(s=>s.name==='Интернет'),electric=3
  await t.test('Старые данные и настройки сохраняются, миграция повторяема',()=>{
    assert.equal(api.getInvoices()[0].amount,123);assert.equal(api.getInvoices()[0].paid_at,'2026-09-01')
    assert.equal(api.getPreviousReading(1,'2026-09'),0)
    const copy=new SQL.Database(disk);migrate(copy);migrate(copy)
    assert.equal(copy.exec("SELECT COUNT(*) FROM services WHERE name='Интернет'")[0].values[0][0],1)
    copy.close()
  })
  await t.test('Выключение и включение счётчика и услуги сохраняет историю и файл',async()=>{
    await api.setServiceFlag(1,'meter_enabled',false);assert.equal(api.getReadings(1).length,1)
    await api.setServiceFlag(1,'enabled',false);await assert.rejects(api.addInvoice({service_id:1,period:'2026-10',amount:1}),/отключена/)
    const reopened=new SQL.Database(disk);assert.equal(reopened.exec('SELECT meter_enabled FROM services WHERE id=1')[0].values[0][0],0);reopened.close()
    await api.setServiceFlag(1,'meter_enabled',true);await api.setServiceFlag(1,'enabled',true);assert.equal(api.getReadings(1)[0].value,0)
  })
  await api.setTariff({service_id:electric,price:2,valid_from:'2026-01-01'})
  await api.setTariff({service_id:electric,price:0,valid_from:'2026-10-01',kind:'tiered',tiers})
  await api.addReading({service_id:electric,value:1000,period:'2026-08'})
  await api.addReading({service_id:electric,value:1100,period:'2026-09'})
  await api.addReading({service_id:electric,value:1300,period:'2026-10'})
  await t.test('Исторический тариф и новое начисление 200 кВт·ч',async()=>{
    await api.addInvoice({service_id:electric,period:'2026-09',automatic:true})
    await api.addInvoice({service_id:electric,period:'2026-10',automatic:true})
    assert.equal(api.getInvoices('2026-09')[0].amount,200)
    assert.equal(api.getInvoices('2026-10')[0].amount,756.5)
    await api.setTariff({service_id:electric,price:100,valid_from:'2026-11-01'})
    assert.equal(api.getInvoices('2026-10')[0].amount,756.5)
  })
  await t.test('Удаление тарифа освобождает дату, сохраняя версию в начислении',async()=>{
    const bill=api.getInvoices('2026-10')[0]
    await api.deleteTariff(bill.tariff_id)
    assert.equal(api.getTariffs().some(t=>t.id===bill.tariff_id),false)
    assert.equal(api.getInvoices('2026-10')[0].amount,756.5)
    await api.setTariff({service_id:electric,price:1000,valid_from:'2026-10-01'})
    assert.equal(api.getTariff(electric,'2026-10-01').price,1000)
    assert.equal(api.getInvoices('2026-10')[0].tariff_id,bill.tariff_id)
  })
  await t.test('Редактирование меняет соседние счета и сохраняет тарифную версию',async()=>{
    const row=api.getReadings(electric).find(r=>r.period==='2026-09')
    await api.updateReading({...row,value:1150})
    assert.equal(api.getInvoices('2026-09')[0].amount,300)
    assert.equal(api.getInvoices('2026-10')[0].amount,429)
  })
  await t.test('Оплата защищает показания и оба соседних счёта, откат атомарен',async()=>{
    const bill=api.getInvoices('2026-10')[0];await api.togglePaid(bill.id,true)
    const paid=api.getInvoices('2026-10')[0].paid_at
    const row=api.getReadings(electric).find(r=>r.period==='2026-09')
    await assert.rejects(api.updateReading({...row,value:1160}),/оплаченный/)
    assert.equal(api.getReadings(electric).find(r=>r.id===row.id).value,1150)
    assert.equal(api.getInvoices('2026-09')[0].amount,300)
    assert.equal(api.getInvoices('2026-10')[0].paid_at,paid)
    await assert.rejects(api.deleteReading(row),/оплаченный/)
    await api.togglePaid(bill.id,false)
  })
  await t.test('Валидация: дубль, отрицательное, убывающее, отсутствие предыдущего',async()=>{
    await assert.rejects(api.addReading({service_id:electric,value:1400,period:'2026-10'}),/уже есть/)
    await assert.rejects(api.addReading({service_id:electric,value:-1,period:'2026-11'}),/неотрицательным/)
    await assert.rejects(api.addReading({service_id:electric,value:1,period:'2026-11'}),/меньше предыдущего/)
    assert.throws(()=>api.invoiceEstimate(electric,'2026-08'),/предыдущее/)
  })
  await t.test('Удаление показания инвалидирует счета без месячного расхода',async()=>{
    await api.deleteReading(api.getReadings(electric).find(r=>r.period==='2026-09'))
    assert.equal(api.getInvoices('2026-09')[0].needs_review,1);assert.equal(api.getInvoices('2026-10')[0].needs_review,1)
    await assert.rejects(api.togglePaid(api.getInvoices('2026-10')[0].id,true),/сверки/)
    await api.deleteInvoice(api.getInvoices('2026-09')[0].id);await api.deleteInvoice(api.getInvoices('2026-10')[0].id)
    assert.throws(()=>api.invoiceEstimate(electric,'2026-10'),/пропущен месяц/)
  })
  await t.test('Интернет: начисление, защита от дубля, оплата и дашборд',async()=>{
    await api.setTariff({service_id:internet.id,price:650,valid_from:'2026-10-01'})
    await api.addInvoice({service_id:internet.id,period:'2026-10',automatic:true})
    assert.deepEqual(api.getMonthTotal('2026-10'),{total:650,unpaid:650})
    await assert.rejects(api.addInvoice({service_id:internet.id,period:'2026-10',automatic:true}),/уже существует/)
    await api.togglePaid(api.getInvoices('2026-10')[0].id,true)
    assert.deepEqual(api.getMonthTotal('2026-10'),{total:650,unpaid:0})
    assert.equal(api.getByService('2026-10')[0].name,'Интернет')
    await api.setTariff({service_id:internet.id,price:700,valid_from:'2026-11-01'})
    assert.equal(api.getInvoices('2026-10')[0].amount,650)
    assert.equal(api.getInvoices('2030-01').length,0)
  })
  await t.test('Формирование фиксированных счетов идемпотентно и учитывает активность',async()=>{
    assert.equal(await api.generateFixedInvoices('2026-12'),1)
    assert.equal(await api.generateFixedInvoices('2026-12'),0)
    await api.setServiceFlag(internet.id,'enabled',false)
    assert.equal(await api.generateFixedInvoices('2027-01'),0)
    assert.equal(api.getInvoices('2026-12')[0].amount,700)
    await api.setServiceFlag(internet.id,'enabled',true)
  })
  await t.test('Смена тарифа внутри месяца требует ручного распределения',async()=>{
    await api.setTariff({service_id:internet.id,price:750,valid_from:'2026-11-15'})
    assert.throws(()=>api.invoiceEstimate(internet.id,'2026-11'),/внутри месяца/)
  })
  await t.test('Ошибка сохранения откатывает изменение',async()=>{
    fail=true;await assert.rejects(api.setServiceFlag(1,'enabled',false),/Диск/);fail=false
    assert.equal(api.getServices()[0].enabled,1)
  })
  await t.test('Водоотведение: объём × тариф, без отдельного счётчика и фиксированного счёта',async()=>{
    const service=api.getServices().find(s=>s.name==='Водоотведение')
    assert.equal(service.has_meter,0)
    assert.equal(api.isVolumeService(service),true)
    await api.setTariff({service_id:service.id,price:25,valid_from:'2027-01-01'})
    assert.throws(()=>api.invoiceEstimate(service.id,'2027-01'),/объём/)
    assert.equal(api.invoiceEstimate(service.id,'2027-01',7.5).amount,187.5)
    await api.addInvoice({service_id:service.id,period:'2027-01',consumption:7.5,automatic:true})
    assert.equal(api.getInvoices('2027-01')[0].amount,187.5)
    assert.equal(api.getInvoices('2027-01')[0].consumption,7.5)
    await api.generateFixedInvoices('2027-02')
    assert.equal(api.getInvoices('2027-02').some(i=>i.service_id===service.id),false)
  })
  await t.test('Групповое сохранение переключателей атомарно и не меняет другую группу',async()=>{
    const rows=api.getServices().map(s=>({...s,meter_enabled:0,enabled:0}))
    fail=true;await assert.rejects(api.saveServiceFlags(rows,'meter_enabled'),/Диск/);fail=false
    assert.equal(api.getServices()[0].meter_enabled,1)
    await api.saveServiceFlags(rows,'meter_enabled')
    assert.equal(api.getServices()[0].meter_enabled,0)
    assert.equal(api.getServices()[0].enabled,1)
    await api.saveServiceFlags(api.getServices().map(s=>({...s,meter_enabled:1})),'meter_enabled')
  })
  await t.test('Копия восстанавливается, старая копия мигрирует, повреждённая не заменяет данные',async()=>{
    const backup=db.exportBytes();await api.setSetting('address','Тест');await db.restoreBytes(backup)
    assert.equal(api.getSetting('address'),'');assert.equal(api.getInvoices('2026-10')[0].is_paid,1)
    await assert.rejects(db.restoreBytes(new Uint8Array([1,2,3])))
    assert.equal(api.getInvoices('2026-10')[0].amount,650)
    await db.restoreBytes(original);assert.equal(api.getInvoices()[0].amount,123)
    assert.equal(api.getServices().length,9)
  })
  legacy.close()
})
