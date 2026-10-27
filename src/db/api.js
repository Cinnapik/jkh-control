import { query, run, transaction, getSetting, setSetting } from './database.js'
import { calculateCost, nonnegative, validPeriod, validateTariff } from '../lib/billing.js'
export function getServices() { return query('SELECT * FROM services ORDER BY id') }
export async function setServiceFlag(id, flag, value) {
  if (!['enabled','meter_enabled'].includes(flag)) throw new Error('Неизвестная настройка')
  await run(`UPDATE services SET ${flag}=? WHERE id=?`,[value?1:0,id])
}
export async function saveServiceFlags(rows, flag) {
  if (!['enabled','meter_enabled'].includes(flag)) throw new Error('Неизвестная настройка')
  await transaction(exec=>{for(const row of rows) exec(`UPDATE services SET ${flag}=? WHERE id=?`,[row[flag]?1:0,row.id])})
}
export function isVolumeService(service) { return !!service && (!!service.has_meter || service.name==='Водоотведение') }
export async function deleteTariff(id) {
  // Снимок тарифа остаётся доступным уже созданным счетам.
  await run('UPDATE tariffs SET deleted=1 WHERE id=?',[id])
}
export async function addService({name,unit,color,has_meter}) {
  await run('INSERT INTO services(name,unit,color,has_meter) VALUES(?,?,?,?)',[name,unit,color||'#3b82f6',has_meter?1:0])
}
export async function deleteService(id) { await setServiceFlag(id,'enabled',false) }
export function getTariffs() {
  return query('SELECT t.*,s.name AS service_name,s.unit FROM tariffs t JOIN services s ON s.id=t.service_id WHERE t.deleted=0 ORDER BY valid_from DESC,t.id DESC')
}
export function getTariff(serviceId, date = new Date().toLocaleDateString('sv-SE')) {
  return query('SELECT * FROM tariffs WHERE deleted=0 AND service_id=? AND valid_from<=? ORDER BY valid_from DESC,id DESC LIMIT 1',[serviceId,date])[0] || null
}
export function getCurrentPrice(id) { return getTariff(id)?.price || 0 }
export async function setTariff(t) {
  t = {...t,kind:t.kind||'flat'}
  validateTariff(t)
  const service = getServices().find(s=>s.id===t.service_id)
  if (!service || (t.kind==='tiered' && service.name!=='Электричество')) throw new Error('Диапазоны доступны только для электричества')
  if (query('SELECT id FROM tariffs WHERE deleted=0 AND service_id=? AND valid_from=?',[t.service_id,t.valid_from]).length) throw new Error('Тариф с этой датой уже существует')
  await run('INSERT INTO tariffs(service_id,price,valid_from,kind,tiers) VALUES(?,?,?,?,?)',[t.service_id,t.price,t.valid_from,t.kind,t.kind==='tiered'?JSON.stringify(t.tiers):null])
}
export function getReadings(id) { return query('SELECT * FROM readings WHERE service_id=? ORDER BY period DESC,id DESC',[id]) }
export function getPreviousReading(id,period) {
  return query('SELECT value FROM readings WHERE service_id=? AND period<? ORDER BY period DESC,id DESC LIMIT 1',[id,period])[0]?.value ?? null
}
function monthlyTariff(id,period) {
  validPeriod(period)
  const start=period+'-01'
  if (query("SELECT id FROM tariffs WHERE deleted=0 AND service_id=? AND valid_from>? AND substr(valid_from,1,7)=?",[id,start,period]).length) throw new Error('Тариф меняется внутри месяца. Точное распределение расхода неизвестно: добавьте начисление вручную.')
  const tariff=getTariff(id,start)
  if (!tariff) throw new Error('На выбранный месяц не задан тариф')
  return tariff
}
export function invoiceEstimate(id,period,consumption) {
  const service=getServices().find(s=>s.id===id)
  if (!service?.enabled) throw new Error('Услуга отключена')
  const tariff=monthlyTariff(id,period)
  if (service.name==='Водоотведение') {
    if (consumption===undefined) throw new Error('Укажите объём водоотведения в м³ для расчёта по тарифу')
    return {consumption,amount:calculateCost(consumption,tariff),tariff_id:tariff.id,source:'manual'}
  }
  if (!service.has_meter) return {consumption:0,amount:calculateCost(1,tariff),tariff_id:tariff.id,source:'fixed'}
  if (consumption === undefined) {
    const current=getReadings(id).find(r=>r.period===period)
    const previous=getPreviousReading(id,period)
    if (!current || previous===null) throw new Error('Для расчёта нужны текущее и предыдущее показания. Первое показание — начальная точка.')
    const prior=query('SELECT period FROM readings WHERE service_id=? AND period<? ORDER BY period DESC LIMIT 1',[id,period])[0].period
    const next=new Date(prior+'-01T00:00:00Z'); next.setUTCMonth(next.getUTCMonth()+1)
    if (next.toISOString().slice(0,7)!==period) throw new Error('Между показаниями пропущен месяц. Расход по месяцам неизвестен: добавьте начисление вручную.')
    consumption=current.value-previous
  }
  return {consumption,amount:calculateCost(consumption,tariff),tariff_id:tariff.id,source:'reading'}
}
function reconcile(exec,id) {
  // Сохраняем тарифную версию каждого сформированного счёта.
  const rows=query("SELECT * FROM invoices WHERE service_id=? AND source='reading'",[id])
  for (const invoice of rows) {
    const readings=getReadings(id), current=readings.find(r=>r.period===invoice.period)
    const prev=getPreviousReading(id,invoice.period)
    let consumption=null
    if(current && prev!==null) {
      const prior=readings.find(r=>r.period<invoice.period)
      const next=new Date(prior.period+'-01T00:00:00Z'); next.setUTCMonth(next.getUTCMonth()+1)
      if(next.toISOString().slice(0,7)===invoice.period) consumption=current.value-prev
    }
    if (consumption===invoice.consumption && !invoice.needs_review) continue
    if(invoice.is_paid) throw new Error('Изменение затрагивает оплаченный счёт. Сначала снимите отметку оплаты в разделе «Начисления и платежи» после сверки платежа.')
    if(consumption===null) exec('UPDATE invoices SET needs_review=1 WHERE id=?',[invoice.id])
    else {
      const tariff=query('SELECT * FROM tariffs WHERE id=?',[invoice.tariff_id])[0]
      exec('UPDATE invoices SET consumption=?,amount=?,needs_review=0 WHERE id=?',[consumption,calculateCost(consumption,tariff),invoice.id])
    }
  }
}
async function changeReading({id,service_id,value,period},remove=false) {
  validPeriod(period)
  if (id) {
    const original=query('SELECT * FROM readings WHERE id=?',[id])[0]
    if(!original || original.service_id!==service_id || original.period!==period) throw new Error('Показание не найдено или его период изменён. Обновите страницу.')
  }
  if(!remove) {
    nonnegative(value)
    if(query('SELECT id FROM readings WHERE service_id=? AND period=? AND id<>?',[service_id,period,id||-1]).length) throw new Error('Показание за этот месяц уже есть. Отредактируйте его.')
  }
  await transaction(exec=>{
    if(remove) exec('DELETE FROM readings WHERE id=?',[id])
    else if(id) exec('UPDATE readings SET value=?,period=? WHERE id=?',[value,period,id])
    else exec('INSERT INTO readings(service_id,value,period,created_at) VALUES(?,?,?,?)',[service_id,value,period,new Date().toISOString()])
    const readings=getReadings(service_id).reverse()
    for(let i=1;i<readings.length;i++) if(readings[i].value<readings[i-1].value) throw new Error('Показание меньше предыдущего или больше следующего. Проверьте ввод; замена счётчика требует отдельной начальной точки.')
    // Старые ручные счета не пересчитываются, но оплаченные защищены при затрагивании периода.
    const affected=[period, ...getReadings(service_id).filter(r=>r.period>period).slice(-1).map(r=>r.period)]
    if(query("SELECT id FROM invoices WHERE service_id=? AND is_paid=1 AND source='manual'",[service_id]).some(i=>affected.includes(query('SELECT period FROM invoices WHERE id=?',[i.id])[0].period))) throw new Error('Затронут оплаченный ручной счёт. Сначала сверьте платёж и снимите отметку оплаты.')
    reconcile(exec,service_id)
  })
}
export async function addReading(data) { return changeReading(data) }
export async function updateReading(data) { return changeReading(data) }
export async function deleteReading(row) { return changeReading(row,true) }
export function getInvoices(period=null) {
  return query(`SELECT i.*,s.name AS service_name,s.unit,s.color FROM invoices i JOIN services s ON s.id=i.service_id ${period?'WHERE i.period=?':''} ORDER BY i.period DESC,s.id`,period?[period]:[])
}
export async function addInvoice({service_id,period,consumption=0,amount,automatic=false}) {
  validPeriod(period)
  const service=getServices().find(s=>s.id===service_id)
  if(!service?.enabled) throw new Error('Услуга отключена')
  if(query('SELECT id FROM invoices WHERE service_id=? AND period=?',[service_id,period]).length) throw new Error('Начисление за этот месяц уже существует')
  const estimate=automatic?invoiceEstimate(service_id,period,service.name==='Водоотведение'?consumption:undefined):{consumption:isVolumeService(service)?consumption:0,amount,source:'manual',tariff_id:null}
  nonnegative(estimate.consumption); nonnegative(estimate.amount)
  await run('INSERT INTO invoices(service_id,period,consumption,amount,source,tariff_id,created_at) VALUES(?,?,?,?,?,?,?)',[service_id,period,estimate.consumption,Math.round(estimate.amount*100)/100,estimate.source,estimate.tariff_id,new Date().toISOString()])
}
export async function togglePaid(id,paid) {
  if(paid && query('SELECT needs_review FROM invoices WHERE id=?',[id])[0]?.needs_review) throw new Error('Показания изменились: начисление требует сверки. Восстановите показания или удалите счёт и создайте проверенное начисление вручную.')
  await run('UPDATE invoices SET is_paid=?,paid_at=? WHERE id=?',[paid?1:0,paid?new Date().toISOString():null,id]) }
export async function deleteInvoice(id) {
  if(query('SELECT is_paid FROM invoices WHERE id=?',[id])[0]?.is_paid) throw new Error('Сначала снимите отметку оплаты после сверки платежа')
  await run('DELETE FROM invoices WHERE id=?',[id])
}
export function getMonthTotal(period) { return query('SELECT COALESCE(SUM(amount),0) AS total,COALESCE(SUM(CASE WHEN is_paid=0 THEN amount ELSE 0 END),0) AS unpaid FROM invoices WHERE period=?',[period])[0] }
export function getMonthlyTotals(months=12) { return query('SELECT period,SUM(amount) AS total FROM invoices GROUP BY period ORDER BY period DESC LIMIT ?',[months]).reverse() }
export function getByService(period) { return query('SELECT s.name,s.color,SUM(i.amount) AS total FROM services s JOIN invoices i ON i.service_id=s.id WHERE i.period=? GROUP BY s.id HAVING total>0 ORDER BY total DESC',[period]) }
export {getSetting,setSetting}

export async function generateFixedInvoices(period) {
  validPeriod(period)
  const planned=getServices().filter(s=>s.enabled && !isVolumeService(s) && getTariff(s.id,period+'-01')).filter(s=>!getInvoices(period).some(i=>i.service_id===s.id)).map(s=>({service_id:s.id,...invoiceEstimate(s.id,period)}))
  await transaction(exec=>{for(const bill of planned) exec('INSERT INTO invoices(service_id,period,consumption,amount,source,tariff_id,created_at) VALUES(?,?,?,?,?,?,?)',[bill.service_id,period,0,bill.amount,'fixed',bill.tariff_id,new Date().toISOString()])})
  return planned.length
}
