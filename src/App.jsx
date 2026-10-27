import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { initDatabase } from './db/database.js'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Meters from './pages/Meters.jsx'
import Invoices from './pages/Invoices.jsx'
import Tariffs from './pages/Tariffs.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    initDatabase()
      .then(() => setReady(true))
      .catch((e) => setError(String(e)))
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600">
        Ошибка запуска базы данных: {error}
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-400">
        Загрузка…
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/meters" element={<Meters />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/tariffs" element={<Tariffs />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
