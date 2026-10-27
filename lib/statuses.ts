import theme from './theme'
import i18n from './i18n'

/**
 * Source unique des styles de badge de statut.
 * Le libellé n'est PAS stocké ici : il est résolu à l'affichage via i18n
 * (clé `status:*`) pour rester traduisible. Utiliser `statusLabel(key)`.
 */

export type StatusStyle = { bg: string; color: string }

const WARNING: StatusStyle = { bg: 'rgba(255,92,0,0.10)', color: theme.colors.warning }
const BLUE: StatusStyle = { bg: 'rgba(39,100,255,0.10)', color: theme.colors.blue }
const SUCCESS: StatusStyle = { bg: 'rgba(30,187,110,0.12)', color: theme.colors.success }
const ERROR: StatusStyle = { bg: 'rgba(227,44,43,0.10)', color: theme.colors.error }
const NEUTRAL: StatusStyle = { bg: 'rgba(35,48,86,0.08)', color: theme.colors.textMid }

/** Traduit une clé de statut (`status:*`). */
export function statusLabel(key: string): string {
  return i18n.t(`status:${key}`)
}

// ─── Commandes (orders.tsx) ────────────────────────────────

const ORDER_STYLES: Record<string, StatusStyle> = {
  unfulfilled: WARNING,
  fulfilled: BLUE,
  delivered: SUCCESS,
  cancelled: ERROR,
  shipped: BLUE,
}

const ORDER_KEYS: Record<string, string> = {
  unfulfilled: 'unfulfilled',
  fulfilled: 'fulfilled',
  delivered: 'delivered',
  cancelled: 'cancelled',
  shipped: 'inTransit',
}

export function getOrderStatus(status: string | null | undefined): StatusStyle & { label: string } {
  const k = status?.toLowerCase() ?? ''
  const style = ORDER_STYLES[k] ?? NEUTRAL
  const label = statusLabel(ORDER_KEYS[k] ?? 'inProgress')
  return { ...style, label }
}

// ─── Abonnements (subscription-detail.tsx) ──

const SUBSCRIPTION_STYLES: Record<string, StatusStyle> = {
  active: { bg: 'rgba(30,187,110,0.12)', color: theme.colors.success },
  paused: WARNING,
  cancelled: ERROR,
}

const SUBSCRIPTION_KEYS: Record<string, string> = {
  active: 'active',
  paused: 'paused',
  cancelled: 'cancelled',
}

/** Badge d'abonnement. `upper` met le libellé en capitales (ancien style). */
export function getSubscriptionStatus(
  status: string | null | undefined,
  upper = false,
): StatusStyle & { label: string } {
  const k = status?.toLowerCase() ?? 'cancelled'
  const style = SUBSCRIPTION_STYLES[k] ?? SUBSCRIPTION_STYLES.cancelled
  let label = statusLabel(SUBSCRIPTION_KEYS[k] ?? 'cancelled')
  if (upper) label = label.toLocaleUpperCase(i18n.language)
  return { ...style, label }
}
