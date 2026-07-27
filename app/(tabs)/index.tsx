import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, RefreshControl, Modal,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import theme from '../../lib/theme'
import ProgressRing from '../../components/ui/ProgressRing'
import Logo from '../../components/ui/Logo'
import SystemsProgress from '../../components/ui/SystemsProgress'

// ─── Helpers ───────────────────────────────────────────────

const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

const formatToday = () => {
  const d = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  return d.charAt(0).toUpperCase() + d.slice(1)
}

const getProgress = (timer: any) => {
  const elapsed = (Date.now() - new Date(timer.started_at).getTime() - timer.total_paused_seconds * 1000) / 1000
  return Math.min(Math.round((elapsed / (timer.expected_duration_days * 86400)) * 100), 100)
}

const getDaysRemaining = (timer: any) => {
  const elapsedDays = (Date.now() - new Date(timer.started_at).getTime() - timer.total_paused_seconds * 1000) / 86400000
  return Math.max(0, Math.ceil(timer.expected_duration_days - elapsedDays))
}

const getProgressColor = (p: number) =>
  p >= 95 ? theme.colors.error : p >= 80 ? theme.colors.warning : theme.colors.blue

const getProgressBg = (p: number) =>
  p >= 95 ? 'rgba(227,44,43,0.10)' : p >= 80 ? 'rgba(255,92,0,0.10)' : 'rgba(39,100,255,0.10)'

const NOTIF_LAST_SEEN_KEY = 'notifications_last_seen'

const NOTIF_TYPE_ICONS: Record<string, string> = {
  subscription_renewal_soon: '🔄',
  cartridge_80: '💧',
  cartridge_95: '⚠️',
  order_shipped: '📦',
}

const formatNotifDate = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    + ' · '
    + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
}

// ─── Petits composants animés ──────────────────────────────

function FadeIn({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: any }) {
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(20)).current

  useEffect(() => {
    const easing = Easing.bezier(0.16, 1, 0.3, 1)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: index * 100, easing, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 400, delay: index * 100, easing, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY: ty }] }]}>
      {children}
    </Animated.View>
  )
}

function PulseRing({ delay }: { delay: number }) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] })
  const opacity = anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.7, 0.25, 0] })

  return (
    <Animated.View
      style={[styles.pulseRing, { transform: [{ scale }], opacity }]}
    />
  )
}

function PurityIndicator() {
  return (
    <View style={styles.purityIndicator}>
      <PulseRing delay={0} />
      <PulseRing delay={300} />
      <PulseRing delay={600} />
      <View style={styles.purityCore} />
    </View>
  )
}

function Skeleton({ style }: { style?: any }) {
  const anim = useRef(new Animated.Value(-1)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
    )
    loop.start()
    return () => loop.stop()
  }, [])

  const translateX = anim.interpolate({ inputRange: [-1, 1], outputRange: [-200, 200] })

  return (
    <View style={[styles.skeleton, style]}>
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

function BellIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10.5 3.17 10.5 4v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
        fill={theme.colors.white}
      />
    </Svg>
  )
}

function DropIcon({ size = 64, color = theme.colors.border }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13z" fill={color} />
    </Svg>
  )
}

// ─── Écran ─────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets()
  const [profile, setProfile] = useState<any>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [timers, setTimers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [hasUnread, setHasUnread] = useState(false)
  const [notifSheetOpen, setNotifSheetOpen] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login'); return }
      setUserEmail(user.email ?? null)
      const [{ data: prof }, { data: tim }, { data: notifs }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('cartridge_timers').select('*, filters(*)').eq('user_id', user.id).eq('is_active', true),
        supabase.from('notification_logs').select('*').eq('user_id', user.id).order('sent_at', { ascending: false }).limit(20),
      ])
      setProfile(prof)
      setTimers(tim ?? [])

      const notifList = notifs ?? []
      setNotifications(notifList)
      const lastSeen = await AsyncStorage.getItem(NOTIF_LAST_SEEN_KEY)
      setHasUnread(
        notifList.length > 0 &&
        (!lastSeen || new Date(notifList[0].sent_at).getTime() > new Date(lastSeen).getTime())
      )
    } catch {
      // Réseau/backend indisponible : on garde l'UI en état vide plutôt que de crasher.
      // Le pull-to-refresh permet de réessayer.
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await loadData() } finally { setRefreshing(false) }
  }, [])

  const handleSignOut = async () => {
    // Détache le push token de ce compte — l'appareil ne recevra plus ses notifications
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ push_token: null }).eq('id', user.id)
    }
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  const openNotifications = async () => {
    setNotifSheetOpen(true)
    setHasUnread(false)
    await AsyncStorage.setItem(NOTIF_LAST_SEEN_KEY, new Date().toISOString())
  }

  // "Mathieu" depuis full_name, sinon depuis l'email avant le "." capitalisé
  const rawFirstName = profile?.full_name?.split(' ')[0]
    ?? userEmail?.split('@')[0]?.split('.')[0]
    ?? null
  const firstName = rawFirstName
    ? rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1)
    : null

  const waterIsPure = timers.length > 0 && timers.every(t => getProgress(t) < 80)
  // Types de systèmes possédés (dérivés des filtres actifs) pour le bloc gamifié
  const ownedSystemTypes = Array.from(
    new Set(timers.map(t => t.filters?.filter_type).filter(Boolean)),
  )

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.white} />
      }
    >
      {/* ── SECTION 1 : HEADER NAVY ── */}
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing[5] }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.headerLogo}>
            <Logo width={88} color={theme.colors.white} />
          </View>
          <Text style={styles.greeting}>
            {firstName ? `${getGreeting()}, ${firstName}` : getGreeting()}
          </Text>
          <Text style={styles.dateText}>{formatToday()}</Text>
        </View>
        <TouchableOpacity
          style={styles.bellCircle}
          onPress={openNotifications}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={hasUnread ? 'Notifications, nouvelles notifications non lues' : 'Notifications'}
        >
          <BellIcon />
          {hasUnread && <View style={styles.bellBadge} />}
        </TouchableOpacity>
      </View>

      {loading ? (
        /* ── SKELETONS ── */
        <View style={styles.skeletonArea}>
          <Skeleton style={{ height: 320, borderRadius: theme.radius['2xl'] }} />
          <View style={styles.row}>
            <Skeleton style={{ flex: 1, height: 140, borderRadius: theme.radius.xl }} />
            <Skeleton style={{ flex: 1, height: 140, borderRadius: theme.radius.xl }} />
          </View>
          <Skeleton style={{ height: 80, borderRadius: theme.radius.xl }} />
        </View>
      ) : (
        <>
          {/* ── SECTION 2 : HERO TIMER CARTOUCHE ── */}
          <FadeIn index={0} style={styles.heroWrap}>
            <View style={styles.heroCard}>
              {timers.length === 0 ? (
                <View style={styles.emptyState}>
                  <DropIcon />
                  <Text style={styles.emptyTitle}>Aucun filtre configuré</Text>
                  <TouchableOpacity
                    style={styles.btnBlue}
                    onPress={() => router.push('/(tabs)/filters')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnBlueText}>Ajouter mon filtre →</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.sectionCaps}>VOS CARTOUCHES</Text>
                  {timers.map((t, i) => {
                    const p = getProgress(t)
                    const days = getDaysRemaining(t)
                    return (
                      <View key={t.id} style={[styles.timerBlock, i > 0 && styles.timerBlockDivider]}>
                        {/* Nom + badge % */}
                        <View style={styles.timerHeader}>
                          <Text style={styles.timerName}>{t.filters?.product_name ?? 'Filtre'}</Text>
                          <View style={[styles.pctBadge, { backgroundColor: getProgressBg(p) }]}>
                            <Text style={[styles.pctBadgeText, { color: getProgressColor(p) }]}>{p}%</Text>
                          </View>
                        </View>

                        {/* Jauge circulaire */}
                        <View style={styles.ringWrap}>
                          <ProgressRing progress={p} size={180} strokeWidth={12} label="utilisé" />
                        </View>

                        {/* 3 stats */}
                        <View style={styles.statsRow}>
                          <View style={styles.statCol}>
                            <Text style={styles.statValue}>{p}%</Text>
                            <Text style={styles.statLabel}>UTILISÉ</Text>
                          </View>
                          <View style={styles.statDivider} />
                          <View style={styles.statCol}>
                            <Text style={styles.statValue}>{days}j</Text>
                            <Text style={styles.statLabel}>RESTANTS</Text>
                          </View>
                        </View>

                        {/* Bouton remplacé */}
                        <TouchableOpacity
                          style={styles.btnOutline}
                          onPress={() => router.push('/(tabs)/filters')}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.btnOutlineText}>💧 Cartouche remplacée</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                </>
              )}
            </View>
          </FadeIn>

          {/* ── SECTION 3 : SYSTÈMES PUURE (gamifié) ── */}
          <FadeIn index={1} style={styles.section}>
            <SystemsProgress ownedTypes={ownedSystemTypes} />
          </FadeIn>

          {/* ── SECTION 4 : BANNER EAU PURIFIÉE ── */}
          {waterIsPure && (
            <FadeIn index={2}>
              <View style={styles.purityBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.purityTitle}>Votre eau est purifiée 💧</Text>
                  <Text style={styles.puritySub}>Filtre actif · Qualité optimale</Text>
                </View>
                <PurityIndicator />
              </View>
            </FadeIn>
          )}

          {/* ── SECTION 5 : DÉCONNEXION ── */}
          <FadeIn index={3}>
            <View style={{ height: theme.spacing[6] }} />
            <TouchableOpacity onPress={handleSignOut} activeOpacity={0.6}>
              <Text style={styles.signOut}>Se déconnecter</Text>
            </TouchableOpacity>
          </FadeIn>
        </>
      )}

      {/* ── SHEET NOTIFICATIONS ── */}
      <Modal
        visible={notifSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotifSheetOpen(false)}
      >
        <View style={styles.notifBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setNotifSheetOpen(false)} activeOpacity={1} />
          <View style={[styles.notifSheet, { paddingBottom: insets.bottom + theme.spacing[6] }]}>
            <View style={styles.notifHandle} />
            <Text style={styles.notifTitle}>Notifications</Text>
            {notifications.length === 0 ? (
              <View style={styles.notifEmpty}>
                <Text style={styles.notifEmptyIcon}>🔔</Text>
                <Text style={styles.notifEmptyText}>Aucune notification pour le moment</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {notifications.map((n) => (
                  <View key={n.id} style={styles.notifRow}>
                    <Text style={styles.notifIcon}>{NOTIF_TYPE_ICONS[n.type] ?? '🔔'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifRowTitle}>{n.title}</Text>
                      <Text style={styles.notifRowBody}>{n.body}</Text>
                      <Text style={styles.notifRowDate}>{formatNotifDate(n.sent_at)}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

// ─── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingBottom: 120,
  },

  // Header
  header: {
    backgroundColor: theme.colors.navy,
    paddingHorizontal: theme.spacing[6],
    // Padding étendu : la hero card vient chevaucher le bas du header (vrai overlap premium)
    paddingBottom: theme.spacing[5] + theme.spacing[8],
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    marginBottom: theme.spacing[3],
    marginLeft: -9, // compense le blanc tournant du viewBox SVG (~11 % à gauche) pour aligner la goutte sur le texte
  },
  greeting: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size['3xl'],
    color: theme.colors.white,
    letterSpacing: -0.5,
  },
  dateText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  bellCircle: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.error,
  },

  // Skeletons
  skeletonArea: {
    paddingHorizontal: theme.spacing[4],
    marginTop: -theme.spacing[8],
    gap: theme.spacing[4],
  },
  skeleton: {
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },

  // Hero
  heroWrap: {
    marginHorizontal: theme.spacing[4],
    marginTop: -theme.spacing[8],
  },
  // Sections sous le hero : marge latérale cohérente + espacement vertical
  section: {
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[5],
  },
  heroCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[5],
    ...theme.shadows.card,
  },
  sectionCaps: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textLight,
    letterSpacing: 1.2,
    marginBottom: theme.spacing[3],
  },
  timerBlock: {},
  timerBlockDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing[5],
    paddingTop: theme.spacing[5],
  },
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerName: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.md,
    color: theme.colors.navy,
    flex: 1,
    marginRight: theme.spacing[3],
  },
  pctBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  pctBadgeText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.sm,
  },
  ringWrap: {
    alignItems: 'center',
    marginVertical: theme.spacing[4],
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: theme.spacing[5],
  },
  statCol: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.lg,
    color: theme.colors.navy,
  },
  statLabel: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 10,
    color: theme.colors.textLight,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.colors.border,
  },
  btnOutline: {
    height: 44,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textMid,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing[6],
    gap: theme.spacing[4],
  },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.md,
    color: theme.colors.textMid,
  },
  btnBlue: {
    backgroundColor: theme.colors.blue,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  btnBlueText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.white,
  },

  // Row de mini-cards
  row: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    marginTop: theme.spacing[4],
  },

  // Banner pureté
  purityBanner: {
    backgroundColor: theme.colors.navy,
    borderRadius: theme.radius.xl,
    padding: theme.spacing[5],
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
  },
  purityTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.white,
  },
  puritySub: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs + 1,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 3,
  },
  purityIndicator: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: theme.colors.success,
  },
  purityCore: {
    width: 12,
    height: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.success,
  },

  // Sheet notifications
  notifBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,21,61,0.5)',
    justifyContent: 'flex-end',
  },
  notifSheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius['3xl'],
    borderTopRightRadius: theme.radius['3xl'],
    padding: theme.spacing[6],
  },
  notifHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: theme.spacing[5],
  },
  notifTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.xl,
    color: theme.colors.navy,
    marginBottom: theme.spacing[4],
  },
  notifEmpty: {
    alignItems: 'center',
    paddingVertical: theme.spacing[8],
    gap: theme.spacing[3],
  },
  notifEmptyIcon: { fontSize: 36 },
  notifEmptyText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base,
    color: theme.colors.textLight,
  },
  notifRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  notifIcon: {
    fontSize: 22,
    marginTop: 2,
  },
  notifRowTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
  },
  notifRowBody: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textMid,
    lineHeight: 19,
    marginTop: 2,
  },
  notifRowDate: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textLight,
    marginTop: theme.spacing[1],
  },

  // Déconnexion
  signOut: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    textAlign: 'center',
  },
})
