import { ds } from './theme'
import { statusLabel } from './statuses'

// Présentation d'une commande façon maquette (P10) : vignette produit,
// titre, statut coloré.

const CARTRIDGE_IMAGE = 'https://cdn.shopify.com/s/files/1/0897/2963/0553/files/d883e817-e00c-42c8-9168-770ea86c4934_cec9e241-2790-4d69-a0d9-314dfde990b2.png?v=1765195045&width=200'

export function orderItems(order: any): any[] {
  return Array.isArray(order?.line_items) ? order.line_items : []
}

/** Vignette selon le produit principal de la commande. */
export function orderImage(order: any): { uri: string } | number {
  const title = orderItems(order).map((i) => String(i.title ?? '')).join(' ').toLowerCase()
  if (/under.?sink|sous.?évier/.test(title)) return require('../assets/products/under-sink-system.png')
  if (/shower|douche/.test(title) && /system|kit/.test(title)) return require('../assets/products/shower-system.png')
  if (/tap system|tap filter kit|starter kit/.test(title)) return require('../assets/products/tap-system.png')
  return { uri: CARTRIDGE_IMAGE }
}

/** Titre : le produit principal (hors garanties et options). */
export function orderTitle(order: any): string {
  const items = orderItems(order).filter((i) => !/guarantee|warranty|tip$/i.test(String(i.title ?? '')))
  const main = items.find((i) => /system|kit/i.test(String(i.title))) ?? items[0]
  return String(main?.title ?? '').replace(/^Puure®?\s*3\.0\s*/i, 'Puure® 3.0 ').trim() || '—'
}

const STATUS: Record<string, { key: string; color: string }> = {
  unfulfilled: { key: 'unfulfilled', color: '#A4670A' },
  fulfilled: { key: 'fulfilled', color: ds.blue },
  shipped: { key: 'inTransit', color: ds.blue },
  delivered: { key: 'delivered', color: ds.muted },
  cancelled: { key: 'cancelled', color: ds.red },
}

export function orderStatus(order: any): { label: string; color: string } {
  const s = STATUS[String(order?.status ?? '').toLowerCase()] ?? { key: 'inProgress', color: ds.muted }
  return { label: statusLabel(s.key), color: s.color }
}
