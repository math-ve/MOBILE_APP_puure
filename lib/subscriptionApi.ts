import { supabase } from './supabase'
import { track } from './analytics'

// Client de l'Edge Function subscription-api : toutes les actions d'abonnement
// passent par là (jeton de session envoyé, propriété du contrat vérifiée côté serveur).

const ENDPOINT = 'https://vwlqdrrlggolgdssdwoh.supabase.co/functions/v1/subscription-api'

export type CancelReason = 'incompatible' | 'stock' | 'price' | 'moving' | 'unwanted' | 'other'

export type SubscriptionDetail = {
  subscription: any | null
  upcomingOrders: any[]
  pastOrders: any[]
  shippingAddress: any | null
  paymentMethod: {
    brand: string | null
    lastDigits: string | null
    maskedNumber: string | null
    expiryMonth: number | null
    expiryYear: number | null
    cardHolderName: string | null
  } | null
  paymentFailedAt: string | null
}

export class SubscriptionApiError extends Error {}

async function call<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new SubscriptionApiError('session')
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...payload }),
  })
  let json: any = null
  try { json = await res.json() } catch { /* corps vide */ }
  if (!res.ok || json?.error) throw new SubscriptionApiError(json?.error ?? `HTTP ${res.status}`)
  return json as T
}

/** Action qui modifie l'abonnement : suivie dans les analytics, succès ou échec. */
async function mutate<T = any>(action: string, contractId: string, payload: Record<string, unknown> = {}, screen = 'subscription-detail') {
  try {
    const result = await call<T>(action, { contractId, ...payload })
    track('subscription_action', { action, success: true, screen_source: screen })
    return result
  } catch (e) {
    track('subscription_action', { action, success: false, screen_source: screen })
    throw e
  }
}

export const subscriptionApi = {
  sync: () => call<{ success: boolean; synced: number }>('sync'),
  detail: (contractId: string) => call<SubscriptionDetail>('detail', { contractId }),

  skip: (contractId: string, attemptId: string) => mutate('skip', contractId, { attemptId }),
  orderNow: (contractId: string, attemptId: string) => mutate('order-now', contractId, { attemptId }),
  reschedule: (contractId: string, attemptId: string, newBillingDate: string, rescheduleAllUpcoming = false) =>
    mutate('reschedule', contractId, { attemptId, newBillingDate, rescheduleAllUpcoming }),

  updateFrequency: (contractId: string, billingIntervalCount: number) =>
    mutate('update-frequency', contractId, { billingIntervalCount }),
  updateAddress: (contractId: string, address: Record<string, unknown>) =>
    mutate('update-address', contractId, { address }),
  applyDiscount: (contractId: string, discountCode: string) =>
    mutate('apply-discount', contractId, { discountCode }),

  pause: (contractId: string, screen?: string) => mutate('pause', contractId, {}, screen),
  resume: (contractId: string, screen?: string) => mutate('resume', contractId, {}, screen),
  cancel: (contractId: string, reason: CancelReason, comment?: string) =>
    mutate<{ success: boolean; status: string }>('cancel', contractId, { reason, comment }),

  sendPaymentLink: (contractId: string) =>
    mutate<{ success: boolean; alreadySent: boolean; sentAt: string }>('payment-link', contractId),
}
