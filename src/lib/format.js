// Утилиты форматирования для русского интерфейса.

export function formatMoney(value, currency = '₽') {
  const n = Number(value || 0)
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

// 'YYYY-MM' -> 'Март 2026'
export function formatPeriod(period) {
  if (!period) return ''
  const [y, m] = period.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

// Короткий период для графика: 'YYYY-MM' -> 'мар'
export function shortPeriod(period) {
  if (!period) return ''
  const m = Number(period.split('-')[1])
  return MONTHS[m - 1].slice(0, 3).toLowerCase()
}

// Текущий период 'YYYY-MM'
export function currentPeriod() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
