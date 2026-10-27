import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Sheet from '../ds/Sheet'
import PillButton from '../ds/PillButton'
import RadioRow from '../ds/RadioRow'
import { GroupCard } from '../ds/Field'
import { sendSupportTicket } from '../../lib/support'
import { track } from '../../lib/analytics'
import { ds, typography } from '../../lib/theme'

// « Un problème avec ce colis ? » (maquette P36), ouvert depuis le suivi.
// Le ticket part avec le numéro de commande et le numéro de suivi.

type Issue = 'notReceived' | 'late' | 'damaged' | 'missing'

const ROUTING: Record<Issue, { group: string; category: string; fr: string }> = {
  notReceived: { group: 'Order / Delivery', category: 'order_/_delivery__order_not_received', fr: 'Indiqué livré mais pas reçu' },
  late: { group: 'Order / Delivery', category: 'order_/_delivery__delivery_delayed', fr: 'Colis en retard' },
  damaged: { group: 'Product issue', category: 'product_issue__damaged_on_arrival', fr: 'Colis abîmé' },
  missing: { group: 'Order / Delivery', category: 'order_/_delivery__missing_item', fr: 'Article manquant ou erroné' },
}
const ISSUES = Object.keys(ROUTING) as Issue[]

type Props = { orderNumber?: string; trackingNumber?: string; onClose: () => void }

export default function ParcelProblemSheet({ orderNumber, trackingNumber, onClose }: Props) {
  const { t } = useTranslation()
  const [issue, setIssue] = useState<Issue>('notReceived')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      const r = ROUTING[issue]
      const email = await sendSupportTicket({
        group: r.group,
        category: r.category,
        message: r.fr,
        context: { 'Problème': r.fr, 'Commande': orderNumber ? `#${orderNumber}` : null, 'Numéro de suivi': trackingNumber },
        source: 'parcel-problem',
      })
      track('parcel_problem_sent', { issue })
      onClose()
      router.push({ pathname: '/done', params: { kind: 'sent', email } })
    } catch {
      setError(t('care:errors.generic'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet
      title={t('care:parcel.header')}
      subtitle={orderNumber ? t('care:parcel.order', { number: `#${orderNumber}` }) : undefined}
      onClose={onClose}
      footer={<>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PillButton label={t('care:parcel.send')} loading={sending} onPress={send} />
      </>}
    >
      <GroupCard>
        {ISSUES.map((k, i) => (
          <RadioRow key={k} label={t(`care:parcel.types.${k}`)} selected={issue === k} onPress={() => setIssue(k)} last={i === ISSUES.length - 1} />
        ))}
      </GroupCard>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  error: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center', marginBottom: 6 },
})
