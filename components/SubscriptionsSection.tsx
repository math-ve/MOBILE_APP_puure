import { useEffect, useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Linking, Alert, ActivityIndicator, Animated, Easing, Image,
} from 'react-native'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../lib/supabase'
import theme from '../lib/theme'
import { useToast } from '../hooks/useToast'

const SUPABASE_URL = 'https://vwlqdrrlggolgdssdwoh.supabase.co'
const SITE_URL = 'https://puurefilters.com'

// ─── Helpers ───────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  active: { label: 'ACTIF', bg: 'rgba(30,187,110,0.2)', color: theme.colors.success },
  paused: { label: 'PAUSÉ', bg: 'rgba(255,92,0,0.2)', color: theme.colors.warning },
  cancelled: { label: 'ANNULÉ', bg: 'rgba(227,44,43,0.2)', color: theme.colors.error },
}
const getStatus = (status: string) => STATUS_MAP[status?.toLowerCase()] ?? STATUS_MAP.cancelled

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const formatFrequency = (unit: string | null, value: number | null) => {
  if (!unit || value == null) return '—'
  const labels: Record<string, string> = {
    week: 'semaines', weeks: 'semaines',
    month: 'mois', months: 'mois',
    day: 'jours', days: 'jours',
  }
  const label = labels[unit.toLowerCase()] ?? unit
  const prefix = unit.toLowerCase().startsWith('week') ? 'Toutes les' : 'Tous les'
  return `${prefix} ${value} ${label}`
}

const formatPrice = (amount: number | null, currency: string | null) => {
  if (amount == null) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: currency ?? 'EUR', minimumFractionDigits: 2,
  }).format(amount)
}

const getProductImage = (sub: any): string | null =>
  sub.contract_details_json?.[0]?.variantImage ?? null

// ─── Sous-composants ───────────────────────────────────────

function ProductImage({ uri, small }: { uri: string; small?: boolean }) {
  const scale = useRef(new Animated.Value(0.9)).current
  useEffect(() => {
    Animated.timing(scale, {
      toValue: 1, duration: 600, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true,
    }).start()
  }, [])
  return (
    <Animated.View style={[small ? styles.bannerImageSmall : styles.bannerImage, { transform: [{ scale }] }]}>
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
    </Animated.View>
  )
}

function StatusDot({ color, pulse }: { color: string; pulse: boolean }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!pulse) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] })
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] })
  return (
    <Animated.View
      style={[styles.statusDot, { backgroundColor: color }, pulse && { transform: [{ scale }], opacity }]}
    />
  )
}

function CascadeIn({ index, children }: { index: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(30)).current
  useEffect(() => {
    const easing = Easing.bezier(0.16, 1, 0.3, 1)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: index * 100, easing, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 400, delay: index * 100, easing, useNativeDriver: true }),
    ]).start()
  }, [])
  return <Animated.View style={{ opacity, transform: [{ translateY: ty }] }}>{children}</Animated.View>
}

// ─── Section ───────────────────────────────────────────────

export interface SubscriptionsSectionHandle {
  reload: () => Promise<void>
}

/**
 * Section « Mon abonnement » : rendue en tête de l'écran Livraisons.
 * Contient toute la logique (chargement, pause/reprise/annulation) sans
 * ScrollView ni titre — le parent gère le scroll et le pull-to-refresh.
 * Le parent peut déclencher un reload via ref.
 */
const SubscriptionsSection = forwardRef<SubscriptionsSectionHandle>((_props, ref) => {
  const { showToast } = useToast()
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  const loadSubscriptions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: subs } = await supabase
        .from('subscriptions_cache')
        .select('*')
        .eq('user_id', user.id)
        .order('next_billing_date', { ascending: true })
      const rank: Record<string, number> = { active: 0, paused: 1, cancelled: 2 }
      setSubscriptions((subs ?? []).sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3)))
    } catch {
      // Réseau indisponible : on conserve l'état actuel.
    }
  }

  const triggerSync = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`${SUPABASE_URL}/functions/v1/sync-subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ user_id: session.user.id }),
    })
  }

  useEffect(() => {
    triggerSync().catch(() => {})
    loadSubscriptions().finally(() => setLoading(false))
  }, [])

  // Rechargement déclenché par le parent (pull-to-refresh)
  useImperativeHandle(ref, () => ({
    reload: async () => {
      try { await triggerSync() } catch { /* offline */ }
      await loadSubscriptions()
    },
  }))

  const callManage = async (contractId: string, action: 'pause' | 'resume' | 'cancel') => {
    const key = `${contractId}_${action}`
    setActionLoading(prev => ({ ...prev, [key]: true }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: session.user.id, subscription_contract_id: contractId, action }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Erreur inconnue')
      await triggerSync().catch(() => {})
      await loadSubscriptions()
      const messages: Record<string, string> = {
        pause: 'Abonnement mis en pause', resume: 'Abonnement repris', cancel: 'Abonnement annulé',
      }
      showToast(messages[action] ?? 'Action réussie', 'success')
    } catch {
      showToast('Une erreur est survenue', 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const confirmCancel = (contractId: string) => {
    Alert.alert(
      'Annuler l\'abonnement',
      'Cette action est irréversible. Votre abonnement sera définitivement annulé.',
      [
        { text: 'Retour', style: 'cancel' },
        { text: 'Annuler l\'abonnement', style: 'destructive', onPress: () => callManage(contractId, 'cancel') },
      ]
    )
  }

  const openManageMenu = (contractId: string) => {
    Alert.alert(
      'Gérer l\'abonnement',
      'Que souhaitez-vous faire ?',
      [
        { text: '⏸ Mettre en pause', onPress: () => callManage(contractId, 'pause') },
        { text: '✕ Annuler l\'abonnement', style: 'destructive', onPress: () => confirmCancel(contractId) },
        { text: 'Retour', style: 'cancel' },
      ]
    )
  }

  const activeSubs = subscriptions.filter(s => s.status === 'active')
  const historySubs = subscriptions.filter(s => s.status !== 'active')

  const renderBanner = (sub: any, compact: boolean) => {
    const status = getStatus(sub.status)
    const image = getProductImage(sub)
    return (
      <LinearGradient colors={[theme.colors.navy, theme.colors.navyDark]} style={compact ? styles.bannerCompact : styles.banner}>
        {image && <ProductImage uri={image} small={compact} />}
        <View style={{ flex: 1 }}>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <StatusDot color={status.color} pulse={sub.status === 'active'} />
            <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
          </View>
          <Text style={styles.bannerName} numberOfLines={2}>{sub.product_name ?? '—'}</Text>
          {!compact && <Text style={styles.bannerId}>#{sub.appstle_subscription_id}</Text>}
          {sub.status === 'cancelled' && (
            <Text style={styles.cancelledAt}>
              {sub.cancelled_at ? `Annulé le ${formatDate(sub.cancelled_at)}`
                : sub.updated_at ? `Annulé le ${formatDate(sub.updated_at)}` : 'Annulé'}
            </Text>
          )}
        </View>
      </LinearGradient>
    )
  }

  const renderInfoRows = (sub: any) => (
    <View style={styles.infoSection}>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>📅  Prochaine facturation</Text>
        <Text style={styles.infoValue}>{formatDate(sub.next_billing_date)}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>🔄  Fréquence</Text>
        <Text style={styles.infoValue}>{formatFrequency(sub.frequency_unit, sub.frequency_value)}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>💳  Montant</Text>
        <Text style={styles.infoValue}>{formatPrice(sub.price_amount, sub.price_currency)}</Text>
      </View>
    </View>
  )

  const renderActionButton = (
    sub: any, action: 'pause' | 'resume' | 'cancel', label: string, color: string, bg: string, border: string,
  ) => {
    const cid = sub.appstle_subscription_id
    const isLoading = !!actionLoading[`${cid}_${action}`]
    const onPress = action === 'cancel' ? () => confirmCancel(cid) : () => callManage(cid, action)
    return (
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: bg, borderColor: border }]}
        onPress={onPress} disabled={isLoading} activeOpacity={0.8}
      >
        {isLoading ? <ActivityIndicator color={color} size="small" />
          : <Text style={[styles.actionBtnText, { color }]}>{label}</Text>}
      </TouchableOpacity>
    )
  }

  // Skeleton compact pendant le chargement initial
  if (loading) {
    return (
      <View style={[styles.card, { height: 200, opacity: 0.4 }]}>
        <View style={styles.banner} />
      </View>
    )
  }

  // Section masquée entièrement si aucun abonnement (l'écran affiche alors juste les commandes)
  if (subscriptions.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyCardTitle}>Aucun abonnement actif</Text>
        <Text style={styles.emptyCardSub}>Recevez vos filtres automatiquement et économisez.</Text>
        <TouchableOpacity style={styles.btnBlue} onPress={() => Linking.openURL(SITE_URL)} activeOpacity={0.85}>
          <Text style={styles.btnBlueText}>Voir nos abonnements →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <>
      <Text style={styles.sectionHeading}>MON ABONNEMENT</Text>

      {/* Abonnements actifs */}
      {activeSubs.map((sub, index) => {
        const cid = sub.appstle_subscription_id
        return (
          <CascadeIn key={cid} index={index}>
            <View style={styles.card}>
              {renderBanner(sub, false)}
              {renderInfoRows(sub)}
              <View style={styles.divider} />
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.btnDetail}
                  onPress={() => router.push({ pathname: '/subscription-detail', params: { contractId: cid, subData: JSON.stringify(sub) } })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnDetailText}>→ Voir les détails</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnManage} onPress={() => openManageMenu(cid)} activeOpacity={0.7}>
                  <Text style={styles.btnManageText}>Gérer l'abonnement</Text>
                </TouchableOpacity>
              </View>
            </View>
          </CascadeIn>
        )
      })}

      {/* Historique — pausés / annulés */}
      {historySubs.length > 0 && (
        <>
          <Text style={styles.historyTitle}>HISTORIQUE</Text>
          {historySubs.map((sub, index) => {
            const cid = sub.appstle_subscription_id
            const isPaused = sub.status === 'paused'
            const isCancelled = sub.status === 'cancelled'
            return (
              <CascadeIn key={cid} index={activeSubs.length + index}>
                <View style={[styles.card, isCancelled ? styles.cardCancelled : styles.cardHistory]}>
                  {renderBanner(sub, true)}
                  {renderInfoRows(sub)}
                  {isPaused && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.actions}>
                        {renderActionButton(sub, 'resume', '▶ Reprendre', theme.colors.success, 'rgba(30,187,110,0.08)', 'rgba(30,187,110,0.3)')}
                      </View>
                    </>
                  )}
                </View>
              </CascadeIn>
            )
          })}
        </>
      )}

      {/* Lien gérer sur le site */}
      <TouchableOpacity onPress={() => Linking.openURL(`${SITE_URL}/account`)} activeOpacity={0.7} style={styles.manageLink}>
        <Text style={styles.manageLinkText}>Gérer sur le site →</Text>
      </TouchableOpacity>
    </>
  )
})

SubscriptionsSection.displayName = 'SubscriptionsSection'
export default SubscriptionsSection

// ─── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionHeading: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    letterSpacing: 1.2,
    marginBottom: theme.spacing[1],
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    overflow: 'hidden',
    marginBottom: theme.spacing[4],
    ...theme.shadows.strong,
  },
  cardHistory: { opacity: 0.7 },
  cardCancelled: { opacity: 0.55 },
  cancelledAt: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs + 1,
    color: 'rgba(255,255,255,0.5)',
    marginTop: theme.spacing[1],
  },
  banner: { height: 140, padding: theme.spacing[5], position: 'relative', justifyContent: 'center' },
  bannerCompact: { minHeight: 80, padding: theme.spacing[4], position: 'relative', justifyContent: 'center' },
  bannerImage: { position: 'absolute', bottom: -10, right: theme.spacing[4], height: 120, width: 100, opacity: 0.9 },
  bannerImageSmall: { position: 'absolute', bottom: -6, right: theme.spacing[4], height: 70, width: 60, opacity: 0.9 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] + 2,
    borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing[2] + 2, paddingVertical: theme.spacing[1],
    alignSelf: 'flex-start', marginBottom: theme.spacing[2],
  },
  statusBadgeText: { fontFamily: theme.typography.fontFamily.bold, fontSize: 10, letterSpacing: 0.8 },
  statusDot: { width: 6, height: 6, borderRadius: theme.radius.full },
  bannerName: {
    fontFamily: theme.typography.fontFamily.bold, fontSize: theme.typography.size.lg - 1,
    color: theme.colors.white, letterSpacing: -0.3, marginRight: 100,
  },
  bannerId: {
    fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.size.xs + 1,
    color: 'rgba(255,255,255,0.45)', marginTop: theme.spacing[1],
  },
  infoSection: { paddingVertical: theme.spacing[4], paddingHorizontal: theme.spacing[5], gap: theme.spacing[3] },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoLabel: { fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.size.sm, color: theme.colors.textLight },
  infoValue: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.size.base - 1, color: theme.colors.navy },
  divider: { height: 1, backgroundColor: theme.colors.border },
  actions: { paddingVertical: theme.spacing[4], paddingHorizontal: theme.spacing[5], gap: theme.spacing[2] + 2 },
  btnDetail: { height: 48, backgroundColor: theme.colors.blue, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnDetailText: { fontFamily: theme.typography.fontFamily.bold, fontSize: theme.typography.size.base, color: theme.colors.white },
  btnManage: { height: 40, alignItems: 'center', justifyContent: 'center' },
  btnManageText: {
    fontFamily: theme.typography.fontFamily.medium, fontSize: theme.typography.size.sm,
    color: theme.colors.textLight, textDecorationLine: 'underline',
  },
  actionBtn: { flex: 1, height: 44, borderRadius: theme.radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.size.base - 1 },
  historyTitle: {
    fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.size.xs,
    color: theme.colors.textLight, letterSpacing: 1.2, marginTop: theme.spacing[2], marginBottom: theme.spacing[2],
  },
  manageLink: { alignItems: 'center', paddingVertical: theme.spacing[3] },
  manageLinkText: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: theme.typography.size.sm, color: theme.colors.blue },
  // État vide (carte compacte, pas plein écran)
  emptyCard: {
    backgroundColor: theme.colors.white, borderRadius: theme.radius['2xl'],
    padding: theme.spacing[5], alignItems: 'center', ...theme.shadows.card,
  },
  emptyCardTitle: { fontFamily: theme.typography.fontFamily.bold, fontSize: theme.typography.size.lg, color: theme.colors.navy },
  emptyCardSub: {
    fontFamily: theme.typography.fontFamily.regular, fontSize: theme.typography.size.sm,
    color: theme.colors.textLight, textAlign: 'center', marginTop: theme.spacing[2],
  },
  btnBlue: {
    backgroundColor: theme.colors.blue, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing[3], paddingHorizontal: theme.spacing[6], marginTop: theme.spacing[4],
  },
  btnBlueText: { fontFamily: theme.typography.fontFamily.bold, fontSize: theme.typography.size.base, color: theme.colors.white },
})
