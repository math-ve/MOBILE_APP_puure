import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { FlowScreen, AlertBanner } from '../components/ds/Flow'
import PillButton from '../components/ds/PillButton'
import Sheet from '../components/ds/Sheet'
import Glyph from '../components/ds/Glyph'
import { StaticTabBar, TAB_BAR_SPACE } from '../components/ui/TabBar'
import RescheduleSheet, { RescheduleOutcome } from '../components/subscription/RescheduleSheet'
import PaymentSheet, { brandName } from '../components/subscription/PaymentSheet'
import PauseSheet from '../components/subscription/PauseSheet'
import FrequencySheet from '../components/subscription/FrequencySheet'
import AddressSheet from '../components/subscription/AddressSheet'
import OrderDetailSheet from '../components/subscription/OrderDetailSheet'
import { subscriptionApi, SubscriptionDetail } from '../lib/subscriptionApi'
import { cartridgesPerDelivery, contractLines, pastOrderStatus, planImage, planTitle } from '../lib/plan'
import { formatCurrency, formatDate, formatFrequency } from '../lib/i18n/format'
import { ds, typography } from '../lib/theme'
import { useToast } from '../hooks/useToast'

// « Mon abonnement » (maquettes P08, P19, P20, P33) : produit, onglets
// Détails / Prochaines / Passées, et feuilles P09, P18, P21, P25, P26, P31, P40.
// La barre d'onglets reste visible, « Commandes » en surbrillance.

type Tab = 'details' | 'upcoming' | 'past'

export default function SubscriptionDetailScreen() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  // subData : abonnement passé par la liste (affichage immédiat). Absent quand
  // l'écran est ouvert par une notification : tout vient du serveur.
  // open : feuille à ouvrir à l'arrivée (reschedule | payment | address).
  const { contractId, subData, open } = useLocalSearchParams<{ contractId: string; subData?: string; open?: string }>()

  const [sub, setSub] = useState<any>(() => {
    try { return JSON.parse(subData ?? '{}') } catch { return {} }
  })
  const [detail, setDetail] = useState<Omit<SubscriptionDetail, 'subscription'> | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<Tab>('details')
  const [promo, setPromo] = useState('')
  const [applying, setApplying] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [sheet, setSheet] = useState<null | 'frequency' | 'address' | 'reschedule' | 'payment' | 'pause'>(null)
  const [linkSent, setLinkSent] = useState<{ email: string; alreadySent: boolean } | null>(null)
  const [pastOrder, setPastOrder] = useState<any>(null)
  // Dernière feuille demandée par lien déjà ouverte (un nouveau lien sur le même écran en rouvre une).
  const handledOpen = useRef<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { subscription, ...rest } = await subscriptionApi.detail(contractId)
      if (subscription) setSub((prev: any) => ({ ...prev, ...subscription }))
      setDetail(rest)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [contractId])

  // Rechargé à chaque retour sur l'écran (après une pause, un décalage…).
  useFocusEffect(useCallback(() => {
    load().finally(() => setLoading(false))
  }, [load]))

  useEffect(() => {
    if (loading || !open || handledOpen.current === open) return
    handledOpen.current = open
    if (open === 'reschedule' || open === 'payment' || open === 'address') setSheet(open)
  }, [loading, open])

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const upcoming = detail?.upcomingOrders ?? []
  const past = detail?.pastOrders ?? []
  const address = detail?.shippingAddress ?? null
  const card = detail?.paymentMethod ?? null
  const status: 'active' | 'paused' | 'cancelled' = sub.status === 'paused' ? 'paused' : sub.status === 'cancelled' ? 'cancelled' : 'active'
  const editable = status !== 'cancelled'

  const line = contractLines(sub)[0] ?? {}
  const currency = sub.price_currency ?? 'EUR'
  const unitPrice = Number(sub.price_amount ?? line.currentPrice ?? 0)
  const quantity = Number(line.quantity ?? 1)
  const total = unitPrice * quantity
  const money = (n: number) => formatCurrency(n, currency)
  const plan = planTitle(sub)
  const image = planImage(sub)
  const nextDate = upcoming[0]?.billingDate ?? sub.next_billing_date
  const cartridges = cartridgesPerDelivery(sub)
  const frequency = formatFrequency(sub.frequency_unit, sub.frequency_value)

  const applyPromo = async () => {
    const code = promo.trim()
    if (!code) return
    setApplying(true)
    try {
      await subscriptionApi.applyDiscount(contractId, code)
      showToast(t('subscription:promoApplied'), 'success')
      setPromo('')
      load()
    } catch (e: any) {
      showToast(e?.message && e.message !== 'session' ? e.message : t('care:errors.generic'), 'error')
    } finally {
      setApplying(false)
    }
  }

  const resume = async () => {
    setResuming(true)
    try {
      await subscriptionApi.resume(contractId)
      showToast(t('care:pause.resumed'), 'success')
      await load()
    } catch {
      showToast(t('care:errors.generic'), 'error')
    } finally {
      setResuming(false)
    }
  }

  const onRescheduled = (o: RescheduleOutcome) => {
    setSheet(null)
    showToast(
      o.kind === 'now' ? t('care:reschedule.doneNow')
        : o.kind === 'moved' ? t('care:reschedule.doneMoved', { date: formatDate(o.date) })
          : t('care:reschedule.doneSkipped'),
      'success',
    )
    load()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: t('subscription:tabDetails') },
    { key: 'upcoming', label: t('subscription:tabUpcoming') },
    { key: 'past', label: past.length ? t('subscription:tabPastCount', { count: past.length }) : t('subscription:tabPast') },
  ]

  // ─── Onglet Détails (P08, P33) ──────────────────────────────

  const details = (
    <>
      {status === 'active' ? (
        <View style={[styles.card, styles.nextCard]}>
          <View style={styles.spread}>
            <Text style={styles.caps}>{t('care:nextOrder.label').toLocaleUpperCase()}</Text>
            {upcoming.length > 0 && (
              <Pressable onPress={() => setSheet('reschedule')} hitSlop={10} accessibilityRole="button">
                <Text style={styles.link}>{t('care:nextOrder.move')}</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.bigDate}>{nextDate ? formatDate(nextDate) : '—'}</Text>
          <Text style={styles.small}>{t('care:nextOrder.chargedOn', { price: money(total) })}</Text>
        </View>
      ) : (
        <View style={[styles.card, styles.nextCard]}>
          <Text style={styles.caps}>{t(`subscription:${status === 'paused' ? 'statusPaused' : 'statusCancelled'}`).toLocaleUpperCase()}</Text>
          <Text style={styles.body}>{t(`subscription:${status === 'paused' ? 'pausedCardBody' : 'cancelledCardBody'}`)}</Text>
        </View>
      )}

      <View style={[styles.card, styles.priceCard]}>
        <PriceRow label={t('subscription:quantity')} value={String(quantity)} />
        <PriceRow label={t('subscription:price')} value={money(unitPrice)} />
        <PriceRow label={t('subscription:shipping')} value={money(0)} />
        <View style={[styles.spread, styles.totalRow]}>
          <Text style={styles.totalLabel}>{t('subscription:total').toLocaleUpperCase()}</Text>
          <Text style={styles.totalValue}>{money(total)}</Text>
        </View>
      </View>

      <View style={[styles.card, styles.settingsCard]}>
        <SettingRow
          label={t('subscription:frequency')}
          lines={[frequency]}
          onEdit={editable ? () => setSheet('frequency') : undefined}
        />
        <SettingRow
          label={t('subscription:shippingAddress')}
          lines={address ? [
            [address.firstName, address.lastName].filter(Boolean).join(' '),
            [[address.address1, address.address2].filter(Boolean).join(' '), [address.zip, address.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
          ] : [t('subscription:noAddress')]}
          onEdit={editable ? () => setSheet('address') : undefined}
        />
        <SettingRow
          last
          label={t('subscription:payment')}
          lines={card?.lastDigits || card?.maskedNumber
            ? [t('care:payment.card', { brand: brandName(card.brand), last4: card.lastDigits ?? card.maskedNumber?.slice(-4) })]
            : [t('care:payment.noCard')]}
          note={card?.expiryMonth && card?.expiryYear
            ? t('care:payment.expires', { month: String(card.expiryMonth).padStart(2, '0'), year: card.expiryYear })
            : undefined}
          onEdit={editable ? () => setSheet('payment') : undefined}
        />
      </View>

      {editable && (
        <View style={styles.promoRow}>
          <TextInput
            style={styles.promoInput}
            value={promo}
            onChangeText={setPromo}
            placeholder={t('subscription:promoPlaceholder')}
            placeholderTextColor={ds.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={applyPromo}
            accessibilityLabel={t('subscription:promoCode')}
          />
          <PillButton
            variant="secondary"
            label={t('subscription:apply')}
            loading={applying}
            onPress={applyPromo}
            style={styles.promoBtn}
            labelColor={ds.blue}
          />
        </View>
      )}

      {editable && (
        <View style={styles.manage}>
          {status === 'paused'
            ? <PillButton label={t('care:pause.resume')} loading={resuming} onPress={resume} />
            : <PillButton variant="secondary" label={t('subscription:pause')} onPress={() => setSheet('pause')} style={styles.pauseBtn} />}
          <Pressable
            onPress={() => router.push({ pathname: '/cancel-subscription', params: { contractId } })}
            hitSlop={8}
            accessibilityRole="button"
            style={styles.cancelLink}
          >
            <Text style={styles.cancelText}>{t('subscription:cancel')}</Text>
          </Pressable>
        </View>
      )}
    </>
  )

  // ─── Onglet Prochaines (P19) ────────────────────────────────

  const upcomingTab = upcoming.length === 0 ? (
    <Text style={styles.caption}>{status === 'active' ? t('care:nextOrder.none') : t('subscription:noUpcomingOrders')}</Text>
  ) : (
    <>
      <View style={[styles.card, styles.listCard]}>
        {upcoming.map((o, i) => (
          <View key={o.id ?? i} style={[styles.upRow, i < upcoming.length - 1 && styles.divider]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.caps}>{t(i === 0 ? 'subscription:upcomingFirst' : 'subscription:upcomingNext').toLocaleUpperCase()}</Text>
              <Text style={styles.upDate}>{formatDate(o.billingDate)}</Text>
            </View>
            <Text style={styles.upPrice}>{money(total)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>
        {cartridges
          ? t('subscription:upcomingCaption', { items: t('water:plan.cartridges', { count: cartridges }), frequency: lowerFirst(frequency) })
          : t('subscription:upcomingCaptionPlain', { frequency: lowerFirst(frequency) })}
      </Text>
    </>
  )

  // ─── Onglet Passées (P20) ───────────────────────────────────

  const pastTab = past.length === 0 ? (
    <Text style={styles.caption}>{t('subscription:noPastOrders')}</Text>
  ) : (
    <>
      {past.map((o, i) => {
        const st = pastOrderStatus(o)
        const items: any[] = Array.isArray(o.variantList) ? o.variantList : []
        const thumb = items[0]?.image ?? items[0]?.variantImage ?? image
        return (
          <View key={o.id ?? i} style={[styles.card, styles.pastCard]}>
            <View style={styles.pastTop}>
              {thumb ? <Image source={{ uri: thumb }} style={styles.pastThumb} /> : <View style={styles.pastThumb} />}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.pastTitle} numberOfLines={1}>{plan}</Text>
                <Text style={styles.small} numberOfLines={1}>
                  {[o.orderName, o.billingDate ? formatDate(o.billingDate, { day: 'numeric', month: 'short', year: 'numeric' }) : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={styles.pastPrice}>{money(Number(o.orderAmount ?? 0))}</Text>
                <Text style={[styles.pastStatus, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setPastOrder(o)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.pastLink, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.link}>{t('subscription:seeDetail')}</Text>
              <Glyph name="chevron" size={18} color={ds.blue} />
            </Pressable>
          </View>
        )
      })}
    </>
  )

  return (
    <View style={{ flex: 1, backgroundColor: ds.surface }}>
      <FlowScreen
        title={t('subscription:sectionHeading')}
        onBack={() => router.back()}
        bottomSpace={TAB_BAR_SPACE + 12}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ds.blue} />}
      >
        {detail?.paymentFailedAt && editable ? (
          <AlertBanner title={t('care:payment.failedTitle')} body={t('care:payment.failedBody')} onPress={() => setSheet('payment')} />
        ) : null}

        <View style={[styles.card, styles.product]}>
          {image ? <Image source={{ uri: image }} style={styles.productImage} /> : <View style={styles.productImage} />}
          <View style={{ flex: 1, gap: 6, alignItems: 'flex-start' }}>
            <Text style={styles.productName} numberOfLines={2}>{sub.product_name ?? line.title ?? plan}</Text>
            <Text style={styles.productSub} numberOfLines={2}>
              {[plan, cartridges ? t('water:plan.cartridges', { count: cartridges }) : null].filter(Boolean).join(' · ')}
            </Text>
            <StatusBadge status={status} />
          </View>
        </View>

        <View style={styles.segment} accessibilityRole="tablist">
          {tabs.map((tb) => {
            const active = tab === tb.key
            return (
              <Pressable
                key={tb.key}
                onPress={() => { if (!active) { Haptics.selectionAsync().catch(() => {}); setTab(tb.key) } }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[styles.segmentItem, active && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>{tb.label}</Text>
              </Pressable>
            )
          })}
        </View>

        {loading && !detail ? <Skeleton /> : loadError && !detail ? (
          <View style={{ gap: 12, alignItems: 'center', paddingTop: 12 }}>
            <Text style={styles.caption}>{t('care:errors.generic')}</Text>
            <PillButton variant="secondary" label={t('common:retry')} onPress={refresh} style={{ paddingHorizontal: 28 }} />
          </View>
        ) : tab === 'details' ? details : tab === 'upcoming' ? upcomingTab : pastTab}
      </FlowScreen>

      <StaticTabBar active="orders" />

      {sheet === 'frequency' && (
        <FrequencySheet
          contractId={contractId}
          current={sub.frequency_value ?? null}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); showToast(t('subscription:freqUpdated'), 'success'); load() }}
        />
      )}
      {sheet === 'address' && (
        <AddressSheet
          contractId={contractId}
          initial={address}
          onClose={() => setSheet(null)}
          onSaved={(addr) => {
            setSheet(null)
            setDetail((d) => (d ? { ...d, shippingAddress: addr } : d))
            showToast(t('subscription:addressUpdated'), 'success')
            load()
          }}
        />
      )}
      {sheet === 'reschedule' && (
        <RescheduleSheet
          contractId={contractId}
          upcoming={upcoming}
          price={money(total)}
          onClose={() => setSheet(null)}
          onDone={onRescheduled}
        />
      )}
      {sheet === 'payment' && (
        <PaymentSheet
          contractId={contractId}
          paymentMethod={card}
          onClose={() => setSheet(null)}
          onSent={(info) => { setSheet(null); setLinkSent(info) }}
        />
      )}
      {sheet === 'pause' && (
        <PauseSheet
          contractId={contractId}
          source="subscription-detail"
          onClose={() => setSheet(null)}
          onPaused={() => {
            setSheet(null)
            router.push({ pathname: '/done', params: { kind: 'paused', contractId } })
          }}
        />
      )}
      {linkSent && (
        <Sheet
          icon="mail"
          title={t('care:result.linkTitle')}
          message={t(linkSent.alreadySent ? 'care:result.linkAlready' : 'care:result.linkBody', { email: linkSent.email })}
          onClose={() => setLinkSent(null)}
          footer={<PillButton label={t('subscription:gotIt')} onPress={() => setLinkSent(null)} />}
        />
      )}
      {pastOrder && (
        <OrderDetailSheet
          order={pastOrder}
          plan={plan}
          fallbackImage={image}
          currency={currency}
          address={address}
          onClose={() => setPastOrder(null)}
        />
      )}
    </View>
  )
}

// ─── Briques ────────────────────────────────────────────────

const lowerFirst = (s: string) => (s ? s.charAt(0).toLocaleLowerCase() + s.slice(1) : s)

function StatusBadge({ status }: { status: 'active' | 'paused' | 'cancelled' }) {
  const { t } = useTranslation()
  const c = status === 'active' ? { bg: ds.blueSoft, fg: ds.blue, key: 'statusActive' }
    : status === 'paused' ? { bg: ds.amberSoft, fg: ds.amber, key: 'statusPaused' }
      : { bg: ds.fill, fg: ds.muted, key: 'statusCancelled' }
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{t(`subscription:${c.key}`).toLocaleUpperCase()}</Text>
    </View>
  )
}

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.spread}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={styles.priceValue}>{value}</Text>
    </View>
  )
}

function SettingRow({ label, lines, note, onEdit, last }: { label: string; lines: string[]; note?: string; onEdit?: () => void; last?: boolean }) {
  const { t } = useTranslation()
  return (
    <View style={[styles.settingRow, !last && styles.divider]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.caps}>{label.toLocaleUpperCase()}</Text>
        {lines.filter(Boolean).map((l, i) => <Text key={i} style={styles.settingValue}>{l}</Text>)}
        {note ? <Text style={styles.small}>{note}</Text> : null}
      </View>
      {onEdit && (
        <Pressable onPress={onEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${t('subscription:modifyShort')} ${label}`}>
          <Text style={styles.link}>{t('subscription:modifyShort')}</Text>
        </Pressable>
      )}
    </View>
  )
}

function Skeleton() {
  const pulse = useRef(new Animated.Value(0.55)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [])
  const bar = (w: number | `${number}%`, h: number) => <View style={{ width: w, height: h, borderRadius: 8, backgroundColor: ds.line }} />
  return (
    <Animated.View style={{ gap: 18, opacity: pulse }}>
      <View style={[styles.card, styles.nextCard]}>{bar(150, 12)}{bar('60%', 32)}{bar('85%', 14)}</View>
      <View style={[styles.card, styles.priceCard]}>{bar('100%', 14)}{bar('100%', 14)}{bar('100%', 14)}</View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: ds.radius.card },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: ds.line },
  caps: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, letterSpacing: 0.96, color: ds.muted },
  link: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.blue },
  small: { fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: ds.muted },
  body: { fontFamily: typography.fontFamily.regular, fontSize: 15, lineHeight: 22, color: ds.body },
  caption: { fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: ds.muted, textAlign: 'center' },

  product: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  productImage: { width: 88, height: 88, borderRadius: 16, backgroundColor: ds.fill },
  productName: { fontFamily: typography.fontFamily.medium, fontSize: 17, lineHeight: 22, color: ds.ink },
  productSub: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.muted },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, letterSpacing: 0.6 },

  segment: { flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line },
  segmentItem: { flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentActive: { backgroundColor: ds.blue },
  segmentText: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.body },
  segmentTextActive: { color: '#FFFFFF' },

  nextCard: { padding: 20, gap: 8 },
  bigDate: { fontFamily: typography.fontFamily.medium, fontSize: 32, lineHeight: 38, letterSpacing: -0.64, color: ds.ink },

  priceCard: { paddingVertical: 18, paddingHorizontal: 20, gap: 10 },
  priceLabel: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.body },
  priceValue: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.ink },
  totalRow: { borderTopWidth: 1, borderTopColor: ds.line, paddingTop: 14, marginTop: 4 },
  totalLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, letterSpacing: 0.96, color: ds.ink },
  totalValue: { fontFamily: typography.fontFamily.semiBold, fontSize: 15, color: ds.ink },

  settingsCard: { paddingHorizontal: 20 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  settingValue: { fontFamily: typography.fontFamily.regular, fontSize: 16, lineHeight: 22, color: ds.ink },

  promoRow: { flexDirection: 'row', gap: 10 },
  promoInput: {
    flex: 1, height: 52, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1, borderColor: ds.line,
    backgroundColor: ds.raised, fontFamily: typography.fontFamily.regular, fontSize: 16, color: ds.ink,
  },
  promoBtn: { minHeight: 52, height: 52, paddingHorizontal: 22 },

  manage: { borderTopWidth: 1, borderTopColor: ds.line, marginTop: 8, paddingTop: 24, gap: 14 },
  pauseBtn: { minHeight: 52 },
  cancelLink: { alignSelf: 'center', paddingVertical: 6 },
  cancelText: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.body, textDecorationLine: 'underline' },

  listCard: { paddingHorizontal: 20 },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18 },
  upDate: { fontFamily: typography.fontFamily.medium, fontSize: 18, color: ds.ink },
  upPrice: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },

  pastCard: { paddingHorizontal: 18, paddingTop: 16 },
  pastTop: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: ds.line },
  pastThumb: { width: 56, height: 56, borderRadius: 14, borderWidth: 1, borderColor: ds.line, backgroundColor: ds.fill },
  pastTitle: { fontFamily: typography.fontFamily.medium, fontSize: 16, color: ds.ink },
  pastPrice: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },
  pastStatus: { fontFamily: typography.fontFamily.medium, fontSize: 14 },
  pastLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
})
