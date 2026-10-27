import { useEffect, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { FlowScreen, Hero } from '../components/ds/Flow'
import PillButton from '../components/ds/PillButton'
import { GlyphName } from '../components/ds/Glyph'
import { formatDate } from '../lib/i18n/format'
import { subscriptionApi } from '../lib/subscriptionApi'
import { useToast } from '../hooks/useToast'
import { track } from '../lib/analytics'

// Écran de fin des parcours (maquettes P26, P35, P41, P42) : ce qui vient de
// se passer et la suite. Paramètres : kind + email / date / percent / contractId.

type Kind = 'paused' | 'cancelled' | 'link' | 'linkAlready' | 'sent' | 'sentKeep' | 'moved' | 'discount'

const HERO: Record<Kind, { glyph: GlyphName; tone: 'blue' | 'neutral'; solid?: boolean }> = {
  paused: { glyph: 'pause', tone: 'blue' },
  cancelled: { glyph: 'check', tone: 'blue' },
  link: { glyph: 'mail', tone: 'blue' },
  linkAlready: { glyph: 'mail', tone: 'blue' },
  sent: { glyph: 'check', tone: 'blue', solid: true },
  sentKeep: { glyph: 'check', tone: 'blue', solid: true },
  moved: { glyph: 'calendar', tone: 'blue' },
  discount: { glyph: 'check', tone: 'blue' },
}

export default function DoneScreen() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const p = useLocalSearchParams<{ kind: Kind; email?: string; date?: string; percent?: string; contractId?: string }>()
  const kind: Kind = (p.kind && p.kind in HERO ? p.kind : 'sent') as Kind
  const [resuming, setResuming] = useState(false)

  useEffect(() => {
    track('flow_result_shown', { kind })
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  }, [kind])

  // Referme les écrans du parcours (s'il y en a) avant d'aller à la destination.
  const closeFlow = () => { if (router.canDismiss()) router.dismissAll() }
  const goHome = () => { closeFlow(); router.replace('/(tabs)') }
  const goSubscription = () => {
    if (!p.contractId) return goHome()
    closeFlow()
    router.push({ pathname: '/subscription-detail', params: { contractId: p.contractId } })
  }

  const resume = async () => {
    if (!p.contractId) return
    setResuming(true)
    try {
      await subscriptionApi.resume(p.contractId, 'done')
      showToast(t('care:pause.resumed'), 'success')
      goSubscription()
    } catch {
      showToast(t('care:errors.generic'), 'error')
    } finally {
      setResuming(false)
    }
  }

  const email = p.email ?? ''
  const text: Record<Kind, { title: string; body: string }> = {
    paused: { title: t('care:result.pausedTitle'), body: t('care:result.pausedBody') },
    cancelled: { title: t('care:result.cancelledTitle'), body: t('care:result.cancelledBody') },
    link: { title: t('care:result.linkTitle'), body: t('care:result.linkBody', { email }) },
    linkAlready: { title: t('care:result.linkTitle'), body: t('care:result.linkAlready', { email }) },
    sent: { title: t('care:result.sentTitle'), body: t('care:result.sentBody', { email }) },
    sentKeep: { title: t('care:result.sentTitle'), body: t('care:result.sentBodyKeep', { email }) },
    moved: { title: t('care:result.movedTitle'), body: t('care:result.movedBody', { date: p.date ? formatDate(p.date) : '' }) },
    discount: { title: t('care:result.discountTitle'), body: t('care:result.discountBody', { percent: p.percent ?? '' }) },
  }

  const actions = (() => {
    switch (kind) {
      case 'paused':
        return <>
          <PillButton label={t('care:pause.resume')} loading={resuming} onPress={resume} />
          <PillButton variant="quiet" label={t('care:result.home')} onPress={goHome} />
        </>
      case 'link':
      case 'linkAlready':
        return <PillButton label={t('care:result.understood')} onPress={() => router.back()} />
      case 'moved':
      case 'discount':
        return <>
          <PillButton label={t('care:result.toSubscription')} onPress={goSubscription} />
          <PillButton variant="quiet" label={t('care:result.home')} onPress={goHome} />
        </>
      default:
        return <PillButton label={t('care:result.home')} onPress={goHome} />
    }
  })()

  return (
    <FlowScreen centered actions={actions}>
      <Hero round solid={HERO[kind].solid} glyph={HERO[kind].glyph} tone={HERO[kind].tone} title={text[kind].title} body={text[kind].body} />
    </FlowScreen>
  )
}
