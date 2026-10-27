import { useState } from 'react'
import {
  getServices, getReadings, getPreviousReading, addReading, updateReading, deleteReading
} from '../db/api.js'
import { formatNumber, formatPeriod, currentPeriod } from '../lib/format.js'
import PageHeader from '../components/PageHeader.jsx'
import { Gauge, Plus, Pencil, Trash2 } from 'lucide-react'

import ConfirmDialog from '../components/ConfirmDialog.jsx'

export default function Meters() {
  const services = getServices().filter((s) => s.has_meter && s.meter_enabled)
  const [selected, setSelected] = useState(services[0]?.id || null)
  const [, forceUpdate] = useState(0)
  const refresh = () => forceUpdate((n) => n + 1)

  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')
  const [value, setValue] = useState('')
  const [period, setPeriod] = useState(currentPeriod())

  const current = services.find((s) => s.id === selected)
  const readings = selected ? getReadings(selected) : []

  async function submit(e) {
    e.preventDefault()
    if (!selected || value === '') return
    try {
      await (editing ? updateReading : addReading)({ id: editing, service_id: selected, value: Number(value), period })
      setValue(''); setEditing(null); setError(''); refresh()
    } catch(e) { setError(e.message) }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader title="Счётчики" subtitle="Внесение показаний и история расхода" />
      {error && <p role="alert" className="text-red-500 mb-4">{error}</p>}
      {deleting && <ConfirmDialog title="Удалить показание?" onCancel={() => setDeleting(null)} onConfirm={async () => { try { await deleteReading(deleting); setError(''); refresh() } catch(e) { setError(e.message) } setDeleting(null) }}>Расход соседних периодов будет пересчитан. Неоплаченные связанные счета обновятся; если данных недостаточно, счета сохранятся с отметкой «Требует сверки». Оплаченные счета защищены от изменений.</ConfirmDialog>}

      {services.length === 0 ? (
        <div className="card text-slate-400">Включите установленные счётчики в настройках «Мои счётчики».</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Список счётчиков */}
          <div className="space-y-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelected(s.id); setEditing(null); setValue(''); setError('') }}
                className={'w-full text-left card flex items-center gap-3 transition ' +
                  (selected === s.id ? 'ring-2 ring-brand-500' : 'hover:shadow-md')}
              >
                <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
                  style={{ background: s.color }}>
                  <Gauge size={18} />
                </span>
                <div>
                  <div className="font-medium text-slate-700">{s.name}</div>
                  <div className="text-xs text-slate-400">{s.unit}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Форма и история */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={submit} className="card">
              <h2 className="font-semibold text-slate-700 mb-4">
                {editing ? 'Редактирование' : 'Новое показание'} · {current?.name}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-slate-500">Период</label>
                  <input type="month" required disabled={!!editing} className="input mt-1"
                    value={period} onChange={(e) => setPeriod(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-slate-500">Показание ({current?.unit})</label>
                  <input type="number" min="0" required step="0.001" className="input mt-1"
                    value={value} onChange={(e) => setValue(e.target.value)}
                    placeholder="0" />
                </div>
              </div>
              <button className="btn-primary mt-4"><Plus size={18} /> {editing ? 'Сохранить' : 'Добавить показание'}</button>
              {editing && <button type="button" className="btn-ghost ml-2" onClick={() => { setEditing(null); setValue('') }}>Отмена</button>}
              <p className="text-xs text-slate-400 mt-3">Первое показание задаёт начальную точку. Для месячного расхода нужны показания за соседние месяцы. При сохранении связанные неоплаченные счета пересчитываются. Ручные начисления сверяйте отдельно.</p>
            </form>

            <div className="card">
              <h2 className="font-semibold text-slate-700 mb-4">История показаний</h2>
              {readings.length === 0 ? (
                <div className="text-center text-slate-300 py-6">Пока нет показаний</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-left">
                      <th className="py-2">Период</th>
                      <th className="py-2">Показание</th>
                      <th className="py-2">Расход</th><th><span className="sr-only">Действия</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.map((r) => {
                      const prev = getPreviousReading(selected, r.period)
                      const diff = r.value - prev
                      return (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="py-2">{formatPeriod(r.period)}</td>
                          <td className="py-2">{formatNumber(r.value)} {current?.unit}</td>
                          <td className="py-2 text-brand-600 font-medium">
                            {prev !== null ? `${formatNumber(diff)} ${current?.unit}` : '—'}
                          </td>
                          <td className="text-right"><button aria-label="Редактировать показание" className="p-2 text-slate-400 hover:text-brand-600" onClick={() => { setEditing(r.id); setPeriod(r.period); setValue(String(r.value)) }}><Pencil size={16}/></button><button aria-label="Удалить показание" className="p-2 text-slate-400 hover:text-red-500" onClick={() => setDeleting(r)}><Trash2 size={16}/></button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
