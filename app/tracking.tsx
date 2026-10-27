import { useCallback, useEffect, useState } from 'react'
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import { FlowScreen, Hero } from '../components/ds/Flow'
import PillButton from '../components/ds/PillButton'
import ParcelProblemSheet from '../components/orders/ParcelProblemSheet'
import EventRow from '../components/orders/EventRow'
import { supabase } from '../lib/supabase'
import { fetchTracking, trackingHeadline, trackingLabel, trackingStep, TrackingData } from '../lib/tracking'
import { orderImage, orderTitle } from '../lib/orders'
import { ds, typography } from '../lib/theme'

// Suivi de livraison (maquettes P11, P15, P17).

export default function TrackingScreen() {
  const { t } = useTranslation()
  const { tracking_number, order_number } = useLocalSearchParams<{ tracking_number: string; order_number: string }>()
  const [data, setData] = useState<TrackingData | null>(null)
  const [order, setOrder] = useState<any>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [problem, setProblem] = useState(false)

  const load = useCallback(async () => {
    setState('loading')
    const [tracking, orderRow] = await Promise.all([
      tracking_number ? fetchTracking(tracking_number).catch(() => null) : Promise.resolve(null),
      order_number
        ? supabase.from('orders_cache').select('*').eq('order_number', order_number).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
    ])
    setOrder(orderRow)
    setData(tracking)
    setState(tracking ? 'ready' : 'unavailable')
  }, [tracking_number, order_number])

  useEffect(() => { load() }, [load])

  const title = order_number ? t('trackingDs:orderTitle', { number: `#${order_number}` }) : t('trackingDs:title')

  if (state === 'loading') {
    return (
      <FlowScreen title={title} onBack={() => router.back()}>
        <SkeletonCard lines={[{ w: 92, h: 14 }, { w: '80%', h: 24 }, { w: '60%', h: 24 }, { dots: true }, { w: '100%', h: 52, r: 16 }]} />
        <SkeletonCard lines={[{ w: 120, h: 12 }, { w: '85%', h: 14 }, { w: '50%', h: 12 }, { w: '75%', h: 14 }, { w: '45%', h: 12 }]} />
        <Text style={styles.loadingText}>{t('trackingDs:loading')}</Text>
      </FlowScreen>
    )
  }

  if (state === 'unavailable' || !data) {
    return (
      <FlowScreen title={title} onBack={() => router.back()} centered>
        <Hero glyph="box" title={t('trackingDs:unavailableTitle')} body={t('trackingDs:unavailableBody')} />
        <PillButton variant="secondary" label={t('trackingDs:backToOrders')} onPress={() => router.back()} style={{ alignSelf: 'center', paddingHorizontal: 24 }} />
      </FlowScreen>
    )
  }

  const step = trackingStep(data.status)
  const label = trackingLabel(data.status)
  const carrier = order?.carrier && order.carrier !== 'Other' ? order.carrier : t('trackingDs:trackingNumber')
  const events = data.events.slice(0, 3)
  const addr = order?.shipping_address
  const items = Array.isArray(order?.line_items) ? order.line_items : []

  return (
    <>
      <FlowScreen title={title} onBack={() => router.back()}>
        <View style={[styles.card, { padding: 20, gap: 18 }]}>
          <View style={{ gap: 6 }}>
            <Text style={[styles.caps, { color: label.tone === 'red' ? ds.red : label.tone === 'muted' ? ds.muted : ds.blue }]}>
              {label.text.toLocaleUpperCase()}
            </Text>
            <Text style={styles.headline}>{trackingHeadline(data)}</Text>
          </View>
          <Steps step={step} labels={[t('trackingDs:stepShipped'), t('trackingDs:stepOnTheWay'), t('trackingDs:stepDelivered')]} />
          <View style={styles.carrier}>
            <Text style={styles.carrierName}>{carrier}</Text>
            <Text style={styles.carrierNumber} selectable>{data.tracking_number}</Text>
          </View>
        </View>

        {events.length > 0 && (
          <View style={[styles.card, styles.eventsCard]}>
            <Text style={[styles.caps, { color: ds.muted, marginBottom: 8 }]}>{t('trackingDs:latestEvents').toLocaleUpperCase()}</Text>
            {events.map((e, i) => (
              <EventRow key={i} event={e} first={i === 0} last={i === events.length - 1} />
            ))}
            {data.events.length > 3 && (
              <Pressable
                onPress={() => router.push({ pathname: '/tracking-history', params: { tracking_number, order_number, carrier } })}
                style={styles.historyLink}
                accessibilityRole="button"
              >
                <Text style={styles.link}>{t('trackingDs:seeAll')}</Text>
              </Pressable>
            )}
          </View>
        )}

        {(items.length > 0 || addr) && (
          <View style={[styles.card, styles.orderCard]}>
            {items.length > 0 && (
              <View style={styles.orderRow}>
                <Image source={orderImage(order)} style={styles.thumb} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.orderTitle} numberOfLines={1}>{orderTitle(order)}</Text>
                  <Text style={styles.small} numberOfLines={1}>
                    {t('trackingDs:items', { count: items.reduce((n: number, i: any) => n + (i.quantity ?? 1), 0) })}
                  </Text>
                </View>
              </View>
            )}
            {addr && (
              <View style={[styles.addr, items.length > 0 && styles.addrDivider]}>
                <Text style={styles.small}>{t('trackingDs:deliveryTo')}</Text>
                <Text style={styles.addrText}>
                  {[addr.firstName, [addr.address1, [addr.zip, addr.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                </Text>
              </View>
            )}
          </View>
        )}

        <PillButton variant="secondary" label={t('care:parcel.link')} onPress={() => setProblem(true)} style={{ minHeight: 50 }} />
      </FlowScreen>
      {problem && <ParcelProblemSheet orderNumber={order_number} trackingNumber={tracking_number} onClose={() => setProblem(false)} />}
    </>
  )
}

// ─── Frise Expédiée → En route → Livrée ───────────────────────────

function Steps({ step, labels }: { step: number; labels: string[] }) {
  return (
    <View style={styles.steps} accessibilityLabel={labels[step]}>
      {labels.map((label, i) => {
        const done = i < step || (i === step && step === 2)
        const current = i === step && step !== 2
        return (
          <View key={label} style={styles.step}>
            {i < labels.length - 1 && <View style={[styles.stepLine, { backgroundColor: i < step ? ds.blue : ds.line }]} />}
            <View style={[styles.stepDot, done && styles.stepDone, current && styles.stepCurrent]}>
              {done && (
                <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                  <Path d="M5 12l5 5L20 7" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              )}
            </View>
            <Text style={[styles.stepLabel, current && styles.stepLabelCurrent, !done && !current && { color: ds.muted }]}>{label}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── Chargement (P15) ─────────────────────────────────────────────

type SkeletonLine = { w?: number | string; h?: number; r?: number; dots?: boolean }

function SkeletonCard({ lines }: { lines: SkeletonLine[] }) {
  const pulse = useState(() => new Animated.Value(0.55))[0]
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [])
  return (
    <Animated.View style={[styles.card, { padding: 20, gap: 14, opacity: pulse }]}>
      {lines.map((l, i) => l.dots ? (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4 }}>
          {[0, 1, 2].map((d) => <View key={d} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: ds.line }} />)}
        </View>
      ) : (
        <View key={i} style={{ width: l.w as any, height: l.h, borderRadius: l.r ?? 8, backgroundColor: ds.line }} />
      ))}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: ds.radius.card },
  caps: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, letterSpacing: 0.96 },
  headline: { fontFamily: typography.fontFamily.medium, fontSize: 26, lineHeight: 30, letterSpacing: -0.52, color: ds.ink },

  steps: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 8 },
  stepLine: { position: 'absolute', top: 10, left: '50%', width: '100%', height: 3 },
  stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: ds.line, alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: ds.blue },
  stepCurrent: { backgroundColor: '#FFFFFF', borderWidth: 6, borderColor: ds.blue },
  stepLabel: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: ds.ink },
  stepLabelCurrent: { fontFamily: typography.fontFamily.semiBold },

  carrier: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: ds.surface, gap: 2 },
  carrierName: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: ds.muted },
  carrierNumber: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },

  eventsCard: { borderRadius: 20, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 12, gap: 4 },
  historyLink: { paddingTop: 10, paddingBottom: 4, borderTopWidth: 1, borderTopColor: ds.line },
  link: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.blue },

  orderCard: { borderRadius: 20, paddingVertical: 16, paddingHorizontal: 18, gap: 12 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: ds.fill },
  orderTitle: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },
  small: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: ds.muted },
  addr: { gap: 2 },
  addrDivider: { borderTopWidth: 1, borderTopColor: ds.line, paddingTop: 12 },
  addrText: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.ink },

  loadingText: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.muted, textAlign: 'center' },
})
