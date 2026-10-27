import i18n from './i18n'
import { formatCurrency } from './i18n/format'

// Libellés d'un abonnement façon maquette : « Recharge 6 mois »,
// « 2 cartouches · 59,95 € ».

export function contractLines(sub: any): any[] {
  const raw = sub?.contract_details_json ?? sub?.contractDetailsJSON
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

/** Nombre de cartouches par envoi : lu dans le SKU (« …-2CART-6M ») sinon la quantité. */
export function cartridgesPerDelivery(sub: any): number | null {
  const line = contractLines(sub)[0]
  const sku = String(line?.sku ?? '')
  const m = sku.match(/(\d+)\s*CART/i)
  if (m) return Number(m[1]) * Number(line?.quantity ?? 1)
  return line?.quantity ?? null
}

/** « 6 mois », « 2 semaines »… */
export function periodLabel(sub: any): string {
  const v = Number(sub?.frequency_value ?? 0)
  const u = String(sub?.frequency_unit ?? '').toLowerCase()
  if (!v) return ''
  const unit = u.startsWith('week') ? 'week' : u.startsWith('day') ? 'day' : 'month'
  return i18n.t(`water:plan.period_${unit}`, { count: v })
}

export function planTitle(sub: any): string {
  const period = periodLabel(sub)
  return period ? i18n.t('water:plan.title', { period }) : (sub?.product_name ?? '')
}

export function planPrice(sub: any): string {
  return sub?.price_amount != null ? formatCurrency(Number(sub.price_amount), sub.price_currency ?? 'EUR') : ''
}

export function planSubtitle(sub: any): string {
  const n = cartridgesPerDelivery(sub)
  const price = planPrice(sub)
  return [n ? i18n.t('water:plan.cartridges', { count: n }) : null, price || null].filter(Boolean).join(' · ')
}

export function planImage(sub: any): string | null {
  return contractLines(sub)[0]?.variantImage ?? null
}
