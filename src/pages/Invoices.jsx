import { useState } from 'react'
import {
  getServices, getInvoices, addInvoice, togglePaid, deleteInvoice,
  invoiceEstimate, generateFixedInvoices, isVolumeService
} from '../db/api.js'
import { formatMoney, formatPeriod, currentPeriod } from '../lib/format.js'
import PageHeader from '../components/PageHeader.jsx'
import { Plus, Trash2, Check, Calculator, CalendarPlus } from 'lucide-react'

export default function Invoices() {
  const services = getServices().filter(s=>s.enabled)
  const [, forceUpdate] = useState(0)
  const refresh = () => forceUpdate((n) => n + 1)

  const [period, setPeriod] = useState(currentPeriod())
  const [serviceId, setServiceId] = useState(services[0]?.id || '')
  const [consumption, setConsumption] = useState('')
  const [amount, setAmount] = useState('')
  const [automatic,setAutomatic]=useState(false)
  const [mode,setMode]=useState('manual')
  const service=services.find(s=>s.id===Number(serviceId))
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  const invoices = getInvoices()

  // Автоподстановка расхода и суммы по показаниям + тарифу
  function autofill(sid, per) {
    try {
      const estimate=invoiceEstimate(Number(sid),per,services.find(s=>s.id===Number(sid))?.name==='Водоотведение' && consumption!=='' ? Number(consumption) : undefined)
      setConsumption(String(estimate.consumption));setAmount(String(estimate.amount));setAutomatic(true);setError('')
    } catch(e) {setConsumption('');setAmount('');setAutomatic(false);setError(e.message)}
  }

  async function submit(e) {
    e.preventDefault()
    if (!serviceId || amount === '') return
    try { await addInvoice({
      service_id: Number(serviceId),
      period,
      consumption: Number(consumption || 0),
      amount: Number(amount), automatic
    })
    setConsumption(''); setAmount('')
    setAutomatic(false);setError('');refresh()
    } catch(e) {setError(e.message)}
  }

  // Группировка счетов по периодам
  const grouped = invoices.reduce((acc, i) => {
    (acc[i.period] ||= []).push(i)
    return acc
  }, {})

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader title="Начисления и платежи" subtitle="Счета по месяцам" />

      {notice && <p className="text-sm text-slate-500 mb-3">{notice}</p>}
      {error && <p role="alert" className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={submit} className="card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5"><h2 className="font-semibold text-slate-700">Новое начисление</h2><div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Способ начисления">{[['manual','Вручную'],['tariff','По тарифу']].map(([value,label])=><button type="button" key={value} aria-pressed={mode===value} className={'px-3 py-1.5 rounded-md text-sm transition '+(mode===value?'bg-white text-brand-600 shadow-sm':'text-slate-500 hover:text-slate-700')} onClick={()=>{setMode(value);setError('');if(value==='tariff')autofill(serviceId,period);else setAutomatic(false)}}>{label}</button>)}</div></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-sm text-slate-500">Период</label>
            <input type="month" required className="input mt-1" value={period}
              onChange={(e) => { setPeriod(e.target.value);if(mode==='tariff')autofill(serviceId,e.target.value) }} />
          </div>
          <div>
            <label className="text-sm text-slate-500">Услуга</label>
            <select className="input mt-1" value={serviceId}
              onChange={(e) => { setServiceId(e.target.value);setConsumption('');setAmount('');setAutomatic(false);if(mode==='tariff' && services.find(s=>s.id===Number(e.target.value))?.name!=='Водоотведение')autofill(e.target.value,period) }}>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-500">Расход{isVolumeService(service) ? `, ${service.unit}` : ''}</label>
            <input type="number" min="0" disabled={!isVolumeService(service) || (mode==='tariff' && !!service?.has_meter)} step="0.001" className="input mt-1" value={consumption}
              onChange={(e) => {setConsumption(e.target.value);if(mode==='tariff'){setAutomatic(false);setAmount('')}}} placeholder="авто" />
          </div>
          <div>
            <label className="text-sm text-slate-500">Сумма</label>
            <input type="number" min="0" required readOnly={mode==='tariff'} step="0.01" className="input mt-1" value={amount}
              onChange={(e) => {setAmount(e.target.value);setAutomatic(false)}} placeholder="0.00" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5">{mode==='tariff' && <button type="button" className="btn-ghost border border-slate-200 text-sm" onClick={()=>autofill(serviceId,period)}><Calculator size={16}/>Рассчитать</button>}<button disabled={!services.length || (mode==='tariff' && !automatic)} className="btn-primary text-sm disabled:opacity-40"><Plus size={16}/>Добавить начисление</button></div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 mb-5"><span className="text-sm text-slate-500">Фиксированные услуги · {formatPeriod(period)}</span><button type="button" className="btn-ghost border border-slate-200 bg-white text-sm" onClick={async()=>{try{const count=await generateFixedInvoices(period);refresh();setError('');setNotice(`Создано начислений: ${count}. Существующие счета пропущены.`)}catch(e){setError(e.message)}}}><CalendarPlus size={16}/>Сформировать</button></div>
      {Object.keys(grouped).length === 0 ? (
        <div className="card text-center text-slate-300 py-8">Пока нет начислений</div>
      ) : (
        Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([per, list]) => {
          const total = list.reduce((s, i) => s + i.amount, 0)
          return (
            <div key={per} className="card mb-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-slate-700">{formatPeriod(per)}</h3>
                <span className="text-slate-500">Итого: <b>{formatMoney(total)}</b></span>
              </div>
              <ul className="divide-y divide-slate-100">
                {list.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-3">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: i.color }} />
                      {i.service_name}
                      {i.needs_review ? <span className="text-xs text-red-500">Требует сверки показаний; сохранена прежняя сумма</span> : null}
                      {i.consumption > 0 && (
                        <span className="text-xs text-slate-400">({i.consumption} {i.unit})</span>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className={'font-medium ' + (i.is_paid ? 'text-green-500' : 'text-slate-700')}>
                        {formatMoney(i.amount)}<span className="block text-xs text-slate-400">Оплачено: {formatMoney(i.is_paid ? i.amount : 0)}{i.paid_at ? ` · ${new Date(i.paid_at).toLocaleDateString('ru-RU')}` : ''}</span>
                      </span>
                      <button
                        onClick={async () => { try { await togglePaid(i.id, !i.is_paid); refresh();setError('') } catch(e) {setError(e.message)} }}
                        className={'btn text-sm px-3 py-1 ' +
                          (i.is_paid ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-500')}>
                        <Check size={14} /> {i.is_paid ? 'Оплачено' : 'Не оплачено'}
                      </button>
                      <button
                        onClick={async () => { try { await deleteInvoice(i.id); refresh();setError('') } catch(e) {setError(e.message)} }}
                        className="text-slate-300 hover:text-red-500">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      )}
    </div>
  )
}
