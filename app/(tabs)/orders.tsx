import { useCallback, useEffect, useState } from 'react'
import { Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import AppHeader from '../../components/ds/AppHeader'
import { AlertBanner } from '../../components/ds/Flow'
import Glyph from '../../components/ds/Glyph'
import PlanCard from '../../components/subscription/PlanCard'
import { TAB_BAR_SPACE } from '../../components/ui/TabBar'
import { supabase } from '../../lib/supabase'
import { subscriptionApi } from '../../lib/subscriptionApi'
import { orderImage, orderStatus, orderTitle } from '../../lib/orders'
import { formatCurrency, formatDateShort } from '../../lib/i18n/format'
import { ds, typography } from '../../lib/theme'
import { useToast } from '../../hooks/useToast'

// « Commandes » (maquette P10) : l'abonnement en haut, les commandes dessous.

const SUPABASE_URL = 'https://vwlqdrrlggolgdssdwoh.supabase.co'
const SHOP_URL = 'https://puurefilters.com'

export default function OrdersScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [orders, setOrders] = useState<any[]>([])
  const [subs, setSubs] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadCache = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: o }, { data: s }] = await Promise.all([
        supabase.from('orders_cache').select('*').eq('user_id', user.id).order('shopify_created_at', { ascending: false }),
        supabase.from('subscriptions_cache').select('*').eq('user_id', user.id).in('status', ['active', 'paused']).order('next_billing_date'),
      ])
      setOrders(o ?? [])
      setSubs(s ?? [])
    } catch {
      // Hors ligne : on garde l'affichage.
    } finally {
      setLoaded(true)
    }
  }, [])

  /** Synchronise commandes (Shopify) et abonnements (Appstle), puis recharge. */
  const sync = useCallback(async (manual: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await Promise.all([
        fetch(`${SUPABASE_URL}/functions/v1/sync-orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ user_id: session.user.id }),
        }),
        subscriptionApi.sync(),
      ])
      await loadCache()
    } catch {
      if (manual) showToast(t('orders:syncError'), 'error')
    }
  }, [loadCache])

  useEffect(() => { sync(false) }, [sync])
  useFocusEffect(useCallback(() => { loadCache() }, [loadCache]))

  const onRefresh = async () => {
    setRefreshing(true)
    try { await sync(true) } finally { setRefreshing(false) }
  }

  const openSub = (sub: any, open?: string) => router.push({
    pathname: '/subscription-detail',
    params: { contractId: sub.appstle_subscription_id, subData: JSON.stringify(sub), ...(open ? { open } : {}) },
  })
  const failedSub = subs.find((s) => s.payment_failed_at)

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ds.blue} />}
    >
      <AppHeader />

      {failedSub && (
        <AlertBanner title={t('care:payment.failedTitle')} body={t('care:payment.failedBody')} onPress={() => openSub(failedSub, 'payment')} />
      )}

      <View style={{ paddingTop: 12, alignItems: 'center' }}>
        <Text style={styles.h1} accessibilityRole="header">{t('water:planSection')}</Text>
      </View>
      {subs.length > 0 ? (
        subs.map((s) => <PlanCard key={s.appstle_subscription_id} sub={s} onPress={() => openSub(s)} />)
      ) : loaded ? (
        <View style={[styles.card, { alignItems: 'center', gap: 6 }]}>
          <Text style={styles.cardTitle}>{t('subscription:noActiveSub')}</Text>
          <Text style={[styles.meta, { textAlign: 'center' }]}>{t('subscription:noActiveSubText')}</Text>
          <Pressable onPress={() => Linking.openURL(SHOP_URL)} style={{ paddingTop: 6 }} accessibilityRole="link">
            <Text style={styles.link}>{t('subscription:seeOurSubs')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.sectionHead}>
        <Text style={styles.h1} accessibilityRole="header">{t('orders:myOrders')}</Text>
      </View>

      {loaded && orders.length === 0 ? (
        <View style={[styles.card, { alignItems: 'center', gap: 6 }]}>
          <Text style={styles.cardTitle}>{t('orders:emptyTitle')}</Text>
          <Text style={[styles.meta, { textAlign: 'center' }]}>{t('orders:emptySub')}</Text>
        </View>
      ) : (
        orders.map((o) => {
          const status = orderStatus(o)
          return (
            <View key={o.id} style={styles.card}>
              <View style={styles.orderRow}>
                <Image source={orderImage(o)} style={styles.thumb} />
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{orderTitle(o)}</Text>
                  <Text style={styles.meta} numberOfLines={1}>#{o.order_number} · {formatDateShort(o.shopify_created_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={styles.price}>{formatCurrency(Number(o.total_price ?? 0), o.currency ?? 'EUR')}</Text>
                  <Text style={[styles.status, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>
              {o.tracking_number ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/tracking', params: { tracking_number: o.tracking_number, order_number: o.order_number } })}
                  style={styles.trackRow}
                  accessibilityRole="button"
                >
                  <Text style={styles.trackText}>{t('orders:track')}</Text>
                  <Glyph name="chevron" size={18} color={ds.blue} />
                </Pressable>
              ) : null}
            </View>
          )
        })
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },
  content: { paddingHorizontal: 20, gap: 18 },
  h1: { fontFamily: typography.fontFamily.medium, fontSize: 20, lineHeight: 25, color: ds.ink, textAlign: 'center' },
  sectionHead: { borderTopWidth: 1, borderTopColor: ds.line, marginTop: 8, paddingTop: 28 },
  card: {
    backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: ds.radius.card,
    paddingVertical: 16, paddingHorizontal: 18, gap: 14,
  },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: ds.fill },
  cardTitle: { fontFamily: typography.fontFamily.medium, fontSize: 16, color: ds.ink },
  meta: { fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: ds.muted },
  price: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },
  status: { fontFamily: typography.fontFamily.medium, fontSize: 13 },
  trackRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: ds.line, paddingTop: 14,
  },
  trackText: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.blue },
  link: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.blue },
})
