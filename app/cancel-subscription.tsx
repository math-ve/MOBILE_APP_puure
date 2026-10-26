import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { FlowScreen, Hero, InfoCard } from '../components/ds/Flow'
import ChoiceRow from '../components/ds/ChoiceRow'
import PillButton from '../components/ds/PillButton'
import RescheduleSheet, { RescheduleOutcome } from '../components/subscription/RescheduleSheet'
import PauseSheet from '../components/subscription/PauseSheet'
import { CancelReason, subscriptionApi, SubscriptionDetail } from '../lib/subscriptionApi'
import { sendSupportTicket } from '../lib/support'
import { formatCurrency, formatDate, formatFrequency } from '../lib/i18n/format'
import { addDays, addMonths, toLocalISODate } from '../lib/dates'
import { track } from '../lib/analytics'
import { ds, typography } from '../lib/theme'

// Parcours d'annulation (maquettes P27 → P30, P37 → P39, P22) :
// motif → solution adaptée au motif → confirmation. Le motif est transmis à
// Appstle avec l'annulation, et chaque étape alimente les statistiques.

type Step = 'reason' | 'offer' | 'confirm'

const REASONS: CancelReason[] = ['incompatible', 'stock', 'price', 'moving', 'unwanted', 'other']

export default function CancelSubscriptionScreen() {
  const { t } = useTranslation()
  const { contractId } = useLocalSearchParams<{ contractId: string }>()

  const [detail, setDetail] = useState<SubscriptionDetail | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [step, setStep] = useState<Step>('reason')
  const [reason, setReason] = useState<CancelReason | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'reschedule' | 'pause' | null>(null)

  useEffect(() => {
    if (!contractId) return
    subscriptionApi.detail(contractId).then(setDetail).catch(() => setLoadError(true))
    track('cancel_flow_started', {})
  }, [contractId])

  const sub = detail?.subscription
  const next = detail?.upcomingOrders?.[0] ?? null
  const nextDate = next?.billingDate ? new Date(next.billingDate) : sub?.next_billing_date ? new Date(sub.next_billing_date) : null
  const price = sub?.price_amount != null ? formatCurrency(Number(sub.price_amount), sub.price_currency ?? 'EUR') : '—'
  const offer = detail?.retentionOffer ?? null

  // Le motif « trop cher » n'a pas d'écran d'offre tant que la remise n'est pas activée.
  const hasOffer = (r: CancelReason) => r !== 'price' || !!offer

  const plan = useMemo(() => {
    const line = Array.isArray(sub?.contract_details_json) ? sub.contract_details_json[0] : null
    const variant = line?.variantTitle && line.variantTitle !== 'Default Title' ? line.variantTitle : null
    return [variant ?? sub?.product_name, formatFrequency(sub?.frequency_unit, sub?.frequency_value)].filter(Boolean).join(' · ')
  }, [sub])

  const chooseReason = (r: CancelReason) => {
    setReason(r)
    setError(null)
    track('cancel_flow_reason', { reason: r })
    setStep(hasOffer(r) ? 'offer' : 'confirm')
  }

  const back = () => {
    setError(null)
    if (step === 'confirm' && reason && hasOffer(reason)) return setStep('offer')
    if (step !== 'reason') return setStep('reason')
    router.back()
  }

  /** Le client garde son abonnement grâce à l'offre : on le note puis on affiche le résultat. */
  const saved = (outcome: string, params: Record<string, string>) => {
    track('cancel_flow_saved', { reason, outcome })
    router.replace({ pathname: '/done', params: { contractId, ...params } })
  }

  const attempt = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try { await fn() } catch { setError(t('care:errors.generic')) } finally { setBusy(null) }
  }

  const postponeOneMonth = () => attempt('postpone', async () => {
    if (!next || !nextDate) return
    const date = toLocalISODate(addMonths(nextDate, 1))
    await subscriptionApi.reschedule(contractId, String(next.id), date)
    saved('rescheduled', { kind: 'moved', date })
  })

  const applyDiscount = () => attempt('discount', async () => {
    const res = await subscriptionApi.applyRetentionDiscount(contractId)
    saved('discount', { kind: 'discount', percent: String(res.percent) })
  })

  const sendOther = () => attempt('other', async () => {
    const email = await sendSupportTicket({
      group: 'Subscription / Billing',
      category: 'subscription_/_billing__subscription_cancellation',
      message: comment,
      context: { 'Abonnement': `#${contractId} — ${sub?.product_name ?? ''}`, 'Intention': "Voulait annuler, a gardé l'abonnement" },
      source: 'cancel-flow',
    })
    saved('support', { kind: 'sentKeep', email })
  })

  const cancelNow = () => attempt('cancel', async () => {
    if (!reason) return
    await subscriptionApi.cancel(contractId, reason, comment.trim() || undefined)
    track('cancel_flow_cancelled', { reason })
    router.replace({ pathname: '/done', params: { kind: 'cancelled', contractId } })
  })

  const onRescheduled = (o: RescheduleOutcome) => {
    setSheet(null)
    if (o.kind === 'moved') saved('rescheduled', { kind: 'moved', date: o.date })
    else if (o.kind === 'skipped') {
      // Prochaine livraison après le saut : celle listée par Appstle, sinon une période plus tard.
      const every = Number(sub?.frequency_value ?? 1)
      const byWeek = String(sub?.frequency_unit ?? '').startsWith('week')
      const following = detail?.upcomingOrders?.[1]?.billingDate
        ?? (nextDate ? toLocalISODate(byWeek ? addDays(nextDate, 7 * every) : addMonths(nextDate, every)) : '')
      saved('skipped', { kind: 'moved', date: following })
    }
    else saved('order_now', { kind: 'moved', date: toLocalISODate(new Date()) })
  }

  const keep = () => {
    track('cancel_flow_kept', { reason, step })
    router.back()
  }

  if (loadError) {
    return (
      <FlowScreen title={t('care:cancel.header')} onBack={() => router.back()} centered
        actions={<PillButton label={t('common:back')} onPress={() => router.back()} />}>
        <Hero glyph="alert" tone="neutral" title={t('care:errors.generic')} />
      </FlowScreen>
    )
  }
  if (!detail) {
    return (
      <FlowScreen title={t('care:cancel.header')} onBack={() => router.back()} centered>
        <ActivityIndicator color={ds.blue} />
      </FlowScreen>
    )
  }

  const errorLine = error ? <Text style={styles.error}>{error}</Text> : null
  const anyway = <PillButton variant="quiet" label={t('care:cancel.anyway')} onPress={() => { setError(null); setStep('confirm') }} />

  // ── Étape 1 : le motif ───────────────────────────────────────
  if (step === 'reason') {
    return (
      <FlowScreen title={t('care:cancel.header')} onBack={back}
        actions={<PillButton variant="link" label={t('care:cancel.keep')} onPress={keep} />}>
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">{t('care:cancel.reasonTitle')}</Text>
          <Text style={styles.body}>{t('care:cancel.reasonBody')}</Text>
        </View>
        <View style={{ gap: 8 }}>
          {REASONS.map((r) => (
            <ChoiceRow key={r} asLink label={t(`care:cancel.reasons.${r}`)} selected={false} onPress={() => chooseReason(r)} />
          ))}
        </View>
      </FlowScreen>
    )
  }

  // ── Étape 3 : confirmation (P22) ─────────────────────────────
  if (step === 'confirm') {
    return (
      <FlowScreen title={t('care:cancel.header')} onBack={back} centered
        actions={<>
          {errorLine}
          <PillButton label={t('care:cancel.keep')} onPress={keep} />
          <PillButton variant="danger" label={t('care:cancel.confirm.cta')} loading={busy === 'cancel'} onPress={cancelNow} />
        </>}>
        <Hero glyph="alert" tone="red" title={t('care:cancel.confirm.title')} body={t('care:cancel.confirm.body')} />
      </FlowScreen>
    )
  }

  // ── Étape 2 : la solution adaptée au motif ───────────────────
  const offerScreen = (() => {
    switch (reason) {
      case 'stock':
        return {
          hero: <Hero glyph="calendar" title={t('care:cancel.stock.title')} body={t('care:cancel.stock.body')} />,
          content: nextDate ? <InfoCard rows={[
            { label: t('care:cancel.stock.next'), value: formatDate(nextDate) },
            { label: t('care:cancel.stock.plusMonth'), value: formatDate(addMonths(nextDate, 1)) },
          ]} /> : null,
          actions: next ? <>
            <PillButton label={t('care:cancel.stock.cta')} loading={busy === 'postpone'} onPress={postponeOneMonth} />
            <PillButton variant="link" label={t('care:cancel.stock.other')} onPress={() => setSheet('reschedule')} />
          </> : null,
        }
      case 'incompatible':
        return {
          hero: <Hero glyph="drop" title={t('care:cancel.incompatible.title')} body={t('care:cancel.incompatible.body')} />,
          content: <InfoCard><Text style={styles.cardText}>{t('care:cancel.incompatible.detail')}</Text></InfoCard>,
          actions: <PillButton label={t('care:cancel.incompatible.cta')} onPress={() => {
            track('cancel_flow_saved', { reason, outcome: 'filter_help' })
            router.push({ pathname: '/filter-help', params: { source: 'cancel', contractId } })
          }} />,
        }
      case 'price': {
        const amount = Number(sub?.price_amount ?? 0)
        const discounted = offer ? formatCurrency(amount * (1 - offer.percent / 100), sub?.price_currency ?? 'EUR') : price
        return {
          hero: <Hero glyph="check" title={t('care:cancel.price.title', { percent: offer?.percent })} body={t('care:cancel.price.body')} />,
          content: <InfoCard rows={[
            { label: t('care:cancel.price.usual'), value: price },
            { label: t('care:cancel.price.discounted'), value: discounted, strong: true },
          ]} />,
          actions: <PillButton label={t('care:cancel.price.cta', { percent: offer?.percent })} loading={busy === 'discount'} onPress={applyDiscount} />,
        }
      }
      case 'moving': {
        const a = detail.shippingAddress
        const place = a ? [a.zip, a.city].filter(Boolean).join(' ') : '—'
        return {
          hero: <Hero glyph="home" title={t('care:cancel.moving.title')} body={t('care:cancel.moving.body')} />,
          content: <InfoCard rows={[
            { label: t('care:cancel.moving.current'), value: place },
            ...(nextDate ? [{ label: t('care:cancel.moving.next'), value: formatDate(nextDate) }] : []),
          ]} />,
          actions: <PillButton label={t('care:cancel.moving.cta')} onPress={() => {
            track('cancel_flow_saved', { reason, outcome: 'address' })
            router.replace({ pathname: '/subscription-detail', params: { contractId, open: 'address' } })
          }} />,
        }
      }
      case 'unwanted':
        return {
          hero: <Hero glyph="pause" title={t('care:cancel.unwanted.title')} body={t('care:cancel.unwanted.body')} />,
          content: <InfoCard rows={[
            { label: t('care:cancel.unwanted.plan'), value: plan },
            { label: t('care:cancel.unwanted.price'), value: price },
          ]} />,
          actions: <PillButton label={t('care:cancel.unwanted.cta')} onPress={() => setSheet('pause')} />,
        }
      case 'other':
      default:
        return {
          hero: <Hero glyph="mail" title={t('care:cancel.other.title')} body={t('care:cancel.other.body')} />,
          content: (
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>{t('care:cancel.other.label')}</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder={t('care:cancel.other.placeholder')}
                placeholderTextColor={ds.muted}
                multiline
                maxLength={900}
                style={styles.textarea}
                accessibilityLabel={t('care:cancel.other.label')}
              />
            </View>
          ),
          actions: <PillButton label={t('care:cancel.other.cta')} loading={busy === 'other'} disabled={comment.trim().length < 10} onPress={sendOther} />,
        }
    }
  })()

  return (
    <>
      <FlowScreen title={t('care:cancel.header')} onBack={back} centered
        actions={<>{errorLine}{offerScreen.actions}{anyway}</>}>
        {offerScreen.hero}
        {offerScreen.content}
      </FlowScreen>
      {sheet === 'reschedule' && detail ? (
        <RescheduleSheet contractId={contractId} upcoming={detail.upcomingOrders} price={price} initial="custom"
          onClose={() => setSheet(null)} onDone={onRescheduled} />
      ) : null}
      {sheet === 'pause' ? (
        <PauseSheet contractId={contractId} source="cancel-flow" onClose={() => setSheet(null)}
          onPaused={() => { setSheet(null); saved('paused', { kind: 'paused' }) }} />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  head: { gap: 8, alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  title: { fontFamily: typography.fontFamily.medium, fontSize: 24, lineHeight: 29, color: ds.ink, textAlign: 'center' },
  body: { fontFamily: typography.fontFamily.regular, fontSize: 15, lineHeight: 22, color: ds.body, textAlign: 'center' },
  cardText: { fontFamily: typography.fontFamily.regular, fontSize: 15, lineHeight: 22, color: ds.body },
  label: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: ds.ink },
  textarea: {
    minHeight: 130, borderWidth: 1, borderColor: ds.line, borderRadius: 20, backgroundColor: ds.raised,
    padding: 16, fontFamily: typography.fontFamily.regular, fontSize: 16, color: ds.ink, textAlignVertical: 'top',
  },
  error: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center', marginBottom: 6 },
})
