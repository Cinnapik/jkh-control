import { useState } from 'react'
import { getServices, getTariffs, getTariff, setTariff, deleteTariff } from '../db/api.js'
import { formatMoney } from '../lib/format.js'
import PageHeader from '../components/PageHeader.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { Plus, Trash2 } from 'lucide-react'
function tariffText(t,unit) {
  if(!t) return 'Не задан'
  if(t.kind!=='tiered') return `${formatMoney(t.price)}/${unit}`
  const tiers=JSON.parse(t.tiers)
  return tiers.map((r,i)=>`${i?tiers[i-1].limit:0}–${r.limit??'∞'}: ${formatMoney(r.price)}`).join('; ')
}
export default function Tariffs() {
  const services=getServices()
  const [,refresh]=useState(0)
  const [serviceId,setServiceId]=useState(services[0]?.id || '')
  const [kind,setKind]=useState('flat')
  const [price,setPrice]=useState('')
  const [validFrom,setValidFrom]=useState(new Date().toLocaleDateString('sv-SE'))
  const [tiers,setTiers]=useState([{limit:150,price:2.86},{limit:800,price:6.55},{limit:null,price:10.52}])
  const [error,setError]=useState('')
  const [deleting,setDeleting]=useState(null)
  const electricity=services.find(s=>s.id===Number(serviceId))?.name==='Электричество'
  const tiered=electricity && kind==='tiered'
  function update(index,key,value) {setTiers(tiers.map((t,i)=>i===index?{...t,[key]:value===''?'':Number(value)}:t))}
  async function submit(e) {
    e.preventDefault()
    try {
      await setTariff({service_id:Number(serviceId),kind:tiered?'tiered':'flat',price:tiered?0:Number(price),valid_from:validFrom,tiers})
      setError('');setPrice('');refresh(n=>n+1)
    } catch(e) {setError(e.message)}
  }
  return <div className="p-8 max-w-5xl mx-auto">
    {deleting && <ConfirmDialog title="Удалить тариф?" onCancel={()=>setDeleting(null)} onConfirm={async()=>{try{await deleteTariff(deleting.id);setError('');refresh(n=>n+1)}catch(e){setError(e.message)}setDeleting(null)}}>{deleting.service_name}, с {deleting.valid_from}. Сохранённые начисления и платежи не изменятся. После удаления можно добавить правильный тариф на эту же дату.</ConfirmDialog>}
    <PageHeader title="Тарифы" subtitle="Стоимость услуг и история изменений"/>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={submit} className="card h-fit space-y-3">
        <h2 className="font-semibold text-slate-700">Новый тариф</h2>
        <label className="block text-sm text-slate-500">Услуга<select className="input mt-1" value={serviceId} onChange={e=>setServiceId(e.target.value)}>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {electricity && <label className="block text-sm text-slate-500">Тип тарифа<select className="input mt-1" value={kind} onChange={e=>setKind(e.target.value)}><option value="flat">Обычный</option><option value="tiered">Дифференцированный</option></select></label>}
        {tiered ? <><p className="text-xs text-slate-400">Пример: городская категория ЛНР без электроплиты и электроотопления, с 01.10.2026. Уточните ставки для своей категории.</p>{tiers.map((t,i)=><div key={i} className="space-y-1"><div className="text-sm text-slate-500">{i+1}-й диапазон: {i?`свыше ${tiers[i-1].limit}`:'от 0'} кВт·ч</div>{i<2 && <label className="block text-xs text-slate-500">До, кВт·ч<input required type="number" min="0.001" step="0.001" className="input" value={t.limit} onChange={e=>update(i,'limit',e.target.value)}/></label>}<label className="block text-xs text-slate-500">₽/кВт·ч<input required type="number" min="0" step="0.01" className="input" value={t.price} onChange={e=>update(i,'price',e.target.value)}/></label></div>)}</> : <label className="block text-sm text-slate-500">Цена за {services.find(s=>s.id===Number(serviceId))?.unit}<input type="number" min="0" step="0.01" required className="input mt-1" value={price} onChange={e=>setPrice(e.target.value)}/></label>}
        <label className="block text-sm text-slate-500">Действует с<input required type="date" className="input mt-1" value={validFrom} onChange={e=>setValidFrom(e.target.value)}/></label>
        {error && <p role="alert" className="text-red-500 text-sm">{error}</p>}
        <button className="btn-primary"><Plus size={18}/>Сохранить тариф</button>
      </form>
      <div className="lg:col-span-2 space-y-6">
        <div className="card"><h2 className="font-semibold mb-4">Действующие тарифы</h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{services.map(s=>{const t=getTariff(s.id);return <div key={s.id} className="p-3 rounded-xl bg-slate-50"><div className="flex items-center gap-2 text-sm"><span className="w-2 h-2 rounded-full" style={{background:s.color}}/>{s.name}</div><div className="font-medium mt-1">{t?.kind==='tiered'?'3 диапазона':tariffText(t,s.unit)}</div>{t?.kind==='tiered' && <p className="text-xs text-slate-500 mt-1">{tariffText(t,s.unit)}</p>}</div>})}</div></div>
        <div className="card overflow-x-auto"><h2 className="font-semibold mb-4">История тарифов</h2>{!getTariffs().length?<p className="text-slate-400">Тарифы ещё не заданы</p>:<table className="w-full text-sm text-left"><thead className="text-slate-400"><tr><th className="py-2">Услуга</th><th>Цена / диапазоны</th><th>Действует с</th><th><span className="sr-only">Действия</span></th></tr></thead><tbody>{getTariffs().map(t=><tr key={t.id} className="border-t border-slate-100"><td className="py-3">{t.service_name}</td><td>{tariffText(t,t.unit)}</td><td>{t.valid_from}</td><td className="text-right"><button type="button" aria-label="Удалить тариф" title="Удалить тариф" className="p-2 text-slate-400 hover:text-red-500" onClick={()=>setDeleting(t)}><Trash2 size={16}/></button></td></tr>)}</tbody></table>}</div>
      </div>
    </div>
  </div>
}
