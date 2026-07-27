import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Alert, Animated, Easing, KeyboardAvoidingView, Platform,
  RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { supabase } from '../../lib/supabase'
import theme from '../../lib/theme'
import ProgressRing from '../../components/ui/ProgressRing'
import { useToast } from '../../hooks/useToast'

// ─── Calculs timer ─────────────────────────────────────────

const calcProgress = (timer: any): number => {
  if (!timer) return 0
  const elapsed = Date.now() - new Date(timer.started_at).getTime() - (timer.total_paused_seconds ?? 0) * 1000
  return Math.min(Math.round((elapsed / (timer.expected_duration_days * 86400000)) * 100), 100)
}

const calcDaysRemaining = (timer: any): number => {
  if (!timer) return 0
  const elapsed = Date.now() - new Date(timer.started_at).getTime() - (timer.total_paused_seconds ?? 0) * 1000
  return Math.max(Math.round((timer.expected_duration_days * 86400000 - elapsed) / 86400000), 0)
}

const progressColor = (p: number) =>
  p >= 95 ? theme.colors.error : p >= 80 ? theme.colors.warning : theme.colors.blue

const progressBg = (p: number) =>
  p >= 95 ? 'rgba(227,44,43,0.10)' : p >= 80 ? 'rgba(255,92,0,0.10)' : 'rgba(39,100,255,0.10)'

// ─── Animations ────────────────────────────────────────────

function CascadeIn({ index, children }: { index: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(24)).current

  useEffect(() => {
    const easing = Easing.bezier(0.16, 1, 0.3, 1)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: index * 100, easing, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 400, delay: index * 100, easing, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: ty }] }}>
      {children}
    </Animated.View>
  )
}

// Bouton avec scale 0.97 au press
function PressableScale({ onPress, style, children }: { onPress: () => void; style?: any; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current

  const pressIn = () => Animated.spring(scale, { toValue: 0.97, tension: 300, friction: 10, useNativeDriver: true }).start()
  const pressOut = () => Animated.spring(scale, { toValue: 1, tension: 300, friction: 10, useNativeDriver: true }).start()

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={style} activeOpacity={0.85}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  )
}

// Bouton avec pulse lent toutes les 3s
function PulseButton({ onPress, style, children }: { onPress: () => void; style?: any; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(scale, { toValue: 1.03, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity onPress={onPress} style={style} activeOpacity={0.85}>
        {children}
      </TouchableOpacity>
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

  const shimmer = (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  )

  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonCircle}>{shimmer}</View>
      <View style={styles.skeletonLine}>{shimmer}</View>
      <View style={[styles.skeletonLine, { width: '70%' }]}>{shimmer}</View>
      <View style={[styles.skeletonLine, { width: '50%' }]}>{shimmer}</View>
    </View>
  )
}

// ─── Modal ajout de filtre ─────────────────────────────────

const DURATION_MIN = 30
const DURATION_MAX = 365
const DURATION_STEP = 15

interface AddFilterModalProps {
  visible: boolean
  userId: string
  onClose: () => void
  onSaved: () => void
}

function AddFilterModal({ visible, userId, onClose, onSaved }: AddFilterModalProps) {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [type, setType] = useState<'robinet' | 'douche'>('robinet')
  const [location, setLocation] = useState('')
  const [duration, setDuration] = useState(90)
  const [installDate, setInstallDate] = useState(new Date())
  const [saving, setSaving] = useState(false)
  const slideAnim = useRef(new Animated.Value(600)).current

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(600)
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }).start()
    }
  }, [visible])

  const reset = () => {
    setName(''); setType('robinet'); setLocation(''); setDuration(90); setInstallDate(new Date())
  }

  const openAndroidDatePicker = () => {
    DateTimePickerAndroid.open({
      value: installDate,
      mode: 'date',
      maximumDate: new Date(),
      onChange: (_, selected) => { if (selected) setInstallDate(selected) },
    })
  }

  const formatInstallDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Champ requis', 'Donnez un nom à votre filtre.')
      return
    }
    setSaving(true)
    try {
      const { data: filter, error: filterErr } = await supabase
        .from('filters')
        .insert({
          user_id: userId,
          product_name: name.trim(),
          filter_type: type,
          location_label: location.trim() || null,
          cartridge_lifespan_days: duration,
          is_active: true,
        })
        .select()
        .single()
      if (filterErr) throw filterErr

      const { error: timerErr } = await supabase
        .from('cartridge_timers')
        .insert({
          user_id: userId,
          filter_id: filter.id,
          // Le décompte part de la date d'installation choisie par l'utilisateur
          started_at: installDate.toISOString(),
          expected_duration_days: duration,
          total_paused_seconds: 0,
          is_active: true,
        })
      if (timerErr) throw timerErr

      reset()
      showToast('Filtre ajouté avec succès 💧', 'success')
      onSaved()
    } catch {
      showToast('Une erreur est survenue', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View
            style={[
              styles.modalSheet,
              { paddingBottom: insets.bottom + theme.spacing[6], transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Ajouter un filtre</Text>

            {/* Nom */}
            <Text style={styles.fieldLabel}>NOM DU FILTRE</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Ex: Filtre cuisine"
              placeholderTextColor={theme.colors.textXLight}
              value={name}
              onChangeText={setName}
            />

            {/* Type */}
            <Text style={styles.fieldLabel}>TYPE</Text>
            <View style={styles.typeRow}>
              {(['robinet', 'douche'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, type === t && styles.typeBtnActive]}
                  onPress={() => setType(t)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.typeBtnText, type === t && styles.typeBtnTextActive]}>
                    {t === 'robinet' ? '🚿 Robinet' : '🚿 Douche'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Emplacement */}
            <Text style={styles.fieldLabel}>EMPLACEMENT</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Ex: Cuisine, Salle de bain"
              placeholderTextColor={theme.colors.textXLight}
              value={location}
              onChangeText={setLocation}
            />

            {/* Date d'installation */}
            <Text style={styles.fieldLabel}>DATE D'INSTALLATION</Text>
            {Platform.OS === 'ios' ? (
              <View style={styles.datePickerWrap}>
                <DateTimePicker
                  value={installDate}
                  mode="date"
                  display="compact"
                  maximumDate={new Date()}
                  accentColor={theme.colors.blue}
                  onChange={(_, selected) => { if (selected) setInstallDate(selected) }}
                  locale="fr-FR"
                />
              </View>
            ) : (
              <TouchableOpacity style={styles.fieldInput} onPress={openAndroidDatePicker} activeOpacity={0.7}>
                <Text style={styles.dateValueText}>{formatInstallDate(installDate)}</Text>
              </TouchableOpacity>
            )}

            {/* Durée */}
            <Text style={styles.fieldLabel}>DURÉE DE VIE</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setDuration(d => Math.max(DURATION_MIN, d - DURATION_STEP))}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Réduire la durée de vie de 15 jours"
              >
                <Text style={styles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{duration} jours</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setDuration(d => Math.min(DURATION_MAX, d + DURATION_STEP))}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Augmenter la durée de vie de 15 jours"
              >
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Enregistrer */}
            <TouchableOpacity
              style={[styles.btnLime, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={styles.btnLimeText}>
                {saving ? 'Enregistrement...' : 'Enregistrer le filtre'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { reset(); onClose() }} activeOpacity={0.7}>
              <Text style={styles.modalCancel}>Annuler</Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── Écran ─────────────────────────────────────────────────

export default function FiltersScreen() {
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  const [userId, setUserId] = useState<string | null>(null)
  const [filters, setFilters] = useState<any[]>([])
  const [timers, setTimers] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [{ data: filtersData }, { data: timersData }] = await Promise.all([
        supabase.from('filters').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('cartridge_timers').select('*').eq('user_id', user.id).eq('is_active', true),
      ])

      setFilters(filtersData ?? [])
      const timerMap: Record<string, any> = {}
      for (const t of (timersData ?? [])) timerMap[t.filter_id] = t
      setTimers(timerMap)
    } catch {
      // Réseau/backend indisponible : état vide affiché, pull-to-refresh pour réessayer.
    }
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await load() } finally { setRefreshing(false) }
  }, [load])

  const startTimer = async (filter: any) => {
    if (!userId) return
    const { error } = await supabase.from('cartridge_timers').insert({
      user_id: userId,
      filter_id: filter.id,
      started_at: new Date().toISOString(),
      expected_duration_days: filter.cartridge_lifespan_days ?? 90,
      total_paused_seconds: 0,
      is_active: true,
    })
    if (error) { showToast('Une erreur est survenue', 'error'); return }
    showToast('Timer démarré 💧', 'success')
    await load()
  }

  const replaceCartridge = (filter: any) => {
    const timer = timers[filter.id]
    if (!userId) return
    Alert.alert(
      'Confirmer le remplacement',
      'Le timer sera réinitialisé et un nouveau cycle commencera.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              if (timer) {
                await supabase
                  .from('cartridge_timers')
                  .update({ is_active: false, replaced_at: new Date().toISOString() })
                  .eq('id', timer.id)
              }
              await supabase.from('cartridge_timers').insert({
                user_id: userId,
                filter_id: filter.id,
                started_at: new Date().toISOString(),
                expected_duration_days: filter.cartridge_lifespan_days ?? 90,
                total_paused_seconds: 0,
                is_active: true,
              })
              showToast('Nouvelle cartouche enregistrée 💧', 'success')
              await load()
            } catch {
              showToast('Une erreur est survenue', 'error')
            }
          },
        },
      ]
    )
  }

  // Met en pause / reprend le décompte. À la reprise, on cumule la durée
  // de pause dans total_paused_seconds pour que le calcul reste exact.
  const togglePause = async (filter: any) => {
    const timer = timers[filter.id]
    if (!timer) return
    try {
      if (timer.paused_at) {
        const pausedMs = Date.now() - new Date(timer.paused_at).getTime()
        const addedSeconds = Math.max(0, Math.round(pausedMs / 1000))
        await supabase
          .from('cartridge_timers')
          .update({
            paused_at: null,
            total_paused_seconds: (timer.total_paused_seconds ?? 0) + addedSeconds,
          })
          .eq('id', timer.id)
        showToast('Timer repris ▶', 'success')
      } else {
        await supabase
          .from('cartridge_timers')
          .update({ paused_at: new Date().toISOString() })
          .eq('id', timer.id)
        showToast('Timer en pause ⏸', 'success')
      }
      await load()
    } catch {
      showToast('Une erreur est survenue', 'error')
    }
  }

  // Supprime le filtre ET sa cartouche (soft-delete via is_active).
  const deleteFilter = (filter: any) => {
    const timer = timers[filter.id]
    Alert.alert(
      'Supprimer ce filtre',
      `« ${filter.product_name} » et son suivi de cartouche seront supprimés. Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              if (timer) {
                await supabase.from('cartridge_timers').update({ is_active: false }).eq('id', timer.id)
              }
              await supabase.from('filters').update({ is_active: false }).eq('id', filter.id)
              showToast('Filtre supprimé', 'success')
              await load()
            } catch {
              showToast('Une erreur est survenue', 'error')
            }
          },
        },
      ]
    )
  }

  // Menu d'actions sur une cartouche active (pause/reprise + suppression)
  const openCartridgeMenu = (filter: any) => {
    const timer = timers[filter.id]
    const isPaused = !!timer?.paused_at
    Alert.alert(
      filter.product_name,
      'Que souhaitez-vous faire ?',
      [
        {
          text: isPaused ? '▶ Reprendre le suivi' : '⏸ Mettre en pause',
          onPress: () => togglePause(filter),
        },
        {
          text: '🗑 Supprimer ce filtre',
          style: 'destructive',
          onPress: () => deleteFilter(filter),
        },
        { text: 'Annuler', style: 'cancel' },
      ]
    )
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.blue} />
        }
      >
        {/* Header */}
        <View style={[styles.pageHeader, { paddingTop: insets.top + theme.spacing[5] }]}>
          <Text style={styles.pageTitle}>Mes filtres</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)} activeOpacity={0.85}>
            <Text style={styles.addBtnText}>+ Ajouter</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <SkeletonCard />
        ) : filters.length === 0 ? (
          /* ── ÉTAT VIDE ── */
          <CascadeIn index={0}>
            <View style={styles.emptyWrap}>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyIcon}>💧</Text>
              </View>
              <Text style={styles.emptyTitle}>Aucun filtre configuré</Text>
              <Text style={styles.emptySub}>
                Ajoutez votre premier filtre pour commencer{'\n'}à tracker votre cartouche
              </Text>
              <TouchableOpacity
                style={styles.btnBlueFull}
                onPress={() => setShowModal(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.btnBlueFullText}>+ Ajouter mon premier filtre</Text>
              </TouchableOpacity>
            </View>
          </CascadeIn>
        ) : (
          filters.map((filter, index) => {
            const timer = timers[filter.id]
            const progress = calcProgress(timer)
            const daysRemaining = calcDaysRemaining(timer)
            const isPaused = !!timer?.paused_at

            return (
              <CascadeIn key={filter.id} index={index}>
                <View style={styles.card}>

                  {/* Identité filtre */}
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1, marginRight: theme.spacing[3] }}>
                      <Text style={styles.filterName}>{filter.product_name}</Text>
                      {filter.location_label ? (
                        <Text style={styles.filterLocation}>{filter.location_label}</Text>
                      ) : null}
                    </View>
                    {timer && (
                      <View style={[styles.pctBadge, { backgroundColor: progressBg(progress) }]}>
                        <Text style={[styles.pctBadgeText, { color: progressColor(progress) }]}>
                          {progress}%
                        </Text>
                      </View>
                    )}
                    {/* Menu d'actions (pause / suppression) */}
                    <TouchableOpacity
                      style={styles.menuBtn}
                      onPress={() => openCartridgeMenu(filter)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Options du filtre ${filter.product_name}`}
                    >
                      <Text style={styles.menuBtnText}>⋯</Text>
                    </TouchableOpacity>
                  </View>

                  {timer ? (
                    <>
                      {/* Grande jauge */}
                      <View style={styles.ringWrap}>
                        <ProgressRing progress={progress} size={220} strokeWidth={14} label="utilisé" />
                        {isPaused && (
                          <View style={styles.pausedBadge}>
                            <Text style={styles.pausedBadgeText}>EN PAUSE</Text>
                          </View>
                        )}
                      </View>

                      {/* 2 stats */}
                      <View style={styles.statsRow}>
                        <View style={styles.statCol}>
                          <Text style={styles.statValue}>{progress}%</Text>
                          <Text style={styles.statLabel}>UTILISÉ</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statCol}>
                          <Text style={styles.statValue}>{daysRemaining}j</Text>
                          <Text style={styles.statLabel}>RESTANTS</Text>
                        </View>
                      </View>

                      <View style={styles.divider} />

                      {/* Cartouche remplacée */}
                      <PressableScale onPress={() => replaceCartridge(filter)} style={styles.btnLime}>
                        <Text style={styles.btnLimeText}>💧 Cartouche remplacée</Text>
                      </PressableScale>
                    </>
                  ) : (
                    /* Timer non démarré */
                    <View style={styles.noTimerWrap}>
                      <Text style={styles.noTimerIcon}>⏱</Text>
                      <Text style={styles.noTimerText}>
                        Démarrez le timer au moment de l'installation
                      </Text>
                      <PulseButton onPress={() => startTimer(filter)} style={styles.btnBlueFull}>
                        <Text style={styles.btnBlueFullText}>▶ Démarrer le timer</Text>
                      </PulseButton>
                    </View>
                  )}
                </View>
              </CascadeIn>
            )
          })
        )}
      </ScrollView>

      {userId && (
        <AddFilterModal
          visible={showModal}
          userId={userId}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
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
    paddingHorizontal: theme.spacing[4],
    paddingBottom: 120,
    gap: theme.spacing[5],
  },

  // Header
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[2],
  },
  pageTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size['3xl'],
    color: theme.colors.navy,
    letterSpacing: -0.5,
  },
  addBtn: {
    backgroundColor: theme.colors.blue,
    borderRadius: theme.radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  addBtnText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.sm,
    color: theme.colors.white,
  },

  // Card hero
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    overflow: 'hidden',
    padding: theme.spacing[6],
    ...theme.shadows.strong,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  filterName: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.lg - 1,
    color: theme.colors.navy,
  },
  filterLocation: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  pctBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  pctBadgeText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.xs + 1,
  },
  menuBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: theme.spacing[2],
  },
  menuBtnText: {
    fontSize: 22,
    color: theme.colors.textLight,
    marginTop: -6,
  },

  // Jauge
  ringWrap: {
    alignItems: 'center',
    marginVertical: theme.spacing[4],
  },
  pausedBadge: {
    backgroundColor: 'rgba(255,92,0,0.10)',
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    marginTop: theme.spacing[2],
  },
  pausedBadgeText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 10,
    color: theme.colors.warning,
    letterSpacing: 0.8,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: theme.spacing[4],
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.xl - 2,
    color: theme.colors.navy,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 10,
    color: theme.colors.textLight,
    letterSpacing: 1,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.colors.border,
  },

  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[5],
  },

  // Boutons
  btnLime: {
    height: 52,
    backgroundColor: theme.colors.lime,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLimeText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.white,
  },
  btnBlueFull: {
    height: 52,
    backgroundColor: theme.colors.blue,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  btnBlueFullText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.white,
  },

  // Timer non démarré
  noTimerWrap: {
    alignItems: 'center',
    paddingVertical: theme.spacing[5],
    gap: theme.spacing[4],
  },
  noTimerIcon: { fontSize: 48 },
  noTimerText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textLight,
    textAlign: 'center',
  },

  // État vide
  emptyWrap: {
    alignItems: 'center',
    paddingTop: theme.spacing[12],
    paddingHorizontal: theme.spacing[4],
  },
  emptyCircle: {
    width: 140,
    height: 140,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.bluePale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: { fontSize: 64 },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.xl - 2,
    color: theme.colors.navy,
    marginTop: theme.spacing[6],
  },
  emptySub: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textLight,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: theme.spacing[2],
  },

  // Skeleton
  skeletonCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[6],
    alignItems: 'center',
    gap: theme.spacing[3],
    ...theme.shadows.card,
  },
  skeletonCircle: {
    width: 220,
    height: 220,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.bluePale,
    overflow: 'hidden',
    marginBottom: theme.spacing[2],
  },
  skeletonLine: {
    height: 14,
    width: '100%',
    borderRadius: theme.radius.xs,
    backgroundColor: theme.colors.bluePale,
    overflow: 'hidden',
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,21,61,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius['3xl'],
    borderTopRightRadius: theme.radius['3xl'],
    padding: theme.spacing[6],
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: theme.spacing[5],
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.xl,
    color: theme.colors.navy,
    marginBottom: theme.spacing[5],
  },
  fieldLabel: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textLight,
    letterSpacing: 1,
    marginBottom: theme.spacing[2],
  },
  fieldInput: {
    height: 50,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[4],
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
    marginBottom: theme.spacing[4],
    justifyContent: 'center',
  },
  dateValueText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
  },
  datePickerWrap: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing[4],
  },
  typeRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  typeBtn: {
    flex: 1,
    height: 46,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBtnActive: {
    backgroundColor: theme.colors.navy,
  },
  typeBtnText: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textMid,
  },
  typeBtnTextActive: {
    color: theme.colors.white,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[5],
    marginBottom: theme.spacing[5],
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.xl,
    color: theme.colors.white,
    lineHeight: 26,
  },
  stepperValue: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.lg,
    color: theme.colors.blue,
    minWidth: 110,
    textAlign: 'center',
  },
  modalCancel: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginTop: theme.spacing[4],
  },
})
