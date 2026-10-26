import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { FlowScreen } from '../components/ds/Flow'
import ChoiceRow from '../components/ds/ChoiceRow'
import PillButton from '../components/ds/PillButton'
import { sendSupportTicket } from '../lib/support'
import { track } from '../lib/analytics'
import { ds, typography } from '../lib/theme'

// « Un problème avec ce colis ? » (maquette P36), depuis le suivi de livraison.
// Le ticket part avec le numéro de commande et le numéro de suivi.

type Issue = 'notReceived' | 'late' | 'damaged' | 'missing'

const ROUTING: Record<Issue, { group: string; category: string; fr: string }> = {
  notReceived: { group: 'Order / Delivery', category: 'order_/_delivery__order_not_received', fr: 'Indiqué livré mais pas reçu' },
  late: { group: 'Order / Delivery', category: 'order_/_delivery__delivery_delayed', fr: 'Colis en retard' },
  damaged: { group: 'Product issue', category: 'product_issue__damaged_on_arrival', fr: 'Colis abîmé' },
  missing: { group: 'Order / Delivery', category: 'order_/_delivery__missing_item', fr: 'Article manquant ou erroné' },
}

export default function ParcelProblemScreen() {
  const { t } = useTranslation()
  const { orderNumber, trackingNumber } = useLocalSearchParams<{ orderNumber?: string; trackingNumber?: string }>()

  const [issue, setIssue] = useState<Issue | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const send = async () => {
    if (!issue) return setNotice(t('care:parcel.needType'))
    setSending(true)
    setNotice(null)
    try {
      const r = ROUTING[issue]
      const email = await sendSupportTicket({
        group: r.group,
        category: r.category,
        message: details.trim() || r.fr,
        context: {
          'Problème': r.fr,
          'Commande': orderNumber ? `#${orderNumber}` : null,
          'Numéro de suivi': trackingNumber,
        },
        source: 'parcel-problem',
      })
      track('parcel_problem_sent', { issue })
      router.replace({ pathname: '/done', params: { kind: 'sent', email } })
    } catch {
      setNotice(t('care:errors.generic'))
    } finally {
      setSending(false)
    }
  }

  return (
    <FlowScreen
      title={t('care:parcel.header')}
      onBack={() => router.back()}
      actions={<>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <PillButton label={t('care:parcel.send')} loading={sending} onPress={send} />
      </>}
    >
      {orderNumber ? <Text style={styles.order}>{t('care:parcel.order', { number: `#${orderNumber}` })}</Text> : null}

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>{t('care:parcel.type')}</Text>
        {(Object.keys(ROUTING) as Issue[]).map((k) => (
          <ChoiceRow key={k} label={t(`care:parcel.types.${k}`)} selected={issue === k} onPress={() => setIssue(k)} />
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>{t('care:parcel.details')}</Text>
        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder={t('care:parcel.detailsPlaceholder')}
          placeholderTextColor={ds.muted}
          multiline
          maxLength={900}
          style={styles.textarea}
          accessibilityLabel={t('care:parcel.details')}
        />
      </View>
    </FlowScreen>
  )
}

const styles = StyleSheet.create({
  order: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.muted, textAlign: 'center' },
  label: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: ds.ink },
  textarea: {
    minHeight: 96, borderWidth: 1, borderColor: ds.line, borderRadius: 20, backgroundColor: ds.raised,
    padding: 16, fontFamily: typography.fontFamily.regular, fontSize: 16, color: ds.ink, textAlignVertical: 'top',
  },
  notice: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center', marginBottom: 6 },
})
