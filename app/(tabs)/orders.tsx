import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Linking, Animated, Easing,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '../../lib/supabase'
import theme from '../../lib/theme'
import { useToast } from '../../hooks/useToast'

const SUPABASE_URL = 'https://vwlqdrrlggolgdssdwoh.supabase.co'

// ─── Statuts ───────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; bg: string; color: string }> = {
  unfulfilled: { label: 'À expédier', bg: 'rgba(255,92,0,0.10)', color: theme.colors.warning },
  fulfilled: { label: 'Expédiée', bg: 'rgba(39,100,255,0.10)', color: theme.colors.blue },
  delivered: { label: 'Livrée', bg: 'rgba(30,187,110,0.12)', color: theme.colors.success },
  cancelled: { label: 'Annulée', bg: 'rgba(227,44,43,0.10)', color: theme.colors.error },
  shipped: { label: 'En transit', bg: 'rgba(39,100,255,0.10)', color: theme.colors.blue },
}

const FALLBACK_STATUS = { label: 'En cours', bg: 'rgba(35,48,86,0.08)', color: theme.colors.textMid }

const getStatus = (status: string) =>
  STATUS_MAP[status?.toLowerCase()] ?? FALLBACK_STATUS

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const formatPrice = (amount: number | string | null, currency: string | null) => {
  if (amount == null) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency ?? 'EUR',
    minimumFractionDigits: 2,
  }).format(typeof amount === 'string' ? parseFloat(amount) : amount)
}

// ─── Animations ────────────────────────────────────────────

function CascadeIn({ index, children }: { index: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(24)).current

  useEffect(() => {
    const easing = Easing.bezier(0.16, 1, 0.3, 1)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 80, easing, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 350, delay: index * 80, easing, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: ty }] }}>
      {children}
    </Animated.View>
  )
}

function SkeletonCard() {
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
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonInner}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={[theme.colors.bluePale, theme.colors.background, theme.colors.bluePale]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>
    </View>
  )
}

// ─── Écran ─────────────────────────────────────────────────

export default function OrdersScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const scrollY = useRef(new Animated.Value(0)).current

  const loadOrders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('orders_cache')
        .select('*')
        .eq('user_id', user.id)
        .order('shopify_created_at', { ascending: false })
      setOrders(data ?? [])
    } catch {
      // Réseau indisponible : on conserve l'état actuel, pull-to-refresh pour réessayer.
    }
  }

  const syncAndReload = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await fetch(`${SUPABASE_URL}/functions/v1/sync-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_id: session.user.id }),
      })
      await loadOrders()
      showToast('Commandes mises à jour', 'success')
    } catch {
      showToast('Erreur de synchronisation', 'error')
    }
  }

  useEffect(() => {
    // Affiche le cache immédiatement, sync en arrière-plan sans bloquer
    loadOrders().finally(() => setLoading(false))
    syncAndReload()
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await syncAndReload() } finally { setRefreshing(false) }
  }, [])

  const headerShadowOpacity = scrollY.interpolate({
    inputRange: [0, 20],
    outputRange: [0, 0.08],
    extrapolate: 'clamp',
  })

  return (
    <View style={styles.root}>
      {/* ── HEADER STICKY ── */}
      <Animated.View
        style={[
          styles.stickyHeader,
          { paddingTop: insets.top + theme.spacing[5], shadowOpacity: headerShadowOpacity },
        ]}
      >
        <Text style={styles.pageTitle}>Mes commandes</Text>
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.blue} />
        }
      >
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : orders.length === 0 ? (
          /* ── ÉTAT VIDE ── */
          <CascadeIn index={0}>
            <View style={styles.emptyWrap}>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyIcon}>📦</Text>
              </View>
              <Text style={styles.emptyTitle}>Aucune commande</Text>
              <Text style={styles.emptySub}>Vos commandes apparaîtront ici</Text>
              <TouchableOpacity
                style={styles.btnBlue}
                onPress={() => Linking.openURL('https://puurefilters.com')}
                activeOpacity={0.85}
              >
                <Text style={styles.btnBlueText}>Découvrir nos produits →</Text>
              </TouchableOpacity>
            </View>
          </CascadeIn>
        ) : (
          orders.map((order, index) => {
            const status = getStatus(order.status)
            const items: any[] = Array.isArray(order.line_items) ? order.line_items : []
            const visibleItems = items.slice(0, 2)
            const hiddenCount = items.length - visibleItems.length

            return (
              <CascadeIn key={order.id} index={index}>
                <TouchableOpacity style={styles.card} activeOpacity={0.9}>

                  {/* Header commande */}
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1, marginRight: theme.spacing[3] }}>
                      <Text style={styles.orderNumber}>#{order.order_number}</Text>
                      <Text style={styles.orderDate}>{formatDate(order.shopify_created_at)}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: status.color }]}>
                        {status.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Produits */}
                  <View style={styles.products}>
                    {visibleItems.map((item, i) => (
                      <View key={i} style={styles.productRow}>
                        <Text style={styles.productName} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.productQty}>×{item.quantity}</Text>
                      </View>
                    ))}
                    {hiddenCount > 0 && (
                      <Text style={styles.moreProducts}>
                        + {hiddenCount} autre{hiddenCount > 1 ? 's' : ''}
                      </Text>
                    )}
                  </View>

                  <View style={styles.divider} />

                  {/* Footer */}
                  <View style={styles.cardFooter}>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>TOTAL</Text>
                      <Text style={styles.totalValue}>
                        {formatPrice(order.total_price, order.currency)}
                      </Text>
                    </View>
                    {order.tracking_number && (
                      <TouchableOpacity
                        style={styles.trackBtn}
                        onPress={() => router.push({
                          pathname: '/tracking',
                          params: {
                            tracking_number: order.tracking_number,
                            order_number: order.order_number,
                          },
                        })}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.trackBtnText}>📦 Suivre ma commande →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              </CascadeIn>
            )
          })
        )}
      </Animated.ScrollView>
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Header sticky
  stickyHeader: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing[6],
    paddingBottom: theme.spacing[4],
    shadowColor: theme.colors.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
    zIndex: 10,
  },
  pageTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size['3xl'],
    color: theme.colors.navy,
    letterSpacing: -0.5,
  },

  content: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    paddingBottom: 120,
    gap: theme.spacing[4],
  },

  // Skeleton
  skeletonCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[4],
    ...theme.shadows.card,
  },
  skeletonInner: {
    height: 140 - theme.spacing[4] * 2,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bluePale,
    overflow: 'hidden',
  },

  // État vide
  emptyWrap: {
    alignItems: 'center',
    paddingTop: theme.spacing[16],
    gap: theme.spacing[3],
  },
  emptyCircle: {
    width: 120,
    height: 120,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.bluePale,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.lg,
    color: theme.colors.navy,
  },
  emptySub: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textLight,
  },
  btnBlue: {
    backgroundColor: theme.colors.blue,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    marginTop: theme.spacing[3],
  },
  btnBlueText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.white,
  },

  // Card commande
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    ...theme.shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[5],
  },
  orderNumber: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.md,
    color: theme.colors.navy,
  },
  orderDate: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  statusBadgeText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.xs,
    letterSpacing: 0.3,
  },

  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },

  // Produits
  products: {
    paddingVertical: theme.spacing[3] + 2,
    paddingHorizontal: theme.spacing[5],
    gap: theme.spacing[2],
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productName: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textMid,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  productQty: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
  },
  moreProducts: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs + 1,
    color: theme.colors.textLight,
    fontStyle: 'italic',
  },

  // Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    flexShrink: 1,
  },
  totalLabel: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 10,
    color: theme.colors.textLight,
    letterSpacing: 1,
  },
  totalValue: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.md,
    color: theme.colors.navy,
  },
  trackBtn: {
    height: 36,
    borderWidth: 1,
    borderColor: theme.colors.blue,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  trackBtnText: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.sm,
    color: theme.colors.blue,
  },
})
