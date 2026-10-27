export function validPeriod(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Укажите корректный расчётный месяц')
}
export function nonnegative(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error('Значение должно быть конечным неотрицательным числом')
}
export function validateTariff(t) {
  nonnegative(t.price)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.valid_from) || new Date(t.valid_from).toISOString().slice(0,10) !== t.valid_from) throw new Error('Укажите корректную дату тарифа')
  if (t.kind === 'tiered') {
    if (!Array.isArray(t.tiers) || t.tiers.length !== 3) throw new Error('Укажите три диапазона')
    t.tiers.forEach(r => nonnegative(r.price))
    if (!(t.tiers[0].limit > 0 && t.tiers[1].limit > t.tiers[0].limit && Number.isFinite(t.tiers[1].limit))) throw new Error('Границы диапазонов должны возрастать')
  }
}
export function calculateCost(consumption, tariff) {
  nonnegative(consumption)
  if (!tariff) throw new Error('На этот период не задан тариф')
  if (tariff.kind !== 'tiered') return Math.round(consumption * tariff.price * 100) / 100
  const tiers = typeof tariff.tiers === 'string' ? JSON.parse(tariff.tiers) : tariff.tiers
  let previous = 0, total = 0
  tiers.forEach((tier, index) => {
    const limit = index === 2 ? Infinity : tier.limit
    total += Math.max(0, Math.min(consumption, limit) - previous) * tier.price
    previous = limit
  })
  return Math.round((total + Number.EPSILON) * 100) / 100
}
