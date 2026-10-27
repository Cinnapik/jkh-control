import { useState } from 'react'
import { getSetting, setSetting, getServices, saveServiceFlags } from '../db/api.js'
import { exportBytes, restoreBytes } from '../db/database.js'
import PageHeader from '../components/PageHeader.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { Save, Download } from 'lucide-react'

export default function Settings() {
  const [services,setServices]=useState(getServices)
  const [groupSaved,setGroupSaved]=useState('')
  const [savingGroup,setSavingGroup]=useState('')
  const [restore,setRestore]=useState(null)
  const [address, setAddress] = useState(getSetting('address') || '')
  const [area, setArea] = useState(getSetting('area') || '')
  const [currency, setCurrency] = useState(getSetting('currency') || '₽')
  const [saved, setSaved] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')

  async function save(e) {
    e.preventDefault()
    try { await setSetting('address', address)
    await setSetting('area', area)
    await setSetting('currency', currency)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    } catch(e) {setBackupMsg(e.message)}
  }

  async function backup() {
    const bytes = exportBytes()
    if (window.jkhAPI && bytes) {
      let res; try { res = await window.jkhAPI.backupDB(bytes) } catch(e) { setBackupMsg(e.message); return }
      setBackupMsg(res.ok ? `Сохранено: ${res.filePath}` : 'Отменено')
      setTimeout(() => setBackupMsg(''), 4000)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <PageHeader title="Настройки" subtitle="Данные квартиры и резервное копирование" />

      {restore && <ConfirmDialog title="Восстановить резервную копию?" onCancel={()=>setRestore(null)} onConfirm={async()=>{try{await restoreBytes(restore); window.location.reload()}catch(e){setBackupMsg(e.message);setRestore(null)}}}>Текущие данные будут заменены данными копии. Сначала сохраните резервную копию текущей базы.</ConfirmDialog>}
      {['Мои счётчики','Учитываемые услуги'].map((title,index)=>{
        const flag=index?'enabled':'meter_enabled'
        const rows=services.filter(s=>index || s.has_meter)
        const dirty=rows.some(s=>s[flag]!==getServices().find(current=>current.id===s.id)?.[flag])
        return <section className="card mb-6" key={title}>
          <h2 className="font-semibold mb-3">{title}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{rows.map(s=><label key={s.id} className="flex items-center justify-between gap-3 text-sm text-slate-600"><span>{s.name}</span><input type="checkbox" role="switch" className="meter-toggle" disabled={!!savingGroup} checked={!!s[flag]} onChange={e=>{setServices(services.map(row=>row.id===s.id?{...row,[flag]:e.target.checked?1:0}:row));setGroupSaved('')}}/></label>)}</div>
          <div className="flex items-center gap-3 mt-4"><button type="button" disabled={!dirty || !!savingGroup} className="btn-primary text-sm disabled:opacity-40" aria-label={`Сохранить: ${title}`} onClick={async()=>{setSavingGroup(flag);try{await saveServiceFlags(rows,flag);setGroupSaved(flag)}catch(e){setBackupMsg(e.message)}finally{setSavingGroup('')}}}><Save size={16}/>Сохранить</button>{groupSaved===flag && !dirty && <span className="text-green-500 text-sm">Сохранено ✓</span>}</div>
        </section>
      })}
      <form onSubmit={save} className="card mb-6">
        <h2 className="font-semibold text-slate-700 mb-4">Данные квартиры</h2>
        <label className="text-sm text-slate-500">Адрес</label>
        <input className="input mt-1 mb-3" value={address}
          onChange={(e) => setAddress(e.target.value)} placeholder="г. Москва, ул. ..." />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-slate-500">Площадь, м²</label>
            <input type="number" className="input mt-1" value={area}
              onChange={(e) => setArea(e.target.value)} placeholder="54" />
          </div>
          <div>
            <label className="text-sm text-slate-500">Валюта</label>
            <input className="input mt-1" value={currency}
              onChange={(e) => setCurrency(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary mt-4"><Save size={18} /> Сохранить</button>
        {saved && <span className="ml-3 text-green-500 text-sm">Сохранено ✓</span>}
      </form>

      <div className="card">
        <h2 className="font-semibold text-slate-700 mb-2">Резервное копирование</h2>
        <p className="text-slate-400 text-sm mb-4">
          Все данные хранятся локально на этом компьютере. Сделайте копию базы, чтобы не потерять историю.
        </p>
        <button onClick={backup} className="btn-ghost border border-slate-200">
          <Download size={18} /> Сохранить резервную копию
        </button>
        <label className="btn-ghost border border-slate-200 ml-2 cursor-pointer">Восстановить из копии<input type="file" accept=".sqlite,.db" className="hidden" onChange={async e=>{const file=e.target.files[0];if(file)setRestore(new Uint8Array(await file.arrayBuffer()));e.target.value=''}}/></label>
        {backupMsg && <p className="text-sm text-slate-500 mt-2">{backupMsg}</p>}
      </div>
    </div>
  )
}
