import { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../lib/supabase'
import theme from '../lib/theme'
import i18n from '../lib/i18n'
import { formatDate, formatDateShort, formatTime } from '../lib/i18n/format'

const SUPABASE_URL = 'https://vwlqdrrlggolgdssdwoh.supabase.co'
const EVENTS_PREVIEW_COUNT = 10
const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' })

// ─── Statuts ───────────────────────────────────────────────
// Styles + icônes ici ; libellés résolus via i18n (tracking:status.*).

const STATUS_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  Delivered: { bg: 'rgba(30,187,110,0.12)', color: theme.colors.success, icon: '✓' },
  OutForDelivery: { bg: 'rgba(39,100,255,0.10)', color: theme.colors.blue, icon: '🚚' },
  InTransit: { bg: 'rgba(39,100,255,0.10)', color: theme.colors.blue, icon: '✈️' },
  Exception: { bg: 'rgba(227,44,43,0.10)', color: theme.colors.error, icon: '!' },
  DeliveryFailure: { bg: 'rgba(227,44,43,0.10)', color: theme.colors.error, icon: '!' },
  AvailableForPickup: { bg: 'rgba(201,255,0,0.3)', color: '#3a6000', icon: '📦' },
  InfoReceived: { bg: 'rgba(35,48,86,0.08)', color: theme.colors.textMid, icon: '📬' },
  Expired: { bg: 'rgba(35,48,86,0.08)', color: theme.colors.textMid, icon: '⏰' },
  NotFound: { bg: 'rgba(35,48,86,0.08)', color: theme.colors.textMid, icon: '?' },
}

const FALLBACK_STYLE = { bg: 'rgba(35,48,86,0.08)', color: theme.colors.textMid, icon: '📦' }

const resolveStatus = (key: string) => {
  const known = !!STATUS_STYLE[key]
  const style = known ? STATUS_STYLE[key] : FALLBACK_STYLE
  const label = i18n.t(known ? `tracking:status.${key}` : 'tracking:status.fallback')
  return { ...style, label }
}

const MILESTONE_ORDER = ['InfoReceived', 'PickedUp', 'Departure', 'Arrival', 'AvailableForPickup', 'OutForDelivery', 'Delivered']

const MILESTONE_ICON: Record<string, string> = {
  InfoReceived: '📬',
  PickedUp: '📦',
  Departure: '✈️',
  Arrival: '🛬',
  AvailableForPickup: '🏪',
  OutForDelivery: '🚚',
  Delivered: '✅',
}

const milestoneMeta = (stage: string) => ({
  icon: MILESTONE_ICON[stage] ?? '•',
  label: MILESTONE_ICON[stage] ? i18n.t(`tracking:milestone.${stage}`) : stage,
})

// ─── Traductions des événements transporteurs ──────────────
// Le transporteur renvoie des libellés en anglais ; on les remappe via
// tracking:events.* (identité pour la locale EN, traduction pour fr/de).

const translateDesc = (desc: string | null | undefined): string => {
  if (!desc) return '—'
  const norm = desc.trim().toLowerCase()
  // Accès direct à la table pour éviter tout souci de séparateur ('.'/'':')
  // dans les libellés transporteurs. Repli sur fr puis sur le texte brut.
  const table =
    (i18n.getResource(i18n.language, 'tracking', 'events') as Record<string, string> | undefined) ??
    (i18n.getResource('fr', 'tracking', 'events') as Record<string, string> | undefined)
  return table?.[norm] ?? desc
}

// ─── Formatters ────────────────────────────────────────────

const formatEventTime = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso ?? '—'
  return i18n.t('common:dateAtTime', { date: formatDate(d), time: formatTime(d) })
}

const formatShortDate = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return formatDateShort(d)
}

interface TrackingData {
  tracking_number: string
  status: string
  sub_status: string
  latest_event: { time: string; description: string; location: string | null } | null
  origin_country: string | null
  destination_country: string | null
  days_of_transit: number | null
  estimated_delivery: string | null
  milestones: Array<{ stage: string; time: string | null }>
  events: Array<{ time: string; description: string; location: string | null }>
}

// ─── Animations ────────────────────────────────────────────

function CascadeIn({ index, children }: { index: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(20)).current

  useEffect(() => {
    const easing = Easing.bezier(0.16, 1, 0.3, 1)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: index * 150, easing, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 400, delay: index * 150, easing, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: ty }] }}>
      {children}
    </Animated.View>
  )
}

function PopIn({ delay, children }: { delay: number; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(scale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }),
    ]).start()
  }, [])

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
}

function Shimmer({ style }: { style?: any }) {
  const anim = useRef(new Animated.Value(-1)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true })
    )
    loop.start()
    return () => loop.stop()
  }, [])

  const translateX = anim.interpolate({ inputRange: [-1, 1], outputRange: [-250, 250] })

  return (
    <View style={[styles.shimmerBase, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  )
}

// ─── Milestones ────────────────────────────────────────────

const STEP_WIDTH = 64
const CIRCLE_SIZE = 36
const LINE_WIDTH = STEP_WIDTH - CIRCLE_SIZE

function MilestoneLine({ filled, delay }: { filled: boolean; delay: number }) {
  const fillWidth = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!filled) return
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(fillWidth, { toValue: LINE_WIDTH, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: false }),
    ]).start()
  }, [filled])

  return (
    <View style={styles.msLine}>
      {filled && <Animated.View style={[styles.msLineFill, { width: fillWidth }]} />}
    </View>
  )
}

function MilestoneBar({ milestones }: { milestones: Array<{ stage: string; time: string | null }> }) {
  const seen = new Set(milestones.map(m => m.stage))
  const steps = MILESTONE_ORDER.filter(s => seen.has(s) || s === 'InfoReceived' || s === 'Delivered')
  const timeMap = Object.fromEntries(milestones.map(m => [m.stage, m.time]))
  const lastDone = steps.reduce((acc, s, i) => (timeMap[s] ? i : acc), -1)
  const circlesDoneDelay = (lastDone + 1) * 80

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.msRow}>
        {steps.map((step, i) => {
          const done = i <= lastDone && !!timeMap[step]
          const isCurrent = i === lastDone + 1
          const meta = milestoneMeta(step)

          const circle = done ? (
            <PopIn delay={i * 80}>
              <LinearGradient colors={[theme.colors.blue, theme.colors.blueMid]} style={styles.msCircle}>
                <Text style={styles.msIconDone}>{meta.icon}</Text>
              </LinearGradient>
            </PopIn>
          ) : (
            <View style={[styles.msCircle, isCurrent ? styles.msCircleCurrent : styles.msCircleFuture]}>
              <Text style={[styles.msIcon, { opacity: isCurrent ? 1 : 0.45 }]}>{meta.icon}</Text>
            </View>
          )

          return (
            <View key={step} style={styles.msStepWrap}>
              <View style={styles.msStep}>
                {circle}
                <Text style={styles.msLabel} numberOfLines={2}>{meta.label}</Text>
                {timeMap[step] ? (
                  <Text style={styles.msDate}>{formatShortDate(timeMap[step])}</Text>
                ) : null}
              </View>
              {i < steps.length - 1 && (
                <MilestoneLine
                  filled={i < lastDone}
                  delay={circlesDoneDelay + i * 100}
                />
              )}
            </View>
          )
        })}
      </View>
    </ScrollView>
  )
}

// ─── Écran ─────────────────────────────────────────────────

export default function TrackingScreen() {
  const { t } = useTranslation()
  const { tracking_number, order_number } = useLocalSearchParams<{ tracking_number: string; order_number: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<TrackingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showAllEvents, setShowAllEvents] = useState(false)

  useEffect(() => {
    if (!tracking_number) { setError(true); setLoading(false); return }
    loadTracking()
  }, [tracking_number])

  const loadTracking = async () => {
    setLoading(true)
    setError(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError(true); return }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/scrape-tracking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tracking_number }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(true); return }
      setData(json)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const status = data ? resolveStatus(data.status) : null
  const events = data?.events ?? []
  const visibleEvents = showAllEvents ? events : events.slice(0, EVENTS_PREVIEW_COUNT)

  // « Un problème avec ce colis ? » (maquette P36), y compris quand le suivi est indisponible.
  const parcelProblemLink = (
    <TouchableOpacity
      onPress={() => router.push({ pathname: '/parcel-problem', params: { orderNumber: order_number, trackingNumber: tracking_number } })}
      style={styles.problemLink}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <Text style={styles.problemLinkText}>{t('care:parcel.link')}</Text>
    </TouchableOpacity>
  )
  const hiddenCount = events.length - EVENTS_PREVIEW_COUNT

  return (
    <View style={styles.root}>
      {/* ── HEADER ── */}
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backText}>{t('tracking:back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {order_number ? t('tracking:orderNumber', { number: order_number }) : t('tracking:parcelTracking')}
        </Text>
        <View style={styles.headerRight}>
          {status && (
            <View style={[styles.headerBadge, { backgroundColor: status.bg }]}>
              <Text style={[styles.headerBadgeText, { color: status.color }]}>{status.label}</Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        /* ── SKELETON ── */
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Shimmer style={{ height: 36, width: 140, borderRadius: theme.radius.pill }} />
            <Shimmer style={{ height: 20, marginTop: theme.spacing[3] }} />
            <Shimmer style={{ height: 14, width: '60%', marginTop: theme.spacing[2] }} />
          </View>
          <View style={styles.card}>
            <Shimmer style={{ height: 12, width: 100 }} />
            <View style={styles.skeletonCircleRow}>
              {Array.from({ length: 7 }).map((_, i) => (
                <Shimmer key={i} style={{ width: 36, height: 36, borderRadius: theme.radius.full }} />
              ))}
            </View>
          </View>
          <View style={styles.card}>
            <Shimmer style={{ height: 12, width: 100, marginBottom: theme.spacing[4] }} />
            {Array.from({ length: 5 }).map((_, i) => (
              <Shimmer key={i} style={{ height: 16, marginBottom: theme.spacing[3], width: `${90 - i * 8}%` }} />
            ))}
          </View>
        </ScrollView>
      ) : error || !data ? (
        /* ── ÉTAT ERREUR ── */
        <View style={styles.errorWrap}>
          <View style={styles.errorCircle}>
            <Text style={styles.errorIcon}>📭</Text>
          </View>
          <Text style={styles.errorTitle}>{t('tracking:unavailableTitle')}</Text>
          <Text style={styles.errorSub}>{t('tracking:unavailableSub')}</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.errorBtnText}>{t('tracking:backToOrders')}</Text>
          </TouchableOpacity>
          {parcelProblemLink}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* ── CARD STATUT HERO ── */}
          <CascadeIn index={0}>
            <View style={styles.card}>
              <View style={[styles.statusBadge, { backgroundColor: status!.bg }]}>
                {(status!.icon === '✓' || status!.icon === '!' || status!.icon === '?') ? (
                  <View style={[styles.statusIconCircle, { backgroundColor: status!.color }]}>
                    <Text style={styles.statusIconCircleText}>{status!.icon}</Text>
                  </View>
                ) : (
                  <Text style={styles.statusIcon}>{status!.icon}</Text>
                )}
                <Text style={[styles.statusLabel, { color: status!.color }]}>{status!.label}</Text>
              </View>

              {data.latest_event && (
                <>
                  <Text style={styles.latestDesc}>{translateDesc(data.latest_event.description)}</Text>
                  <Text style={styles.latestTime}>{formatEventTime(data.latest_event.time)}</Text>
                </>
              )}

              <View style={styles.pillRow}>
                {data.origin_country && data.destination_country && (
                  <View style={styles.infoPill}>
                    <Text style={styles.infoPillText}>
                      {t('tracking:route', { origin: data.origin_country, destination: data.destination_country })}
                    </Text>
                  </View>
                )}
                {data.days_of_transit != null && (
                  <View style={styles.infoPill}>
                    <Text style={styles.infoPillText}>
                      {t('tracking:transitDays', { count: data.days_of_transit })}
                    </Text>
                  </View>
                )}
                <View style={styles.infoPill}>
                  <Text style={styles.infoPillMono}>{data.tracking_number}</Text>
                </View>
              </View>
            </View>
          </CascadeIn>

          {/* ── CARD PROGRESSION ── */}
          {data.milestones.length > 0 && (
            <CascadeIn index={1}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('tracking:progress').toUpperCase()}</Text>
                <MilestoneBar milestones={data.milestones} />
              </View>
            </CascadeIn>
          )}

          {/* ── CARD HISTORIQUE ── */}
          {events.length > 0 && (
            <CascadeIn index={2}>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('tracking:history').toUpperCase()}</Text>
                {visibleEvents.map((ev, i) => (
                  <View
                    key={i}
                    style={[styles.eventRow, i === 0 && styles.eventRowFirst]}
                  >
                    <View style={styles.eventLeft}>
                      <PopIn delay={400 + i * 40}>
                        <View style={[styles.eventDot, i === 0 && styles.eventDotFirst]} />
                      </PopIn>
                      {i < visibleEvents.length - 1 && <View style={styles.eventConnector} />}
                    </View>
                    <View style={styles.eventContent}>
                      <Text style={styles.eventDesc}>{translateDesc(ev.description)}</Text>
                      {ev.location ? (
                        <View style={styles.eventLocationPill}>
                          <Text style={styles.eventLocationText}>📍 {ev.location}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.eventTime}>{formatEventTime(ev.time)}</Text>
                    </View>
                  </View>
                ))}

                {!showAllEvents && hiddenCount > 0 && (
                  <TouchableOpacity
                    onPress={() => setShowAllEvents(true)}
                    style={styles.showMoreBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.showMoreText}>
                      {t('tracking:seeAllHistory', { count: events.length })}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </CascadeIn>
          )}

          {parcelProblemLink}
        </ScrollView>
      )}
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
    gap: theme.spacing[4],
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[3],
  },
  backBtn: {
    minWidth: 80,
  },
  backText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: theme.colors.blue,
  },
  headerTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.lg - 1,
    color: theme.colors.navy,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  headerBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[2] + 2,
    paddingVertical: theme.spacing[1],
  },
  headerBadgeText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // Card
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[5],
    ...theme.shadows.card,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textLight,
    letterSpacing: 1.2,
    marginBottom: theme.spacing[4],
  },

  // Statut hero
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 36,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[3] + 2,
    gap: 6,
  },
  statusIcon: { fontSize: 16 },
  statusIconCircle: {
    width: 18,
    height: 18,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconCircleText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 11,
    color: theme.colors.white,
  },
  statusLabel: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base - 1,
    letterSpacing: 0.2,
  },
  latestDesc: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.lg - 1,
    color: theme.colors.navy,
    letterSpacing: -0.3,
    lineHeight: 24,
    marginTop: theme.spacing[3],
  },
  latestTime: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    marginTop: theme.spacing[1],
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
  infoPill: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing[3],
  },
  infoPillText: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.xs + 1,
    color: theme.colors.textMid,
  },
  infoPillMono: {
    fontFamily: MONO_FONT,
    fontSize: theme.typography.size.xs + 1,
    color: theme.colors.textMid,
  },

  // Milestones
  msRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  msStepWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  msStep: {
    width: STEP_WIDTH,
    alignItems: 'center',
    gap: 6,
    zIndex: 1,
  },
  msCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msCircleCurrent: {
    backgroundColor: theme.colors.white,
    borderWidth: 2,
    borderColor: theme.colors.blue,
  },
  msCircleFuture: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  msIcon: { fontSize: 16 },
  msIconDone: { fontSize: 16 },
  msLine: {
    width: LINE_WIDTH,
    height: 2,
    backgroundColor: theme.colors.border,
    marginTop: CIRCLE_SIZE / 2 - 1,
    marginHorizontal: -CIRCLE_SIZE / 2 + 2,
    zIndex: 0,
    overflow: 'hidden',
  },
  msLineFill: {
    height: 2,
    backgroundColor: theme.colors.blue,
  },
  msLabel: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 10,
    color: theme.colors.textMid,
    textAlign: 'center',
    lineHeight: 13,
  },
  msDate: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: 10,
    color: theme.colors.textLight,
    textAlign: 'center',
  },

  // Historique
  eventRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  eventRowFirst: {
    backgroundColor: 'rgba(39,100,255,0.04)',
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.blue,
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.radius.sm,
  },
  eventLeft: {
    alignItems: 'center',
    width: 14,
  },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.border,
    marginTop: 5,
  },
  eventDotFirst: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.blue,
    shadowColor: theme.colors.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 0.4,
  },
  eventConnector: {
    width: 1,
    flex: 1,
    backgroundColor: theme.colors.border,
    marginTop: 4,
    minHeight: 16,
  },
  eventContent: {
    flex: 1,
  },
  eventDesc: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.navy,
    lineHeight: 20,
  },
  eventLocationPill: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    paddingVertical: 3,
    paddingHorizontal: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  eventLocationText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textMid,
  },
  eventTime: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs + 1,
    color: theme.colors.textLight,
    marginTop: theme.spacing[1],
  },
  showMoreBtn: {
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
  },
  showMoreText: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.blue,
  },

  // Erreur
  problemLink: { alignSelf: 'center', paddingVertical: theme.spacing[3], paddingHorizontal: theme.spacing[4], marginTop: theme.spacing[2] },
  problemLinkText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: theme.colors.blue,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[8],
    gap: theme.spacing[3],
  },
  errorCircle: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.bluePale,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  errorIcon: { fontSize: 40 },
  errorTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.lg - 1,
    color: theme.colors.navy,
  },
  errorSub: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textLight,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorBtn: {
    borderWidth: 1.5,
    borderColor: theme.colors.navy,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    marginTop: theme.spacing[3],
  },
  errorBtnText: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.navy,
  },

  // Skeleton
  shimmerBase: {
    backgroundColor: theme.colors.bluePale,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  skeletonCircleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing[4],
  },
})
