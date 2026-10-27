import { useCallback, useMemo, useRef, useState } from 'react'
import {
  FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Svg, { Circle, Path } from 'react-native-svg'
import AppHeader from '../../components/ds/AppHeader'
import { AlertBanner } from '../../components/ds/Flow'
import PillButton from '../../components/ds/PillButton'
import Sheet from '../../components/ds/Sheet'
import DotGauge, { AMBER } from '../../components/water/DotGauge'
import SystemsRow, { SYSTEMS } from '../../components/water/SystemsRow'
import PlanCard from '../../components/subscription/PlanCard'
import { TAB_BAR_SPACE } from '../../components/ui/TabBar'
import { supabase } from '../../lib/supabase'
import { ds, typography } from '../../lib/theme'
import { formatDate, formatDateShort } from '../../lib/i18n/format'
import { useToast } from '../../hooks/useToast'
import {
  changeDate, daysLeft, deleteFilter, loadWater, replaceCartridge, SOON_DAYS, togglePause, usedPercent, WaterFilter,
} from '../../lib/water'

// « Mon eau » (maquettes P04, P05, P32) : la cartouche de chaque filtre, le
// conseil de remplacement, les systèmes Puure et l'abonnement.

type SheetKind = 'replace' | 'options' | 'delete' | null

export default function WaterScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { showToast } = useToast()

  const [userId, setUserId] = useState<string | null>(null)
  const [filters, setFilters] = useState<WaterFilter[]>([])
  const [subs, setSubs] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [page, setPage] = useState(0)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [busy, setBusy] = useState(false)
  const pager = useRef<FlatList>(null)

  const load = useCallback(async () => {
    try {
      const water = await loadWater()
      if (!water) { router.replace('/(auth)/login'); return }
      setUserId(water.userId)
      setFilters(water.filters)
      const { data } = await supabase
        .from('subscriptions_cache').select('*')
        .eq('user_id', water.userId).in('status', ['active', 'paused'])
        .order('next_billing_date', { ascending: true })
      setSubs(data ?? [])
    } catch {
      // Hors ligne : on garde l'affichage, le tirer-pour-rafraîchir permet de réessayer.
    } finally {
      setLoaded(true)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const onRefresh = async () => {
    setRefreshing(true)
    try { await load() } finally { setRefreshing(false) }
  }

  const current = filters[Math.min(page, Math.max(filters.length - 1, 0))] ?? null
  const timer = current?.timer ?? null
  const left = daysLeft(timer)
  const soon = !!timer && !timer.paused_at && left <= SOON_DAYS
  const failedSub = subs.find((s) => s.payment_failed_at)
  const activeSub = subs.find((s) => s.status === 'active') ?? subs[0] ?? null
  const owned = useMemo(() => Array.from(new Set(filters.map((f) => f.filter_type))), [filters])
  const ownedSystems = SYSTEMS.filter((s) => owned.includes(s.type)).length
  const months = Math.max(1, Math.round((timer?.expected_duration_days ?? current?.cartridge_lifespan_days ?? 90) / 30))
  const pageWidth = width - 40

  const run = async (fn: () => Promise<void>, message: string) => {
    setBusy(true)
    try {
      await fn()
      showToast(message, 'success')
      setSheet(null)
      await load()
    } catch {
      showToast(t('care:errors.generic'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const openSubscription = (sub: any, open?: string) => router.push({
    pathname: '/subscription-detail',
    params: { contractId: sub.appstle_subscription_id, subData: JSON.stringify(sub), ...(open ? { open } : {}) },
  })

  // ── Bloc d'un filtre (titre + jauge + chiffres) ─────────────────
  const renderFilter = ({ item }: { item: WaterFilter }) => {
    const ft = item.timer
    const u = usedPercent(ft)
    const d = daysLeft(ft)
    const warn = !!ft && !ft.paused_at && d <= SOON_DAYS
    const installed = ft?.started_at ?? item.created_at
    return (
      <View style={{ width: pageWidth, gap: 20 }}>
        <View style={styles.filterHead}>
          <Text style={styles.filterName} accessibilityRole="header">{item.product_name}</Text>
          <Text style={styles.filterMeta}>
            {t('water:installedOn', {
              type: t(`water:systems.${item.filter_type}`),
              date: formatDate(installed, { day: 'numeric', month: 'long' }),
            })}
          </Text>
          {ft?.paused_at ? <Text style={styles.pausedTag}>{t('water:pausedTag')}</Text> : null}
          {!warn && (
            <Pressable onPress={() => setSheet('options')} hitSlop={6} style={styles.textLink} accessibilityRole="button">
              <Text style={styles.textLinkLabel}>{t('water:options')}</Text>
            </Pressable>
          )}
        </View>

        <DotGauge
          remaining={100 - u}
          caption={t('water:remaining')}
          warning={warn}
          accessibilityLabel={t('water:gaugeA11y', { percent: 100 - u })}
        />

        <View style={styles.stats}>
          <Stat label={t('water:used')} value={`${u} %`} />
          <Stat label={t('water:toChange')} value={ft ? (d <= 0 ? t('water:today') : formatDateShort(changeDate(ft)!)) : '—'} warn={warn} />
          <Stat label={t('water:daysLeftLabel')} value={t('water:days', { count: d })} warn={warn} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ds.blue} />}
      >
        <AppHeader />

        {failedSub && (
          <AlertBanner
            title={t('care:payment.failedTitle')}
            body={t('care:payment.failedBody')}
            onPress={() => openSubscription(failedSub, 'payment')}
          />
        )}

        {!loaded ? null : filters.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
                <Path d="M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z" stroke={ds.blue} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
            <Text style={styles.emptyTitle}>{t('water:empty.title')}</Text>
            <Text style={styles.emptyBody}>{t('water:empty.body')}</Text>
            <PillButton label={t('water:empty.cta')} onPress={() => router.push('/add-filter')} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : (
          <>
            <View style={{ paddingTop: 12 }}>
              <FlatList
                ref={pager}
                data={filters}
                keyExtractor={(f) => f.id}
                renderItem={renderFilter}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEnabled={filters.length > 1}
                onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
              />
              {filters.length > 1 && (
                <View style={styles.dots} accessibilityLabel={t('water:pager', { index: page + 1, total: filters.length })}>
                  {filters.map((f, i) => <View key={f.id} style={[styles.pageDot, i === page && styles.pageDotOn]} />)}
                </View>
              )}
            </View>

            {soon ? (
              <>
                <View style={styles.alertCard}>
                  <View style={styles.alertIcon}>
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <Path d="M12 8v5M12 16.5v.01" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
                      <Circle cx={12} cy={12} r={9} stroke="#FFFFFF" strokeWidth={2} />
                    </Svg>
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.alertTitle}>
                      {left <= 0 ? t('care:cartridge.late') : t('care:cartridge.soon', { count: left })}
                    </Text>
                    <Text style={styles.cardBody}>{t('care:cartridge.soonBody')}</Text>
                  </View>
                </View>
                <PillButton label={t('water:replaced')} onPress={() => setSheet('replace')} />
              </>
            ) : (
              <>
                <PillButton label={t('water:replaced')} onPress={() => setSheet('replace')} style={styles.replaceBtn} />
                <Pressable
                  onPress={() => router.push({ pathname: '/filter-help', params: { source: 'home' } })}
                  style={[styles.textLink, { marginTop: -8 }]}
                  hitSlop={6}
                  accessibilityRole="button"
                >
                  <Text style={styles.textLinkLabel}>{t('care:filterHelp.link')}</Text>
                </Pressable>
                <View style={styles.adviceCard}>
                  <View style={styles.adviceIcon}>
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                      <Path d="M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z" stroke={ds.blue} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                      <Path d="M12 10v4M12 17v.01" stroke={ds.blue} strokeWidth={1.8} strokeLinecap="round" />
                    </Svg>
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.adviceTitle}>{t('care:cartridge.rhythm', { count: months })}</Text>
                    <Text style={styles.cardBody}>
                      {activeSub?.status === 'active' ? t('care:cartridge.rhythmBody') : t('care:cartridge.soonBody')}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </>
        )}

        {loaded && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle} accessibilityRole="header">{t('water:systemsTitle')}</Text>
              <Text style={styles.sectionSub}>{t('water:systemsCount', { owned: ownedSystems, total: SYSTEMS.length })}</Text>
            </View>
            <SystemsRow owned={owned} />
            <Text style={styles.hint}>{ownedSystems === SYSTEMS.length ? t('water:systemsDone') : t('water:systemsHint')}</Text>

            {activeSub && (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">{t('water:planSection')}</Text>
                </View>
                <PlanCard sub={activeSub} onPress={() => openSubscription(activeSub)} />
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* P06 — confirmer le remplacement */}
      {sheet === 'replace' && current && userId && (
        <Sheet
          title={t('water:replace.title')}
          message={t('water:replace.body', { name: current.product_name })}
          onClose={() => setSheet(null)}
          footer={
            <View style={styles.footerRow}>
              <PillButton variant="secondary" label={t('common:cancel')} onPress={() => setSheet(null)} style={{ flex: 1 }} />
              <PillButton
                label={t('common:confirm')}
                loading={busy}
                onPress={() => run(() => replaceCartridge(userId, current), t('water:replace.done'))}
                style={{ flex: 1 }}
              />
            </View>
          }
        />
      )}

      {/* P23 — options du filtre */}
      {sheet === 'options' && current && (
        <Sheet
          title={current.product_name}
          message={t('water:menu.body')}
          onClose={() => setSheet(null)}
          footer={<>
            <PillButton
              variant="secondary"
              label={current.timer?.paused_at ? t('water:menu.resume') : t('water:menu.pause')}
              loading={busy}
              onPress={() => run(() => togglePause(current), current.timer?.paused_at ? t('water:menu.resumed') : t('water:menu.paused'))}
            />
            <PillButton variant="dangerOutline" label={t('water:menu.delete')} onPress={() => setSheet('delete')} style={{ marginTop: 6 }} />
            <PillButton variant="quiet" label={t('common:cancel')} onPress={() => setSheet(null)} />
          </>}
        />
      )}

      {/* P24 — supprimer le filtre */}
      {sheet === 'delete' && current && (
        <Sheet
          title={t('water:delete.title')}
          message={t('water:delete.body', { name: current.product_name })}
          onClose={() => setSheet(null)}
          footer={
            <View style={styles.footerRow}>
              <PillButton variant="secondary" label={t('common:cancel')} onPress={() => setSheet(null)} style={{ flex: 1 }} />
              <PillButton
                variant="destructive"
                label={t('water:delete.cta')}
                loading={busy}
                onPress={() => run(async () => { await deleteFilter(current); setPage(0) }, t('water:delete.done'))}
                style={{ flex: 1 }}
              />
            </View>
          }
        />
      )}
    </View>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toLocaleUpperCase()}</Text>
      <Text style={[styles.statValue, warn && { color: '#A4670A', fontFamily: typography.fontFamily.semiBold }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },
  content: { paddingHorizontal: 20, gap: 20 },

  filterHead: { alignItems: 'center', gap: 4 },
  filterName: { fontFamily: typography.fontFamily.medium, fontSize: 20, lineHeight: 25, color: ds.ink, textAlign: 'center' },
  filterMeta: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.muted, textAlign: 'center' },
  pausedTag: { fontFamily: typography.fontFamily.medium, fontSize: 13, color: '#A4670A' },
  textLink: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 10 },
  textLinkLabel: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: ds.blue },

  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, alignItems: 'center', gap: 6 },
  statLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, letterSpacing: 0.96, color: ds.muted },
  statValue: { fontFamily: typography.fontFamily.medium, fontSize: 17, color: ds.ink },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 16 },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ds.line },
  pageDotOn: { backgroundColor: ds.blue, width: 16 },

  replaceBtn: { minHeight: 50 },
  adviceCard: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
    backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: ds.radius.card,
    paddingVertical: 18, paddingHorizontal: 20,
  },
  adviceIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: ds.blueSoft, alignItems: 'center', justifyContent: 'center' },
  adviceTitle: { fontFamily: typography.fontFamily.medium, fontSize: 16, lineHeight: 21, color: ds.ink },
  cardBody: { fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 21, color: ds.body },
  alertCard: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
    backgroundColor: ds.raised, borderWidth: 1, borderColor: '#F2D9B0', borderRadius: ds.radius.card,
    paddingVertical: 18, paddingHorizontal: 20,
  },
  alertIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: AMBER, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontFamily: typography.fontFamily.medium, fontSize: 17, lineHeight: 22, color: ds.ink },

  sectionHead: { borderTopWidth: 1, borderTopColor: ds.line, marginTop: 8, paddingTop: 28, alignItems: 'center', gap: 4 },
  sectionTitle: { fontFamily: typography.fontFamily.medium, fontSize: 20, lineHeight: 25, color: ds.ink },
  sectionSub: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.muted },
  hint: { fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: ds.muted, textAlign: 'center' },

  empty: { alignItems: 'center', gap: 10, paddingTop: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: ds.blueSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontFamily: typography.fontFamily.medium, fontSize: 24, color: ds.ink, textAlign: 'center' },
  emptyBody: { fontFamily: typography.fontFamily.regular, fontSize: 15, lineHeight: 22, color: ds.body, textAlign: 'center', marginBottom: 10 },

  footerRow: { flexDirection: 'row', gap: 12 },
})
