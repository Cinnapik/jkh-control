import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  getMonthTotal, getMonthlyTotals, getByService, getInvoices
} from '../db/api.js'
import { formatMoney, formatPeriod, shortPeriod, currentPeriod } from '../lib/format.js'
import PageHeader from '../components/PageHeader.jsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import { Wallet, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function Dashboard() {
  const [period,setPeriod] = useState(currentPeriod())
  // Пересчитываем данные каждый раз, когда открывается дашборд,
  // чтобы отражались свежие начисления/оплаты.
  const key = useLocation().key

  const { total, unpaid } = useMemo(() => getMonthTotal(period), [period, key])
  const monthly = useMemo(() => getMonthlyTotals(12), [key])
  const byService = useMemo(() => getByService(period), [period, key])
  const unpaidInvoices = useMemo(
    () => getInvoices(period).filter((i) => !i.is_paid),
    [period, key]
  )

  const chartData = monthly.map((m) => ({
    name: shortPeriod(m.period),
    total: Math.round(m.total)
  }))

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title="Дашборд"
        subtitle={`Обзор за ${formatPeriod(period)}`}
      />

      <input aria-label="Расчётный месяц" type="month" className="input max-w-xs mb-5" value={period} onChange={e=>setPeriod(e.target.value)} />
      {/* KPI карточки */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <div className="flex items-center gap-3 text-slate-400 mb-2">
            <Wallet size={18} /> Начислено за месяц
          </div>
          <div className="text-3xl font-bold text-slate-800">{formatMoney(total)}</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3 text-slate-400 mb-2">
            <AlertCircle size={18} /> К оплате
          </div>
          <div className="text-3xl font-bold text-red-500">{formatMoney(unpaid)}</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3 text-slate-400 mb-2">
            <CheckCircle2 size={18} /> Оплачено
          </div>
          <div className="text-3xl font-bold text-green-500">{formatMoney(total - unpaid)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* График расходов */}
        <div className="card lg:col-span-2">
          <h2 className="font-semibold text-slate-700 mb-4">Расходы по месяцам</h2>
          {chartData.length === 0 ? (
            <Empty text="Пока нет данных. Добавьте начисления." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={50} />
                <Tooltip
                  formatter={(v) => formatMoney(v)}
                  cursor={{ fill: 'rgba(59,130,246,0.08)' }}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Разбивка по услугам */}
        <div className="card">
          <h2 className="font-semibold text-slate-700 mb-4">По услугам</h2>
          {byService.length === 0 ? (
            <Empty text="Нет начислений" />
          ) : (
            <div className="space-y-3">
              {byService.map((s) => (
                <div key={s.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{s.name}</span>
                    <span className="font-medium">{formatMoney(s.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (s.total / byService[0].total) * 100)}%`,
                        backgroundColor: s.color
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Неоплаченные счета */}
      <div className="card mt-6">
        <h2 className="font-semibold text-slate-700 mb-4">Неоплаченные счета за {formatPeriod(period)}</h2>
        {unpaidInvoices.length === 0 ? (
          <Empty text={getInvoices(period).length ? "Все счета оплачены" : "Нет начислений за выбранный период"} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {unpaidInvoices.map((i) => (
              <li key={i.id} className="flex justify-between py-3">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: i.color }} />
                  {i.service_name}
                </span>
                <span className="font-medium text-red-500">{formatMoney(i.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Empty({ text }) {
  return <div className="text-center text-slate-300 py-8">{text}</div>
}
