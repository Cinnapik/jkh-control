import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Gauge, Receipt, Coins, Settings as Cog, Home } from 'lucide-react'

const links = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard, end: true },
  { to: '/meters', label: 'Счётчики', icon: Gauge },
  { to: '/invoices', label: 'Начисления', icon: Receipt },
  { to: '/tariffs', label: 'Тарифы', icon: Coins },
  { to: '/settings', label: 'Настройки', icon: Cog }
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col p-4">
      <div className="flex items-center gap-3 px-2 py-4 mb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white">
          <Home size={22} />
        </div>
        <div>
          <div className="font-bold text-slate-800 leading-tight">ЖКХ Контроль</div>
          <div className="text-xs text-slate-400">Учёт коммунальных услуг</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>

    </aside>
  )
}
