import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Sheet from '../ds/Sheet'
import PillButton from '../ds/PillButton'
import { supabase } from '../../lib/supabase'
import { ds, typography } from '../../lib/theme'
import { subscriptionApi, SubscriptionDetail } from '../../lib/subscriptionApi'

// « Moyen de paiement » (maquette P25) : la carte enregistrée et l'envoi d'un
// lien sécurisé Shopify pour en changer. Aucune donnée de carte ne passe par l'app.

const BRANDS: Record<string, { label: string }> = {
  visa: { label: 'VISA' },
  mastercard: { label: 'MC' },
  amex: { label: 'AMEX' },
  american_express: { label: 'AMEX' },
}

/** « Visa », « Mastercard » : nom de la marque pour la ligne de carte. */
export const brandName = (brand?: string | null) =>
  (brand ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

type Props = {
  contractId: string
  paymentMethod: SubscriptionDetail['paymentMethod']
  onClose: () => void
  /** Lien envoyé (ou déjà envoyé il y a moins de 24 h). */
  onSent: (info: { email: string; alreadySent: boolean }) => void
}

export default function PaymentSheet({ contractId, paymentMethod, onClose, onSent }: Props) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? ''))
  }, [])

  const brandKey = (paymentMethod?.brand ?? '').toLowerCase().replace(/\s+/g, '_')
  const brand = BRANDS[brandKey] ?? { label: (paymentMethod?.brand ?? '').toUpperCase() }
  const last4 = paymentMethod?.lastDigits ?? paymentMethod?.maskedNumber?.slice(-4) ?? null

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      const res = await subscriptionApi.sendPaymentLink(contractId)
      onSent({ email, alreadySent: !!res.alreadySent })
    } catch {
      setError(t('care:errors.generic'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet
      title={t('care:payment.title')}
      onClose={onClose}
      footer={<>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PillButton label={t('care:payment.cta')} loading={sending} disabled={!email} onPress={send} />
        <PillButton variant="quiet" label={t('care:payment.cancel')} onPress={onClose} />
      </>}
    >
      <View style={styles.card}>
        {paymentMethod && last4 ? (
          <>
            <View style={styles.brand}>
              <Text style={styles.brandText}>{brand.label || '•'}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.number}>{t('care:payment.card', { brand: brandName(paymentMethod.brand), last4 })}</Text>
              {paymentMethod.expiryMonth && paymentMethod.expiryYear ? (
                <Text style={styles.meta}>
                  {t('care:payment.expires', { month: String(paymentMethod.expiryMonth).padStart(2, '0'), year: paymentMethod.expiryYear })}
                  {paymentMethod.cardHolderName ? ` · ${paymentMethod.cardHolderName}` : ''}
                </Text>
              ) : null}
            </View>
          </>
        ) : (
          <Text style={styles.meta}>{t('care:payment.noCard')}</Text>
        )}
      </View>
      <Text style={styles.intro}>
        {t('care:payment.intro', { email: '\u0000' }).split('\u0000').map((part, i) => (
          <Text key={i}>{i > 0 && <Text style={styles.email}>{email}</Text>}{part}</Text>
        ))}
      </Text>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: ds.line, borderRadius: 20, padding: 16,
  },
  brand: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 54, alignItems: 'center', backgroundColor: ds.blue },
  brandText: { fontFamily: typography.fontFamily.bold, fontSize: 12, color: '#FFFFFF', letterSpacing: 0.5 },
  number: { fontFamily: typography.fontFamily.medium, fontSize: 16, color: ds.ink },
  meta: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: ds.muted },
  intro: { fontFamily: typography.fontFamily.regular, fontSize: 15, lineHeight: 22, color: ds.body, marginTop: 8, textAlign: 'center' },
  email: { fontFamily: typography.fontFamily.medium, color: ds.ink },
  error: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center', marginBottom: 6 },
})
