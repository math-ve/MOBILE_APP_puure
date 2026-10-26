import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
  Animated, Easing,
} from 'react-native'
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { subscriptionApi } from '../lib/subscriptionApi'
import { AlertBanner } from '../components/ds/Flow'
import RescheduleSheet, { RescheduleOutcome } from '../components/subscription/RescheduleSheet'
import PaymentSheet from '../components/subscription/PaymentSheet'
import PauseSheet from '../components/subscription/PauseSheet'
import Sheet from '../components/ds/Sheet'
import PillButton from '../components/ds/PillButton'
import theme from '../lib/theme'
import i18n from '../lib/i18n'
import { formatDate as fmtDate, formatDateShort as fmtDateShort, formatCurrency, formatFrequency } from '../lib/i18n/format'
import { getSubscriptionStatus } from '../lib/statuses'
import { useToast } from '../hooks/useToast'

type Tab = 'details' | 'upcoming' | 'past'

// ─── Helpers ───────────────────────────────────────────────

const formatDate = (iso?: string | null) => (iso ? fmtDate(iso) : '—')
const formatDateShort = (iso?: string | null) =>
  iso ? fmtDateShort(iso) : '—'

const formatPrice = (amount?: number | string | null, currency?: string | null) => {
  if (amount == null) return '—'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '—'
  return formatCurrency(num, currency ?? 'EUR')
}

// Statut réel d'une commande passée d'abonnement (Appstle).
// Priorité au statut de livraison Shopify (orderDisplayFulfillmentStatus),
// repli sur le statut de facturation (status = SUCCESS/ERROR).
const getPastOrderStatus = (order: any): { label: string; color: string; bg: string } => {
  const fulfillment = (order?.orderDisplayFulfillmentStatus ?? '').toUpperCase()
  const financial = (order?.orderDisplayFinancialStatus ?? '').toUpperCase()
  const billing = (order?.status ?? '').toUpperCase()
  const green = { color: theme.colors.success, bg: 'rgba(30,187,110,0.12)' }
  const blue = { color: theme.colors.blue, bg: 'rgba(39,100,255,0.10)' }
  const orange = { color: theme.colors.warning, bg: 'rgba(255,92,0,0.10)' }
  const red = { color: theme.colors.error, bg: 'rgba(227,44,43,0.10)' }
  const label = (k: string) => i18n.t(`subscription:pastStatus.${k}`)

  if (billing && billing !== 'SUCCESS') return { label: label('failed'), ...red }
  if (fulfillment === 'FULFILLED') return { label: label('shipped'), ...blue }
  if (fulfillment === 'DELIVERED') return { label: label('delivered'), ...green }
  if (fulfillment === 'PARTIALLY_FULFILLED') return { label: label('partial'), ...blue }
  if (fulfillment === 'ON_HOLD' || fulfillment === 'SCHEDULED') return { label: label('preparing'), ...orange }
  if (financial === 'REFUNDED' || financial === 'PARTIALLY_REFUNDED') return { label: label('refunded'), ...orange }
  return { label: label('confirmed'), ...blue }
}

const CARD_BRANDS: Record<string, { label: string; bg: string }> = {
  visa: { label: 'VISA', bg: '#1a1f71' },
  mastercard: { label: 'MASTERCARD', bg: '#eb001b' },
  amex: { label: 'AMEX', bg: '#006fcf' },
}

// Libellé pays traduit ; repli sur la valeur brute.
const countryLabel = (value: string): string => {
  const table =
    (i18n.getResource(i18n.language, 'subscription', 'country') as Record<string, string> | undefined) ??
    (i18n.getResource('fr', 'subscription', 'country') as Record<string, string> | undefined)
  return table?.[value] ?? value
}

// ─── Animations ────────────────────────────────────────────

function CascadeIn({ index, children }: { index: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current
  const ty = useRef(new Animated.Value(16)).current

  useEffect(() => {
    const easing = Easing.bezier(0.16, 1, 0.3, 1)
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay: index * 80, easing, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 300, delay: index * 80, easing, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: ty }] }}>
      {children}
    </Animated.View>
  )
}

function HeroImage({ uri }: { uri: string }) {
  const scale = useRef(new Animated.Value(0.95)).current

  useEffect(() => {
    Animated.timing(scale, {
      toValue: 1,
      duration: 500,
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
      useNativeDriver: true,
    }).start()
  }, [])

  return (
    <View style={s.heroImageWrap}>
      <Animated.Image
        source={{ uri }}
        style={[s.heroImage, { transform: [{ scale }] }]}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.95)', theme.colors.white]}
        style={s.heroImageFade}
        pointerEvents="none"
      />
    </View>
  )
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
    <View style={[s.shimmerBase, style]}>
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

function CheckIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m5 13 4 4L19 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

// ─── Bottom sheet générique ────────────────────────────────

function BottomSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  const slide = useRef(new Animated.Value(600)).current

  useEffect(() => {
    Animated.timing(slide, {
      toValue: 0,
      duration: 400,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start()
  }, [])

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.sheetBackdrop}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View
            style={[s.sheet, { paddingBottom: insets.bottom + theme.spacing[6], transform: [{ translateY: slide }] }]}
          >
            <View style={s.sheetHandle} />
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── Modal fréquence ───────────────────────────────────────

const FREQ_VALUES = [1, 2, 3, 6]

function FrequencySheet({ contractId, currentValue, onClose, onSaved }: {
  contractId: string; currentValue: number | null; onClose: () => void; onSaved: () => void
}) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [selected, setSelected] = useState(currentValue ?? 1)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await subscriptionApi.updateFrequency(contractId, selected)
      showToast(t('subscription:freqUpdated'), 'success')
      onSaved()
    } catch (e: any) {
      showToast(e.message ?? t('common:errorGeneric'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet onClose={onClose}>
      <Text style={s.sheetTitle}>{t('subscription:freqSheetTitle')}</Text>
      <View style={{ gap: theme.spacing[2] + 2 }}>
        {FREQ_VALUES.map(value => {
          const isSelected = selected === value
          return (
            <TouchableOpacity
              key={value}
              style={[s.freqOption, isSelected && s.freqOptionActive]}
              onPress={() => setSelected(value)}
              activeOpacity={0.7}
            >
              <Text style={[s.freqOptionText, isSelected && s.freqOptionTextActive]}>
                {t('subscription:freqOption', { count: value })}
              </Text>
              {isSelected && <CheckIcon color={theme.colors.blue} />}
            </TouchableOpacity>
          )
        })}
      </View>
      <TouchableOpacity
        style={[s.btnLime, saving && { opacity: 0.7 }]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving
          ? <ActivityIndicator color={theme.colors.navy} size="small" />
          : <Text style={s.btnLimeText}>{t('subscription:confirm')}</Text>
        }
      </TouchableOpacity>
    </BottomSheet>
  )
}

// ─── Modal adresse ─────────────────────────────────────────

// `value` = valeur envoyée à Shopify/Appstle — inchangée. Libellé via i18n.
const COUNTRY_OPTIONS: { value: string; code: string }[] = [
  { value: 'Belgium', code: 'BE' },
  { value: 'France', code: 'FR' },
  { value: 'Luxembourg', code: 'LU' },
  { value: 'Netherlands', code: 'NL' },
  { value: 'Switzerland', code: 'CH' },
  { value: 'Germany', code: 'DE' },
  { value: 'Austria', code: 'AT' },
  { value: 'Spain', code: 'ES' },
  { value: 'Italy', code: 'IT' },
  { value: 'Portugal', code: 'PT' },
  { value: 'United Kingdom', code: 'GB' },
]

const COUNTRY_CODES: Record<string, string> = {
  'france': 'FR', 'belgium': 'BE', 'belgique': 'BE',
  'netherlands': 'NL', 'pays-bas': 'NL', 'germany': 'DE', 'allemagne': 'DE',
  'spain': 'ES', 'espagne': 'ES', 'italy': 'IT', 'italie': 'IT',
  'united kingdom': 'GB', 'royaume-uni': 'GB', 'uk': 'GB',
  'luxembourg': 'LU', 'switzerland': 'CH', 'suisse': 'CH',
  'portugal': 'PT', 'austria': 'AT', 'autriche': 'AT',
}

type AddressFields = {
  firstName: string; lastName: string; address1: string; address2: string
  city: string; zip: string; country: string; phone: string
}

function AddressSheet({ contractId, initial, onClose, onSaved }: {
  contractId: string; initial: any; onClose: () => void; onSaved: (addr: any) => void
}) {
  const { t } = useTranslation()
  const [fields, setFields] = useState<AddressFields>({
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    address1: initial?.address1 ?? '',
    address2: initial?.address2 ?? '',
    city: initial?.city ?? '',
    zip: initial?.zip ?? '',
    country: initial?.country ?? '',
    phone: initial?.phone ?? '',
  })
  const [countryCode, setCountryCode] = useState<string>(
    initial?.countryCode ?? COUNTRY_CODES[(initial?.country ?? '').toLowerCase().trim()] ?? 'BE'
  )
  const [countryOpen, setCountryOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = (key: keyof AddressFields) => (val: string) => setFields(prev => ({ ...prev, [key]: val }))
  const selectedCountry = COUNTRY_OPTIONS.find(o => o.value === fields.country)

  const handleSave = async () => {
    if (!fields.firstName || !fields.lastName || !fields.address1 || !fields.city || !fields.zip || !fields.country) {
      Alert.alert(t('subscription:missingFields'), t('subscription:missingFieldsBody'))
      return
    }
    setSaving(true)
    try {
      const address = {
        firstName: fields.firstName,
        lastName: fields.lastName,
        address1: fields.address1,
        address2: fields.address2 || null,
        city: fields.city,
        zip: fields.zip,
        country: fields.country,
        countryCode,
        province: initial?.province ?? null,
        provinceCode: initial?.provinceCode ?? null,
        phone: fields.phone || null,
        company: initial?.company ?? null,
      }
      // Le serveur renvoie déjà le message lisible d'Appstle (adresse refusée…).
      await subscriptionApi.updateAddress(contractId, address)
      onSaved(address)
    } catch (e: any) {
      Alert.alert(t('common:errorGeneric'), e?.message ?? t('subscription:updateError'))
    } finally {
      setSaving(false)
    }
  }

  const textFields: { key: keyof AddressFields; labelKey: string; phKey: string }[] = [
    { key: 'firstName', labelKey: 'fieldFirstName', phKey: 'phFirstName' },
    { key: 'lastName', labelKey: 'fieldLastName', phKey: 'phLastName' },
    { key: 'address1', labelKey: 'fieldAddress1', phKey: 'phAddress1' },
    { key: 'address2', labelKey: 'fieldAddress2', phKey: 'phAddress2' },
    { key: 'city', labelKey: 'fieldCity', phKey: 'phCity' },
    { key: 'zip', labelKey: 'fieldZip', phKey: 'phZip' },
    { key: 'phone', labelKey: 'fieldPhone', phKey: 'phPhone' },
  ]

  return (
    <BottomSheet onClose={onClose}>
      <Text style={s.sheetTitle}>{t('subscription:addressSheetTitle')}</Text>
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {textFields.map(f => (
          <View key={f.key}>
            <Text style={s.fieldLabel}>{t(`subscription:${f.labelKey}`)}</Text>
            <TextInput
              style={s.fieldInput}
              value={fields[f.key]}
              onChangeText={set(f.key)}
              placeholder={t(`subscription:${f.phKey}`)}
              placeholderTextColor={theme.colors.textLight}
              autoCorrect={false}
            />
          </View>
        ))}
        <Text style={s.fieldLabel}>{t('subscription:fieldCountry')}</Text>
        <TouchableOpacity style={s.fieldInputSelect} onPress={() => setCountryOpen(!countryOpen)} activeOpacity={0.7}>
          <Text style={selectedCountry ? s.selectValueText : s.selectPlaceholderText}>
            {selectedCountry ? countryLabel(selectedCountry.value) : t('subscription:selectCountry')}
          </Text>
        </TouchableOpacity>
        {countryOpen && (
          <View style={s.countryList}>
            {COUNTRY_OPTIONS.map(opt => {
              const isSelected = opt.value === fields.country
              return (
                <TouchableOpacity
                  key={opt.code}
                  style={[s.countryRow, isSelected && s.countryRowActive]}
                  onPress={() => {
                    setFields(prev => ({ ...prev, country: opt.value }))
                    setCountryCode(opt.code)
                    setCountryOpen(false)
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.countryRowText, isSelected && s.countryRowTextActive]}>{countryLabel(opt.value)}</Text>
                  {isSelected && <CheckIcon color={theme.colors.blue} size={16} />}
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </ScrollView>
      <TouchableOpacity
        style={[s.btnLime, saving && { opacity: 0.7 }]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving
          ? <ActivityIndicator color={theme.colors.navy} size="small" />
          : <Text style={s.btnLimeText}>{t('subscription:save')}</Text>
        }
      </TouchableOpacity>
    </BottomSheet>
  )
}

// ─── Modal détail commande passée ──────────────────────────

function PastOrderSheet({ order, currency, shippingAddress, onClose }: {
  order: any; currency: string | null; shippingAddress: any; onClose: () => void
}) {
  const { t } = useTranslation()
  const variants: any[] = Array.isArray(order.variantList) ? order.variantList : []

  return (
    <BottomSheet onClose={onClose}>
      <Text style={s.sheetTitle}>{order.orderName ?? t('subscription:pastOrderSheetFallback')}</Text>
      <Text style={s.sheetSubtitle}>{formatDate(order.billingDate)}</Text>

      <View style={s.badgeRow}>
        {(order.status ?? '').toUpperCase() === 'SUCCESS' && (
          <View style={[s.miniBadge, { backgroundColor: 'rgba(30,187,110,0.12)' }]}>
            <Text style={[s.miniBadgeText, { color: theme.colors.success }]}>{t('subscription:badgePaid').toUpperCase()}</Text>
          </View>
        )}
        {(() => {
          const st = getPastOrderStatus(order)
          return (
            <View style={[s.miniBadge, { backgroundColor: st.bg }]}>
              <Text style={[s.miniBadgeText, { color: st.color }]}>{st.label.toUpperCase()}</Text>
            </View>
          )
        })()}
      </View>

      <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
        {variants.length > 0 && (
          <>
            <Text style={[s.sectionCaps, s.sheetSectionCaps]}>{t('subscription:products').toUpperCase()}</Text>
            {variants.map((item: any, i: number) => (
              <View key={i} style={s.productRow}>
                {(item.image || item.variantImage) ? (
                  <Image source={{ uri: item.image ?? item.variantImage }} style={s.productThumb64} resizeMode="cover" />
                ) : (
                  <View style={[s.productThumb64, { backgroundColor: theme.colors.inputBg }]} />
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.productRowName} numberOfLines={2}>
                    {item.productTitle ?? item.title ?? '—'}
                  </Text>
                  {item.variantTitle && item.variantTitle !== 'Default Title' && (
                    <Text style={s.productRowVariant}>{item.variantTitle}</Text>
                  )}
                  <Text style={s.productRowMeta}>{t('subscription:qtyLabel', { count: item.quantity ?? 1 })}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={[s.sectionCaps, s.sheetSectionCaps]}>{t('subscription:summary').toUpperCase()}</Text>
        <View style={s.recapTotalRow}>
          <Text style={s.recapTotalLabel}>{t('subscription:total').toUpperCase()}</Text>
          <Text style={s.recapTotalValue}>{formatPrice(order.orderAmount, currency)}</Text>
        </View>

        {shippingAddress && (
          <>
            <Text style={[s.sectionCaps, s.sheetSectionCaps]}>{t('subscription:shippingAddress').toUpperCase()}</Text>
            <Text style={s.addressText}>
              {[
                [shippingAddress.firstName, shippingAddress.lastName].filter(Boolean).join(' '),
                shippingAddress.address1,
                shippingAddress.address2,
                [shippingAddress.zip, shippingAddress.city].filter(Boolean).join(' '),
                shippingAddress.country,
              ].filter(Boolean).join('\n')}
            </Text>
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={s.btnNavy} onPress={onClose} activeOpacity={0.85}>
        <Text style={s.btnNavyText}>{t('subscription:close')}</Text>
      </TouchableOpacity>
    </BottomSheet>
  )
}

// ─── Écran ─────────────────────────────────────────────────

export default function SubscriptionDetailScreen() {
  const { t } = useTranslation()
  // subData : abonnement passé par la liste (affichage immédiat). Absent quand
  // l'écran est ouvert par une notification : on charge tout depuis le serveur.
  // open : feuille à ouvrir à l'arrivée (reschedule | payment | address).
  const { contractId, subData, open } = useLocalSearchParams<{ contractId: string; subData?: string; open?: string }>()
  const { showToast } = useToast()
  const insets = useSafeAreaInsets()

  const [sub, setSub] = useState<any>(() => {
    try { return JSON.parse(subData ?? '{}') } catch { return {} }
  })

  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [upcomingOrders, setUpcomingOrders] = useState<any[]>([])
  const [pastOrders, setPastOrders] = useState<any[]>([])
  const [shippingAddress, setShippingAddress] = useState<any>(null)
  const [paymentMethod, setPaymentMethod] = useState<any>(null)
  const [paymentFailedAt, setPaymentFailedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [promoCode, setPromoCode] = useState('')
  const [freqSheet, setFreqSheet] = useState(false)
  const [addressSheet, setAddressSheet] = useState(false)
  const [rescheduleSheet, setRescheduleSheet] = useState(false)
  const [paymentSheet, setPaymentSheet] = useState(false)
  const [pauseSheet, setPauseSheet] = useState(false)
  const [skipTarget, setSkipTarget] = useState<any>(null)
  const [pastOrderSheet, setPastOrderSheet] = useState<any>(null)
  const contentFade = useRef(new Animated.Value(1)).current
  const openedFromParam = useRef(false)

  const contractLines = useMemo<any[]>(() => {
    const raw = sub.contract_details_json ?? sub.contractDetailsJSON
    if (!raw) return []
    try {
      if (Array.isArray(raw)) return raw
      return JSON.parse(raw)
    } catch { return [] }
  }, [sub])
  const firstLine = contractLines[0] ?? {}

  const loadOrders = useCallback(async () => {
    try {
      const d = await subscriptionApi.detail(contractId)
      if (d.subscription) setSub((prev: any) => ({ ...prev, ...d.subscription }))
      setUpcomingOrders(d.upcomingOrders ?? [])
      setPastOrders(d.pastOrders ?? [])
      setShippingAddress(d.shippingAddress ?? null)
      setPaymentMethod(d.paymentMethod ?? null)
      setPaymentFailedAt(d.paymentFailedAt ?? null)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [contractId])

  // Rechargé à chaque retour sur l'écran (après une pause, un décalage…).
  useFocusEffect(useCallback(() => {
    loadOrders().finally(() => setLoading(false))
  }, [loadOrders]))

  // Feuille demandée par le lien d'arrivée (notification J-3, parcours d'annulation).
  useEffect(() => {
    if (loading || openedFromParam.current || !open) return
    openedFromParam.current = true
    if (open === 'reschedule') setRescheduleSheet(true)
    else if (open === 'payment') setPaymentSheet(true)
    else if (open === 'address') setAddressSheet(true)
  }, [loading, open])

  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return
    Animated.timing(contentFade, { toValue: 0, duration: 75, useNativeDriver: true }).start(() => {
      setActiveTab(tab)
      Animated.timing(contentFade, { toValue: 1, duration: 75, useNativeDriver: true }).start()
    })
  }

  const withLoading = async (key: string, fn: () => Promise<void>) => {
    setActionLoading(prev => ({ ...prev, [key]: true }))
    try {
      await fn()
    } catch (e: any) {
      showToast(e?.message && e.message !== 'session' ? e.message : t('care:errors.generic'), 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const resume = () => withLoading('resume', async () => {
    await subscriptionApi.resume(contractId)
    showToast(t('care:pause.resumed'), 'success')
    await loadOrders()
  })

  const onRescheduled = (o: RescheduleOutcome) => {
    setRescheduleSheet(false)
    const msg = o.kind === 'now'
      ? t('care:reschedule.doneNow')
      : o.kind === 'moved'
        ? t('care:reschedule.doneMoved', { date: formatDate(o.date) })
        : t('care:reschedule.doneSkipped')
    showToast(msg, 'success')
    loadOrders()
  }

  const skipOrder = (order: any) => withLoading(`skip_${order.id}`, async () => {
    await subscriptionApi.skip(contractId, String(order.id))
    setSkipTarget(null)
    showToast(t('care:reschedule.doneSkipped'), 'success')
    await loadOrders()
  })

  const isActive = sub.status === 'active'
  const isPaused = sub.status === 'paused'
  const statusBadge = getSubscriptionStatus(sub.status, true)
  const currency = sub.price_currency ?? null

  const unitPrice = sub.price_amount ?? parseFloat(firstLine.currentPrice ?? '0')
  const quantity = firstLine.quantity ?? 1
  const subtotal = unitPrice * quantity

  const brandKey = (paymentMethod?.brand ?? '').toLowerCase()
  const brand = CARD_BRANDS[brandKey] ?? { label: (paymentMethod?.brand ?? t('subscription:cardFallback')).toUpperCase(), bg: theme.colors.navy }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: t('subscription:tabDetails') },
    { key: 'upcoming', label: upcomingOrders.length ? t('subscription:tabUpcomingCount', { count: upcomingOrders.length }) : t('subscription:tabUpcoming') },
    { key: 'past', label: pastOrders.length ? t('subscription:tabPastCount', { count: pastOrders.length }) : t('subscription:tabPast') },
  ]

  // ─── Onglet Détails ───────────────────────────────────────

  const renderDetails = () => (
    <>
      {paymentFailedAt && (
        <View style={{ marginBottom: theme.spacing[3] }}>
          <AlertBanner
            title={t('care:payment.failedTitle')}
            body={t('care:payment.failedBody')}
            onPress={() => setPaymentSheet(true)}
          />
        </View>
      )}

      {/* Card produit hero */}
      <CascadeIn index={0}>
        <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
          {firstLine.variantImage ? (
            <HeroImage uri={firstLine.variantImage} />
          ) : null}
          <View style={{ padding: theme.spacing[5] }}>
            <Text style={s.productName}>{sub.product_name ?? firstLine.title ?? '—'}</Text>
            {firstLine.variantTitle && firstLine.variantTitle !== 'Default Title' ? (
              <Text style={s.productVariant}>{firstLine.variantTitle}</Text>
            ) : null}
            {firstLine.sku ? <Text style={s.productSku}>{t('subscription:skuLabel', { sku: firstLine.sku })}</Text> : null}

            <View style={s.divider} />

            <View style={s.infoRow}>
              <Text style={s.infoLabel}>{t('subscription:quantity')}</Text>
              <Text style={s.infoValue}>{String(quantity)}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>{t('subscription:currentPrice')}</Text>
              <Text style={[s.infoValue, { color: theme.colors.blue, fontFamily: theme.typography.fontFamily.bold }]}>
                {formatPrice(unitPrice, currency)}
              </Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>{t('subscription:subtotal')}</Text>
              <Text style={s.infoValue}>{formatPrice(subtotal, currency)}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>{t('subscription:shipping')}</Text>
              <Text style={s.infoValue}>{formatPrice(0, currency)}</Text>
            </View>
            <View style={[s.infoRow, s.totalRow]}>
              <Text style={s.totalLabel}>{t('subscription:total').toUpperCase()}</Text>
              <Text style={s.totalValue}>{formatPrice(subtotal, currency)}</Text>
            </View>
          </View>
        </View>
      </CascadeIn>

      {/* Prochaine commande */}
      <CascadeIn index={1}>
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <Text style={s.sectionCaps}>{t('care:nextOrder.label').toUpperCase()}</Text>
            {isActive && upcomingOrders.length > 0 && (
              <TouchableOpacity style={s.btnOutlineBlueSmall} onPress={() => setRescheduleSheet(true)} activeOpacity={0.7}>
                <Text style={s.btnOutlineBlueSmallText}>{t('care:nextOrder.move')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.nextDate}>{formatDate(upcomingOrders[0]?.billingDate ?? sub.next_billing_date)}</Text>
          {isActive && (
            <Text style={s.paymentMeta}>{t('care:nextOrder.chargedOn', { price: formatPrice(subtotal, currency) })}</Text>
          )}
        </View>
      </CascadeIn>

      {/* Fréquence */}
      <CascadeIn index={2}>
        <View style={s.card}>
          <Text style={s.sectionCaps}>{t('subscription:frequency').toUpperCase()}</Text>
          <Text style={s.freqValue}>{formatFrequency(sub.frequency_unit, sub.frequency_value)}</Text>
          <TouchableOpacity
            style={[s.btnOutlineBlueSmall, { alignSelf: 'flex-end', marginTop: theme.spacing[3] }]}
            onPress={() => setFreqSheet(true)}
            activeOpacity={0.7}
          >
            <Text style={s.btnOutlineBlueSmallText}>{t('subscription:modify')}</Text>
          </TouchableOpacity>
        </View>
      </CascadeIn>

      {/* Adresse */}
      <CascadeIn index={3}>
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <Text style={s.sectionCaps}>{t('subscription:shippingAddress').toUpperCase()}</Text>
            <TouchableOpacity style={s.btnOutlineBlueSmall} onPress={() => setAddressSheet(true)} activeOpacity={0.7}>
              <Text style={s.btnOutlineBlueSmallText}>{t('subscription:modifyShort')}</Text>
            </TouchableOpacity>
          </View>
          {shippingAddress ? (
            <>
              <Text style={s.addressName}>
                {[shippingAddress.firstName, shippingAddress.lastName].filter(Boolean).join(' ')}
              </Text>
              <Text style={s.addressText}>
                {[
                  shippingAddress.address1,
                  shippingAddress.address2,
                  [shippingAddress.zip, shippingAddress.city].filter(Boolean).join(' '),
                  shippingAddress.country,
                ].filter(Boolean).join('\n')}
              </Text>
            </>
          ) : (
            <Text style={s.mutedItalic}>{t('subscription:noAddress')}</Text>
          )}
        </View>
      </CascadeIn>

      {/* Paiement */}
      <CascadeIn index={4}>
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <Text style={s.sectionCaps}>{t('subscription:payment').toUpperCase()}</Text>
            {sub.status !== 'cancelled' && (
              <TouchableOpacity style={s.btnOutlineBlueSmall} onPress={() => setPaymentSheet(true)} activeOpacity={0.7}>
                <Text style={s.btnOutlineBlueSmallText}>{t('subscription:modifyShort')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {paymentMethod ? (
            <>
              <View style={s.paymentRow}>
                <View style={[s.brandPill, { backgroundColor: brand.bg }]}>
                  <Text style={s.brandPillText}>{brand.label}</Text>
                </View>
                <Text style={s.cardNumber}>
                  {paymentMethod.maskedNumber ?? (paymentMethod.lastDigits ? `•••• •••• •••• ${paymentMethod.lastDigits}` : '—')}
                </Text>
              </View>
              {paymentMethod.expiryMonth && paymentMethod.expiryYear ? (
                <Text style={s.paymentMeta}>
                  {t('subscription:cardExpires', {
                    month: String(paymentMethod.expiryMonth).padStart(2, '0'),
                    year: paymentMethod.expiryYear,
                  })}
                </Text>
              ) : null}
              {paymentMethod.cardHolderName ? (
                <Text style={s.paymentHolder}>{t('subscription:cardHolder', { name: paymentMethod.cardHolderName })}</Text>
              ) : null}
            </>
          ) : (
            <Text style={s.mutedItalic}>{t('subscription:noCard')}</Text>
          )}
        </View>
      </CascadeIn>

      {/* Code promo */}
      <CascadeIn index={5}>
        <View style={s.card}>
          <Text style={s.sectionCaps}>{t('subscription:promoCode').toUpperCase()}</Text>
          <View style={s.promoRow}>
            <TextInput
              style={s.promoInput}
              value={promoCode}
              onChangeText={setPromoCode}
              placeholder={t('subscription:promoPlaceholder')}
              placeholderTextColor={theme.colors.textLight}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[s.promoBtn, (!promoCode.trim() || !!actionLoading['apply-discount']) && { opacity: 0.5 }]}
              onPress={() => withLoading('apply-discount', async () => {
                await subscriptionApi.applyDiscount(contractId, promoCode.trim())
                showToast(t('subscription:promoApplied'), 'success')
                setPromoCode('')
              })}
              disabled={!promoCode.trim() || !!actionLoading['apply-discount']}
              activeOpacity={0.85}
            >
              {actionLoading['apply-discount']
                ? <ActivityIndicator color={theme.colors.white} size="small" />
                : <Text style={s.promoBtnText}>{t('subscription:apply')}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </CascadeIn>

      {/* Gérer */}
      <CascadeIn index={6}>
        <View style={s.card}>
          <Text style={[s.sectionCaps, { marginBottom: theme.spacing[4] }]}>{t('subscription:manageSection').toUpperCase()}</Text>
          <View style={{ gap: 10 }}>
          {isActive && (
            <TouchableOpacity
              style={[s.manageBtn, s.manageBtnOrange]}
              onPress={() => setPauseSheet(true)}
              activeOpacity={0.85}
            >
              <Text style={[s.manageBtnText, { color: theme.colors.warning }]}>{t('subscription:pause')}</Text>
            </TouchableOpacity>
          )}
          {isPaused && (
            <TouchableOpacity
              style={[s.manageBtn, s.manageBtnGreen]}
              onPress={resume}
              disabled={!!actionLoading['resume']}
              activeOpacity={0.85}
            >
              {actionLoading['resume']
                ? <ActivityIndicator color={theme.colors.success} size="small" />
                : <Text style={[s.manageBtnText, { color: theme.colors.success }]}>{t('subscription:resume')}</Text>
              }
            </TouchableOpacity>
          )}
          {sub.status !== 'cancelled' && (
            <TouchableOpacity
              style={[s.manageBtn, s.manageBtnRed]}
              onPress={() => router.push({ pathname: '/cancel-subscription', params: { contractId } })}
              activeOpacity={0.85}
            >
              <Text style={[s.manageBtnText, { color: theme.colors.error }]}>{t('subscription:cancel')}</Text>
            </TouchableOpacity>
          )}
          </View>
        </View>
      </CascadeIn>
    </>
  )

  // ─── Onglet Prochaines ────────────────────────────────────

  const renderUpcoming = () => (
    <>
      {upcomingOrders.length === 0 ? (
        <CascadeIn index={0}>
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>{t('subscription:noUpcomingOrders')}</Text>
          </View>
        </CascadeIn>
      ) : upcomingOrders.map((order: any, index: number) => {
        const skipKey = `skip_${order.id}`
        const lines = contractLines.length > 0 ? contractLines : [firstLine]

        return (
          <CascadeIn key={order.id ?? index} index={index}>
            <View style={s.cardCompact}>
              <View style={s.cardHeaderRow}>
                <Text style={s.upcomingDate}>{formatDateShort(order.billingDate)}</Text>
                <View style={[s.miniBadge, { backgroundColor: 'rgba(240,196,23,0.15)' }]}>
                  <Text style={[s.miniBadgeText, { color: '#d4a000' }]}>{t('subscription:badgePlanned').toUpperCase()}</Text>
                </View>
              </View>

              <View style={s.divider} />

              {lines.map((item: any, i: number) => (
                <View key={i} style={[s.productRow, i > 0 && { marginTop: theme.spacing[2] }]}>
                  {item.variantImage ? (
                    <Image source={{ uri: item.variantImage }} style={s.productThumb64} resizeMode="cover" />
                  ) : (
                    <View style={[s.productThumb64, { backgroundColor: theme.colors.inputBg }]} />
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.productRowName} numberOfLines={2}>
                      {item.title ?? sub.product_name ?? '—'}
                    </Text>
                    {item.variantTitle && item.variantTitle !== 'Default Title' ? (
                      <Text style={s.productRowVariant}>{item.variantTitle}</Text>
                    ) : null}
                    <Text style={s.productRowMeta}>{t('subscription:qtyLabel', { count: item.quantity ?? 1 })}</Text>
                  </View>
                  <Text style={s.productRowPrice}>
                    {formatPrice(item.currentPrice ?? item.originalPrice ?? sub.price_amount, currency)}
                  </Text>
                </View>
              ))}

              <View style={s.divider} />

              <View style={s.actionRow}>
                <TouchableOpacity
                  style={[s.btnGraySm, { flex: 1 }]}
                  onPress={() => setSkipTarget(order)}
                  disabled={!!actionLoading[skipKey] || !isActive}
                  activeOpacity={0.85}
                >
                  {actionLoading[skipKey]
                    ? <ActivityIndicator color={theme.colors.textMid} size="small" />
                    : <Text style={s.btnGraySmText}>{t('subscription:skip')}</Text>
                  }
                </TouchableOpacity>
                {index === 0 && isActive && (
                  <TouchableOpacity
                    style={[s.btnBlueTint, { flex: 1 }]}
                    onPress={() => setRescheduleSheet(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={s.btnBlueTintText}>{t('subscription:reschedule')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </CascadeIn>
        )
      })}
    </>
  )

  // ─── Onglet Passées ───────────────────────────────────────

  const renderPast = () => (
    <>
      {pastOrders.length === 0 ? (
        <CascadeIn index={0}>
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📦</Text>
            <Text style={s.emptyTitle}>{t('subscription:noPastOrders')}</Text>
          </View>
        </CascadeIn>
      ) : pastOrders.map((order: any, index: number) => {
        const variants: any[] = Array.isArray(order.variantList) ? order.variantList : []
        const orderStatus = getPastOrderStatus(order)

        return (
          <CascadeIn key={order.id ?? index} index={index}>
            <View style={s.cardCompact}>
              <View style={s.cardHeaderRow}>
                <View>
                  <Text style={s.pastOrderNumber}>{order.orderName ?? t('subscription:pastOrderFallback', { index: index + 1 })}</Text>
                  <Text style={s.pastOrderDate}>{formatDateShort(order.billingDate)}</Text>
                </View>
                <View style={[s.miniBadge, { backgroundColor: orderStatus.bg }]}>
                  <Text style={[s.miniBadgeText, { color: orderStatus.color }]}>{orderStatus.label.toUpperCase()}</Text>
                </View>
              </View>

              <View style={s.divider} />

              {variants.map((item: any, i: number) => (
                <View key={i} style={[s.productRow, i > 0 && { marginTop: theme.spacing[2] }]}>
                  {(item.image || item.variantImage) ? (
                    <Image source={{ uri: item.image ?? item.variantImage }} style={s.productThumb56} resizeMode="cover" />
                  ) : (
                    <View style={[s.productThumb56, { backgroundColor: theme.colors.inputBg }]} />
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.productRowName} numberOfLines={2}>
                      {item.productTitle ?? item.title ?? sub.product_name ?? '—'}
                    </Text>
                    {item.variantTitle && item.variantTitle !== 'Default Title' ? (
                      <Text style={s.productRowVariant}>{item.variantTitle}</Text>
                    ) : null}
                    <Text style={s.productRowMeta}>{t('subscription:qtyLabel', { count: item.quantity ?? 1 })}</Text>
                  </View>
                </View>
              ))}

              <View style={s.divider} />

              <View style={s.cardHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                  <Text style={s.recapTotalLabel}>{t('subscription:total').toUpperCase()}</Text>
                  <Text style={s.recapTotalValue}>{formatPrice(order.orderAmount, currency)}</Text>
                </View>
                <TouchableOpacity onPress={() => setPastOrderSheet(order)} activeOpacity={0.7}>
                  <Text style={s.detailsLink}>{t('subscription:seeDetailsArrow')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </CascadeIn>
        )
      })}
    </>
  )

  const renderSkeletons = () => (
    <>
      <View style={s.card}>
        <Shimmer style={{ height: 160, borderRadius: theme.radius.lg }} />
        <Shimmer style={{ height: 16, marginTop: theme.spacing[4] }} />
        <Shimmer style={{ height: 12, width: '60%', marginTop: theme.spacing[2] }} />
      </View>
      <View style={s.card}>
        <Shimmer style={{ height: 12, width: 120 }} />
        <Shimmer style={{ height: 16, width: '50%', marginTop: theme.spacing[3] }} />
      </View>
      <View style={s.card}>
        <Shimmer style={{ height: 12, width: 120 }} />
        <Shimmer style={{ height: 16, width: '70%', marginTop: theme.spacing[3] }} />
      </View>
    </>
  )

  return (
    <View style={s.root}>
      {/* ── HEADER ── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerInner}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <Text style={s.backText}>{t('tracking:back')}</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{sub.product_name ?? t('subscription:headerFallback')}</Text>
          <View style={s.headerRight}>
            <View style={[s.miniBadge, { backgroundColor: statusBadge.bg }]}>
              <Text style={[s.miniBadgeText, { color: statusBadge.color }]}>{statusBadge.label}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── ONGLETS ── */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabsRow}
        >
          {tabs.map(tab => {
            const active = activeTab === tab.key
            return (
              <TouchableOpacity
                key={tab.key}
                style={[s.tabPill, active ? s.tabPillActive : s.tabPillInactive]}
                onPress={() => switchTab(tab.key)}
                activeOpacity={0.8}
              >
                <Text style={active ? s.tabPillTextActive : s.tabPillText}>{tab.label}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* ── CONTENU ── */}
      <Animated.View style={{ flex: 1, opacity: contentFade }}>
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {loading
            ? renderSkeletons()
            : activeTab === 'details'
              ? renderDetails()
              : activeTab === 'upcoming'
                ? renderUpcoming()
                : renderPast()
          }
        </ScrollView>
      </Animated.View>

      {/* ── MODALS ── */}
      {freqSheet && (
        <FrequencySheet
          contractId={contractId}
          currentValue={sub.frequency_value}
          onClose={() => setFreqSheet(false)}
          onSaved={() => { setFreqSheet(false); loadOrders() }}
        />
      )}
      {addressSheet && (
        <AddressSheet
          contractId={contractId}
          initial={shippingAddress}
          onClose={() => setAddressSheet(false)}
          onSaved={(addr) => {
            setAddressSheet(false)
            setShippingAddress(addr)
            showToast(t('subscription:addressUpdated'), 'success')
            loadOrders()
          }}
        />
      )}
      {rescheduleSheet && (
        <RescheduleSheet
          contractId={contractId}
          upcoming={upcomingOrders}
          price={formatPrice(subtotal, currency)}
          onClose={() => setRescheduleSheet(false)}
          onDone={onRescheduled}
        />
      )}
      {paymentSheet && (
        <PaymentSheet
          contractId={contractId}
          paymentMethod={paymentMethod}
          onClose={() => setPaymentSheet(false)}
          onSent={({ email, alreadySent }) => {
            setPaymentSheet(false)
            router.push({ pathname: '/done', params: { kind: alreadySent ? 'linkAlready' : 'link', email } })
          }}
        />
      )}
      {pauseSheet && (
        <PauseSheet
          contractId={contractId}
          source="subscription-detail"
          onClose={() => setPauseSheet(false)}
          onPaused={() => {
            setPauseSheet(false)
            router.push({ pathname: '/done', params: { kind: 'paused', contractId } })
          }}
        />
      )}
      {skipTarget && (
        <Sheet
          title={t('care:reschedule.skipTitle')}
          subtitle={t('care:reschedule.skipBody', { date: formatDate(skipTarget.billingDate) })}
          onClose={() => setSkipTarget(null)}
          footer={<>
            <PillButton label={t('care:reschedule.skipCta')} loading={!!actionLoading[`skip_${skipTarget.id}`]} onPress={() => skipOrder(skipTarget)} />
            <PillButton variant="quiet" label={t('common:back')} onPress={() => setSkipTarget(null)} />
          </>}
        />
      )}
      {pastOrderSheet && (
        <PastOrderSheet
          order={pastOrderSheet}
          currency={currency}
          shippingAddress={shippingAddress}
          onClose={() => setPastOrderSheet(null)}
        />
      )}
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Header
  header: {
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerInner: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing[5],
  },
  backBtn: { minWidth: 76 },
  backText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: theme.colors.blue,
  },
  headerTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.md,
    color: theme.colors.navy,
    textAlign: 'center',
    marginHorizontal: theme.spacing[2],
  },
  headerRight: { minWidth: 76, alignItems: 'flex-end' },

  // Tabs
  tabsRow: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[2],
  },
  tabPill: {
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
  },
  tabPillActive: {
    backgroundColor: theme.colors.navy,
  },
  tabPillInactive: {
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tabPillText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textMid,
  },
  tabPillTextActive: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.white,
  },

  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
    gap: theme.spacing[4],
  },

  // Cards
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[5],
    ...theme.shadows.card,
  },
  cardCompact: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl,
    padding: theme.spacing[4],
    ...theme.shadows.light,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionCaps: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textLight,
    letterSpacing: 1.2,
  },
  sheetSectionCaps: {
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[4],
  },

  // Hero produit
  heroImageWrap: {
    height: 200,
    width: '100%',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroImageFade: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 80,
  },
  productName: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.lg,
    color: theme.colors.navy,
    letterSpacing: -0.3,
  },
  productVariant: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  productSku: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs + 1,
    color: theme.colors.textLight,
    marginTop: theme.spacing[1],
  },

  // Tableau prix
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
  },
  infoValue: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.sm,
    color: theme.colors.navy,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: theme.spacing[2],
    paddingTop: theme.spacing[3],
  },
  totalLabel: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.sm,
    color: theme.colors.navy,
    letterSpacing: 0.5,
  },
  totalValue: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
  },

  // Prochaine commande
  nextDate: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.lg - 1,
    color: theme.colors.navy,
    marginTop: theme.spacing[2],
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing[2] + 2,
    marginTop: theme.spacing[4],
  },
  btnBlueSolid: {
    height: 44,
    backgroundColor: theme.colors.blue,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBlueSolidText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.white,
  },
  btnGray: {
    height: 44,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGrayText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textMid,
  },

  // Fréquence
  freqValue: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.md,
    color: theme.colors.navy,
    marginTop: theme.spacing[2],
  },
  btnOutlineBlueSmall: {
    borderWidth: 1,
    borderColor: theme.colors.blue,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
  },
  btnOutlineBlueSmallText: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.sm,
    color: theme.colors.blue,
  },

  // Adresse
  addressName: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
    marginTop: theme.spacing[3],
  },
  addressText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textMid,
    lineHeight: 22,
    marginTop: theme.spacing[1],
  },
  mutedItalic: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textLight,
    fontStyle: 'italic',
    marginTop: theme.spacing[2],
  },

  // Paiement
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
  brandPill: {
    borderRadius: theme.radius.xs,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing[2],
  },
  brandPillText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 10,
    color: theme.colors.white,
    letterSpacing: 0.5,
  },
  cardNumber: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.md,
    color: theme.colors.navy,
  },
  paymentMeta: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    marginTop: theme.spacing[2],
  },
  paymentHolder: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textMid,
    marginTop: 2,
  },

  // Promo
  promoRow: {
    flexDirection: 'row',
    gap: theme.spacing[2] + 2,
    marginTop: theme.spacing[3],
  },
  promoInput: {
    flex: 1,
    height: 48,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[4],
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
  },
  promoBtn: {
    height: 48,
    backgroundColor: theme.colors.blue,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBtnText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.white,
  },

  // Gérer
  manageBtn: {
    height: 48,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageBtnOrange: {
    backgroundColor: 'rgba(255,92,0,0.08)',
    borderColor: 'rgba(255,92,0,0.25)',
  },
  manageBtnGreen: {
    backgroundColor: 'rgba(30,187,110,0.08)',
    borderColor: 'rgba(30,187,110,0.25)',
  },
  manageBtnRed: {
    backgroundColor: 'rgba(227,44,43,0.06)',
    borderColor: 'rgba(227,44,43,0.2)',
  },
  manageBtnText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
  },

  // Badges
  miniBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing[2] + 2,
    paddingVertical: theme.spacing[1],
  },
  miniBadgeText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },

  // Produits (lignes)
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  productThumb64: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.md,
  },
  productThumb56: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.sm + 2,
  },
  productRowName: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.navy,
  },
  productRowVariant: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs + 1,
    color: theme.colors.textLight,
  },
  productRowMeta: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs + 1,
    color: theme.colors.textLight,
  },
  productRowPrice: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
  },

  // Upcoming / Past
  upcomingDate: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
  },
  pastOrderNumber: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.md,
    color: theme.colors.navy,
  },
  pastOrderDate: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  btnGraySm: {
    height: 40,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGraySmText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textMid,
  },
  btnBlueTint: {
    height: 40,
    backgroundColor: 'rgba(39,100,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(39,100,255,0.25)',
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBlueTintText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.sm,
    color: theme.colors.blue,
  },
  recapTotalLabel: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 10,
    color: theme.colors.textLight,
    letterSpacing: 1,
  },
  recapTotalValue: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
  },
  recapTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[2],
  },
  detailsLink: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.blue,
  },

  // Empty
  emptyCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[10],
    alignItems: 'center',
    gap: theme.spacing[3],
    ...theme.shadows.card,
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.md,
    color: theme.colors.navy,
  },

  // Sheets
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,21,61,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius['3xl'],
    borderTopRightRadius: theme.radius['3xl'],
    padding: theme.spacing[6],
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: theme.spacing[5],
  },
  sheetTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.xl - 2,
    color: theme.colors.navy,
    marginBottom: theme.spacing[2],
  },
  sheetSubtitle: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    marginBottom: theme.spacing[3],
  },

  // Fréquence sheet
  freqOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing[4],
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  freqOptionActive: {
    borderColor: theme.colors.blue,
    backgroundColor: 'rgba(39,100,255,0.04)',
  },
  freqOptionText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: theme.colors.textMid,
  },
  freqOptionTextActive: {
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.blue,
  },

  // Boutons sheets
  btnLime: {
    height: 52,
    backgroundColor: theme.colors.lime,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing[5],
  },
  btnLimeText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.white,
  },
  btnNavy: {
    height: 52,
    backgroundColor: theme.colors.navy,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing[5],
  },
  btnNavyText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.white,
  },

  // Champs sheets
  fieldLabel: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textLight,
    letterSpacing: 1,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[2],
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
    marginBottom: theme.spacing[2],
  },
  fieldInputSelect: {
    height: 50,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[4],
    justifyContent: 'center',
    marginBottom: theme.spacing[2],
  },
  selectValueText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
  },
  selectPlaceholderText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base,
    color: theme.colors.textLight,
  },
  countryList: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    marginBottom: theme.spacing[2],
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  countryRowActive: {
    backgroundColor: 'rgba(39,100,255,0.04)',
  },
  countryRowText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base,
    color: theme.colors.textMid,
  },
  countryRowTextActive: {
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.blue,
  },

  // Checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2] + 2,
    marginTop: theme.spacing[4],
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: theme.radius.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.colors.blue,
    borderColor: theme.colors.blue,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textMid,
  },

  // Shimmer
  shimmerBase: {
    backgroundColor: theme.colors.bluePale,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
})
