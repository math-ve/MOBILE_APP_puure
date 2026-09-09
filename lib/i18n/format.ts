import i18n from './index'

// Locale complète utilisée pour Intl (dates, nombres, devises).
const LOCALE_MAP: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  de: 'de-DE',
}

function currentLocale(): string {
  return LOCALE_MAP[i18n.language] ?? LOCALE_MAP.fr
}

/** Date longue : 9 septembre 2026 / 9 September 2026 / 9. September 2026 */
export function formatDate(
  iso: string | number | Date,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(currentLocale(), opts)
}

/** Date courte : 9 sept. / 9 Sept / 9. Sept. */
export function formatDateShort(iso: string | number | Date): string {
  return formatDate(iso, { day: 'numeric', month: 'short' })
}

/** Heure : 14h30 (fr) / 14:30 (en, de) */
export function formatTime(iso: string | number | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d.getTime())) return ''
  const t = d.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
  return i18n.language === 'fr' ? t.replace(':', 'h') : t
}

/** Date + heure : "9 septembre à 14h30" */
export function formatDateTime(iso: string | number | Date): string {
  const date = formatDateShort(iso)
  const time = formatTime(iso)
  if (!date) return ''
  return i18n.t('common:dateAtTime', { date, time, defaultValue: `${date} · ${time}` })
}

/** Montant en devise. `value` en unités principales (pas en centimes). */
export function formatCurrency(value: number, currency = 'EUR'): string {
  if (typeof value !== 'number' || isNaN(value)) return ''
  return new Intl.NumberFormat(currentLocale(), {
    style: 'currency',
    currency,
  }).format(value)
}
