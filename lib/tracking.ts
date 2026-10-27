import { supabase } from './supabase'
import i18n from './i18n'
import { formatDate } from './i18n/format'

// Suivi de colis (17track via scrape-tracking) : récupération, étapes et
// libellés façon maquette (P11, P16).

const SUPABASE_URL = 'https://vwlqdrrlggolgdssdwoh.supabase.co'

export type TrackingEvent = { time: string | null; description: string | null; location: string | null }

export type TrackingData = {
  tracking_number: string
  status: string | null
  estimated_delivery: string | null
  latest_event: TrackingEvent | null
  events: TrackingEvent[]
}

// Dernier suivi chargé, pour ouvrir l'historique complet sans recharger.
const cache = new Map<string, TrackingData>()
export const cachedTracking = (n: string) => cache.get(n) ?? null

export async function fetchTracking(trackingNumber: string): Promise<TrackingData | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const res = await fetch(`${SUPABASE_URL}/functions/v1/scrape-tracking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ tracking_number: trackingNumber }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json || json.error) return null
  const data: TrackingData = { ...json, events: (json.events ?? []).filter((e: TrackingEvent) => e.description) }
  cache.set(trackingNumber, data)
  return data
}

/** Étape de la frise Expédiée → En route → Livrée (0, 1 ou 2). */
export function trackingStep(status: string | null): 0 | 1 | 2 {
  switch (status) {
    case 'Delivered': return 2
    case 'InTransit': case 'OutForDelivery': case 'AvailableForPickup': case 'Exception': case 'DeliveryFailure': return 1
    default: return 0
  }
}

/** Libellé en capitales au-dessus du titre. */
export function trackingLabel(status: string | null): { text: string; tone: 'blue' | 'red' | 'muted' } {
  const k = status ?? 'InfoReceived'
  const tone = k === 'Exception' || k === 'DeliveryFailure' ? 'red' : k === 'Delivered' ? 'muted' : 'blue'
  return { text: i18n.t(`trackingDs:status.${k}`, { defaultValue: i18n.t('trackingDs:status.InTransit') }), tone }
}

function dayDiff(d: Date): number {
  const a = new Date(); a.setHours(0, 0, 0, 0)
  const b = new Date(d); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** Grand titre : « Livraison prévue demain, vendredi 13 novembre », « Livrée le … ». */
export function trackingHeadline(data: TrackingData): string {
  if (data.status === 'Delivered') {
    const when = data.latest_event?.time
    return when
      ? i18n.t('trackingDs:deliveredOn', { date: formatDate(when, { weekday: 'long', day: 'numeric', month: 'long' }) })
      : i18n.t('trackingDs:status.Delivered')
  }
  if (data.estimated_delivery) {
    const d = new Date(data.estimated_delivery)
    const full = formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })
    const diff = dayDiff(d)
    if (diff === 0) return i18n.t('trackingDs:expectedToday')
    if (diff === 1) return i18n.t('trackingDs:expectedTomorrow', { date: full })
    if (diff > 1) return i18n.t('trackingDs:expectedOn', { date: full })
  }
  return data.latest_event?.description ?? i18n.t('trackingDs:status.InTransit')
}

/** « Aujourd'hui, 07:12 », « Hier, 19:40 », « 10 nov., 16:22 ». */
export function eventTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diff = dayDiff(d)
  // Heure au format 07:12 (maquette), quelle que soit la langue.
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (diff === 0) return i18n.t('trackingDs:todayAt', { time })
  if (diff === -1) return i18n.t('trackingDs:yesterdayAt', { time })
  return `${formatDate(d, { day: 'numeric', month: 'short' })}, ${time}`
}
