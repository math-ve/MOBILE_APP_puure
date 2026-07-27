import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
  Animated, Easing,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import Svg, { Path } from 'react-native-svg'
import { supabase } from '../lib/supabase'
import theme from '../lib/theme'
import { useToast } from '../hooks/useToast'

const SUPABASE_URL = 'https://vwlqdrrlggolgdssdwoh.supabase.co'

type Tab = 'details' | 'upcoming' | 'past'

// ─── Helpers ───────────────────────────────────────────────

const formatDate = (iso?: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const formatDateShort = (iso?: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatPrice = (amount?: number | string | null, currency?: string | null) => {
  if (amount == null) return '—'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: currency ?? 'EUR', minimumFractionDigits: 2,
  }).format(num)
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

  // Échec de facturation
  if (billing && billing !== 'SUCCESS') return { label: 'Échec', ...red }
  // Statut de livraison connu
  if (fulfillment === 'FULFILLED') return { label: 'Expédiée', ...blue }
  if (fulfillment === 'DELIVERED') return { label: 'Livrée', ...green }
  if (fulfillment === 'PARTIALLY_FULFILLED') return { label: 'Partielle', ...blue }
  if (fulfillment === 'ON_HOLD' || fulfillment === 'SCHEDULED') return { label: 'En préparation', ...orange }
  if (financial === 'REFUNDED' || financial === 'PARTIALLY_REFUNDED') return { label: 'Remboursée', ...orange }
  // Facturée avec succès mais pas encore expédiée (fulfillment null)
  return { label: 'Confirmée', ...blue }
}

const formatFrequency = (unit?: string | null, value?: number | null) => {
  if (!unit || value == null) return '—'
  const labels: Record<string, string> = {
    week: 'semaines', weeks: 'semaines', month: 'mois', months: 'mois', day: 'jours', days: 'jours',
  }
  const label = labels[unit.toLowerCase()] ?? unit
  const prefix = unit.toLowerCase().startsWith('week') ? 'Toutes les' : 'Tous les'
  return `${prefix} ${value} ${label}`
}

const toISODate = (d: Date) => d.toISOString().split('T')[0]

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  active: { label: 'ACTIF', bg: 'rgba(30,187,110,0.12)', color: theme.colors.success },
  paused: { label: 'PAUSÉ', bg: 'rgba(255,92,0,0.10)', color: theme.colors.warning },
  cancelled: { label: 'ANNULÉ', bg: 'rgba(227,44,43,0.10)', color: theme.colors.error },
}

const CARD_BRANDS: Record<string, { label: string; bg: string }> = {
  visa: { label: 'VISA', bg: '#1a1f71' },
  mastercard: { label: 'MASTERCARD', bg: '#eb001b' },
  amex: { label: 'AMEX', bg: '#006fcf' },
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

const FREQ_OPTIONS = [
  { label: '1 mois', value: 1 },
  { label: '2 mois', value: 2 },
  { label: '3 mois', value: 3 },
  { label: '6 mois', value: 6 },
]

function FrequencySheet({ contractId, currentValue, onClose, onSaved }: {
  contractId: string; currentValue: number | null; onClose: () => void; onSaved: () => void
}) {
  const { showToast } = useToast()
  const [selected, setSelected] = useState(currentValue ?? 1)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`${SUPABASE_URL}/functions/v1/subscription-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'update-frequency', contractId, billingIntervalCount: selected }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Erreur')
      showToast('Fréquence mise à jour', 'success')
      onSaved()
    } catch (e: any) {
      showToast(e.message ?? 'Une erreur est survenue', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet onClose={onClose}>
      <Text style={s.sheetTitle}>Modifier la fréquence</Text>
      <View style={{ gap: theme.spacing[2] + 2 }}>
        {FREQ_OPTIONS.map(opt => {
          const isSelected = selected === opt.value
          return (
            <TouchableOpacity
              key={opt.value}
              style={[s.freqOption, isSelected && s.freqOptionActive]}
              onPress={() => setSelected(opt.value)}
              activeOpacity={0.7}
            >
              <Text style={[s.freqOptionText, isSelected && s.freqOptionTextActive]}>{opt.label}</Text>
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
          : <Text style={s.btnLimeText}>Confirmer</Text>
        }
      </TouchableOpacity>
    </BottomSheet>
  )
}

// ─── Modal adresse ─────────────────────────────────────────

const COUNTRY_OPTIONS: { label: string; value: string; code: string }[] = [
  { label: 'Belgique', value: 'Belgium', code: 'BE' },
  { label: 'France', value: 'France', code: 'FR' },
  { label: 'Luxembourg', value: 'Luxembourg', code: 'LU' },
  { label: 'Pays-Bas', value: 'Netherlands', code: 'NL' },
  { label: 'Suisse', value: 'Switzerland', code: 'CH' },
  { label: 'Allemagne', value: 'Germany', code: 'DE' },
  { label: 'Autriche', value: 'Austria', code: 'AT' },
  { label: 'Espagne', value: 'Spain', code: 'ES' },
  { label: 'Italie', value: 'Italy', code: 'IT' },
  { label: 'Portugal', value: 'Portugal', code: 'PT' },
  { label: 'Royaume-Uni', value: 'United Kingdom', code: 'GB' },
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
      Alert.alert('Champs manquants', 'Veuillez remplir tous les champs obligatoires (*).')
      return
    }
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { Alert.alert('Session expirée', 'Veuillez vous reconnecter.'); return }
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
      const res = await fetch(`${SUPABASE_URL}/functions/v1/subscription-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'update-address', contractId, address }),
      })
      const json = await res.json()
      if (!json.success) {
        let errMsg = json.error ?? `HTTP ${res.status}`
        if (json.raw) {
          try { errMsg = JSON.parse(json.raw).message?.replace('UserGeneratedError:', '').trim() ?? errMsg } catch { /* keep */ }
        }
        throw new Error(errMsg)
      }
      onSaved(address)
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Erreur lors de la mise à jour')
    } finally {
      setSaving(false)
    }
  }

  const textFields: { key: keyof AddressFields; label: string; placeholder: string }[] = [
    { key: 'firstName', label: 'PRÉNOM *', placeholder: 'Prénom' },
    { key: 'lastName', label: 'NOM *', placeholder: 'Nom' },
    { key: 'address1', label: 'ADRESSE *', placeholder: 'Rue et numéro' },
    { key: 'address2', label: 'COMPLÉMENT', placeholder: 'Appartement, bâtiment… (optionnel)' },
    { key: 'city', label: 'VILLE *', placeholder: 'Ville' },
    { key: 'zip', label: 'CODE POSTAL *', placeholder: 'Code postal' },
    { key: 'phone', label: 'TÉLÉPHONE', placeholder: '+32 … (optionnel)' },
  ]

  return (
    <BottomSheet onClose={onClose}>
      <Text style={s.sheetTitle}>Modifier l'adresse</Text>
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {textFields.map(f => (
          <View key={f.key}>
            <Text style={s.fieldLabel}>{f.label}</Text>
            <TextInput
              style={s.fieldInput}
              value={fields[f.key]}
              onChangeText={set(f.key)}
              placeholder={f.placeholder}
              placeholderTextColor={theme.colors.textLight}
              autoCorrect={false}
            />
          </View>
        ))}
        <Text style={s.fieldLabel}>PAYS *</Text>
        <TouchableOpacity style={s.fieldInputSelect} onPress={() => setCountryOpen(!countryOpen)} activeOpacity={0.7}>
          <Text style={selectedCountry ? s.selectValueText : s.selectPlaceholderText}>
            {selectedCountry?.label ?? 'Sélectionner un pays…'}
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
                  <Text style={[s.countryRowText, isSelected && s.countryRowTextActive]}>{opt.label}</Text>
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
          : <Text style={s.btnLimeText}>Enregistrer</Text>
        }
      </TouchableOpacity>
    </BottomSheet>
  )
}

// ─── Modal reprogrammation ─────────────────────────────────

function RescheduleSheet({ contractId, attemptId, onClose, onSaved }: {
  contractId: string; attemptId: string; onClose: () => void; onSaved: () => void
}) {
  const { showToast } = useToast()
  const [date, setDate] = useState(new Date(Date.now() + 7 * 86400000))
  const [rescheduleAll, setRescheduleAll] = useState(false)
  const [saving, setSaving] = useState(false)

  const minDate = new Date(Date.now() + 86400000)
  const maxDate = new Date(Date.now() + 365 * 86400000)

  const openAndroidPicker = () => {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      minimumDate: minDate,
      maximumDate: maxDate,
      onChange: (_, selected) => { if (selected) setDate(selected) },
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`${SUPABASE_URL}/functions/v1/subscription-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: 'reschedule', contractId, id: attemptId,
          newBillingDate: toISODate(date), rescheduleAllUpcoming: rescheduleAll,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Erreur')
      showToast('Commande reprogrammée', 'success')
      onSaved()
    } catch (e: any) {
      showToast(e.message ?? 'Une erreur est survenue', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet onClose={onClose}>
      <Text style={s.sheetTitle}>Reprogrammer la commande</Text>

      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="inline"
          minimumDate={minDate}
          maximumDate={maxDate}
          accentColor={theme.colors.blue}
          onChange={(_, selected) => { if (selected) setDate(selected) }}
          locale="fr-FR"
        />
      ) : (
        <TouchableOpacity style={s.fieldInputSelect} onPress={openAndroidPicker} activeOpacity={0.7}>
          <Text style={s.selectValueText}>{formatDate(date.toISOString())}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={s.checkboxRow}
        onPress={() => setRescheduleAll(!rescheduleAll)}
        activeOpacity={0.7}
      >
        <View style={[s.checkbox, rescheduleAll && s.checkboxChecked]}>
          {rescheduleAll && <CheckIcon color={theme.colors.white} size={12} />}
        </View>
        <Text style={s.checkboxLabel}>Reprogrammer toutes les commandes suivantes</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.btnLime, saving && { opacity: 0.7 }]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving
          ? <ActivityIndicator color={theme.colors.navy} size="small" />
          : <Text style={s.btnLimeText}>Confirmer</Text>
        }
      </TouchableOpacity>
    </BottomSheet>
  )
}

// ─── Modal détail commande passée ──────────────────────────

function PastOrderSheet({ order, currency, shippingAddress, onClose }: {
  order: any; currency: string | null; shippingAddress: any; onClose: () => void
}) {
  const variants: any[] = Array.isArray(order.variantList) ? order.variantList : []

  return (
    <BottomSheet onClose={onClose}>
      <Text style={s.sheetTitle}>{order.orderName ?? 'Détails commande'}</Text>
      <Text style={s.sheetSubtitle}>{formatDate(order.billingDate)}</Text>

      <View style={s.badgeRow}>
        {(order.status ?? '').toUpperCase() === 'SUCCESS' && (
          <View style={[s.miniBadge, { backgroundColor: 'rgba(30,187,110,0.12)' }]}>
            <Text style={[s.miniBadgeText, { color: theme.colors.success }]}>PAYÉE</Text>
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
            <Text style={[s.sectionCaps, s.sheetSectionCaps]}>PRODUITS</Text>
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
                  <Text style={s.productRowMeta}>Qté : {item.quantity ?? 1}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={[s.sectionCaps, s.sheetSectionCaps]}>RÉCAPITULATIF</Text>
        <View style={s.recapTotalRow}>
          <Text style={s.recapTotalLabel}>TOTAL</Text>
          <Text style={s.recapTotalValue}>{formatPrice(order.orderAmount, currency)}</Text>
        </View>

        {shippingAddress && (
          <>
            <Text style={[s.sectionCaps, s.sheetSectionCaps]}>ADRESSE DE LIVRAISON</Text>
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
        <Text style={s.btnNavyText}>Fermer</Text>
      </TouchableOpacity>
    </BottomSheet>
  )
}

// ─── Écran ─────────────────────────────────────────────────

export default function SubscriptionDetailScreen() {
  const { contractId, subData } = useLocalSearchParams<{ contractId: string; subData: string }>()
  const { showToast } = useToast()
  const insets = useSafeAreaInsets()

  const sub = useMemo(() => {
    try { return JSON.parse(subData ?? '{}') } catch { return {} }
  }, [subData])

  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [upcomingOrders, setUpcomingOrders] = useState<any[]>([])
  const [pastOrders, setPastOrders] = useState<any[]>([])
  const [shippingAddress, setShippingAddress] = useState<any>(null)
  const [paymentMethod, setPaymentMethod] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [promoCode, setPromoCode] = useState('')
  const [freqSheet, setFreqSheet] = useState(false)
  const [addressSheet, setAddressSheet] = useState(false)
  const [rescheduleSheet, setRescheduleSheet] = useState<string | null>(null)
  const [pastOrderSheet, setPastOrderSheet] = useState<any>(null)
  const contentFade = useRef(new Animated.Value(1)).current

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
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: profile } = await supabase
      .from('profiles')
      .select('shopify_customer_id')
      .eq('id', session.user.id)
      .single()
    const rawCid = profile?.shopify_customer_id ?? ''
    const customerId = rawCid.includes('/') ? rawCid.split('/').pop() : rawCid || null

    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-subscription-detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ contractId, customerId }),
    })
    const json = await res.json()
    setUpcomingOrders(json.upcomingOrders ?? [])
    setPastOrders(json.pastOrders ?? [])
    setShippingAddress(json.shippingAddress ?? null)
    setPaymentMethod(json.paymentMethod ?? null)
  }, [contractId])

  useEffect(() => {
    loadOrders().finally(() => setLoading(false))
  }, [loadOrders])

  const switchTab = (tab: Tab) => {
    if (tab === activeTab) return
    Animated.timing(contentFade, { toValue: 0, duration: 75, useNativeDriver: true }).start(() => {
      setActiveTab(tab)
      Animated.timing(contentFade, { toValue: 1, duration: 75, useNativeDriver: true }).start()
    })
  }

  const callAction = async (action: string, extra?: Record<string, unknown>, loadingKey?: string) => {
    const key = loadingKey ?? action
    setActionLoading(prev => ({ ...prev, [key]: true }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return false
      const res = await fetch(`${SUPABASE_URL}/functions/v1/subscription-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ action, contractId, ...extra }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Erreur inconnue')
      return true
    } catch (e: any) {
      showToast(e.message ?? 'Une erreur est survenue', 'error')
      return false
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const callManage = async (action: 'pause' | 'resume' | 'cancel') => {
    setActionLoading(prev => ({ ...prev, [action]: true }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: session.user.id, subscription_contract_id: contractId, action }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Erreur')
      const msgs = { pause: 'Abonnement mis en pause', resume: 'Abonnement repris', cancel: 'Abonnement annulé' }
      showToast(msgs[action], 'success')
    } catch (e: any) {
      showToast(e.message ?? 'Une erreur est survenue', 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [action]: false }))
    }
  }

  const confirmCancel = () => {
    Alert.alert(
      "Annuler l'abonnement",
      'Cette action est irréversible. Votre abonnement sera définitivement annulé.',
      [
        { text: 'Retour', style: 'cancel' },
        { text: "Annuler l'abonnement", style: 'destructive', onPress: () => callManage('cancel') },
      ]
    )
  }

  const isActive = sub.status === 'active'
  const isPaused = sub.status === 'paused'
  const statusBadge = STATUS_BADGE[sub.status] ?? STATUS_BADGE.cancelled
  const currency = sub.price_currency ?? null

  const unitPrice = sub.price_amount ?? parseFloat(firstLine.currentPrice ?? '0')
  const quantity = firstLine.quantity ?? 1
  const subtotal = unitPrice * quantity

  const brandKey = (paymentMethod?.brand ?? '').toLowerCase()
  const brand = CARD_BRANDS[brandKey] ?? { label: (paymentMethod?.brand ?? 'CARTE').toUpperCase(), bg: theme.colors.navy }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Détails' },
    { key: 'upcoming', label: `Prochaines${upcomingOrders.length ? ` (${upcomingOrders.length})` : ''}` },
    { key: 'past', label: `Passées${pastOrders.length ? ` (${pastOrders.length})` : ''}` },
  ]

  // ─── Onglet Détails ───────────────────────────────────────

  const renderDetails = () => (
    <>
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
            {firstLine.sku ? <Text style={s.productSku}>SKU : {firstLine.sku}</Text> : null}

            <View style={s.divider} />

            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Quantité</Text>
              <Text style={s.infoValue}>{String(quantity)}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Prix actuel</Text>
              <Text style={[s.infoValue, { color: theme.colors.blue, fontFamily: theme.typography.fontFamily.bold }]}>
                {formatPrice(unitPrice, currency)}
              </Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Sous-total</Text>
              <Text style={s.infoValue}>{formatPrice(subtotal, currency)}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Livraison</Text>
              <Text style={s.infoValue}>{formatPrice(0, currency)}</Text>
            </View>
            <View style={[s.infoRow, s.totalRow]}>
              <Text style={s.totalLabel}>TOTAL</Text>
              <Text style={s.totalValue}>{formatPrice(subtotal, currency)}</Text>
            </View>
          </View>
        </View>
      </CascadeIn>

      {/* Prochaine commande */}
      <CascadeIn index={1}>
        <View style={s.card}>
          <Text style={s.sectionCaps}>PROCHAINE COMMANDE</Text>
          <Text style={s.nextDate}>{formatDate(sub.next_billing_date)}</Text>
          {upcomingOrders.length > 0 && (
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.btnBlueSolid, { flex: 1 }]}
                onPress={async () => {
                  const ok = await callAction('order-now', { id: upcomingOrders[0].id }, 'order-now')
                  if (ok) { showToast('Commande déclenchée', 'success'); loadOrders() }
                }}
                disabled={!!actionLoading['order-now']}
                activeOpacity={0.85}
              >
                {actionLoading['order-now']
                  ? <ActivityIndicator color={theme.colors.white} size="small" />
                  : <Text style={s.btnBlueSolidText}>Commander maintenant</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnGray, { flex: 1 }]}
                onPress={async () => {
                  const ok = await callAction('skip', { id: upcomingOrders[0].id }, 'skip-first')
                  if (ok) { showToast('Commande passée', 'success'); loadOrders() }
                }}
                disabled={!!actionLoading['skip-first']}
                activeOpacity={0.85}
              >
                {actionLoading['skip-first']
                  ? <ActivityIndicator color={theme.colors.textMid} size="small" />
                  : <Text style={s.btnGrayText}>Passer</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      </CascadeIn>

      {/* Fréquence */}
      <CascadeIn index={2}>
        <View style={s.card}>
          <Text style={s.sectionCaps}>FRÉQUENCE</Text>
          <Text style={s.freqValue}>{formatFrequency(sub.frequency_unit, sub.frequency_value)}</Text>
          <TouchableOpacity
            style={[s.btnOutlineBlueSmall, { alignSelf: 'flex-end', marginTop: theme.spacing[3] }]}
            onPress={() => setFreqSheet(true)}
            activeOpacity={0.7}
          >
            <Text style={s.btnOutlineBlueSmallText}>Modifier →</Text>
          </TouchableOpacity>
        </View>
      </CascadeIn>

      {/* Adresse */}
      <CascadeIn index={3}>
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <Text style={s.sectionCaps}>ADRESSE DE LIVRAISON</Text>
            <TouchableOpacity style={s.btnOutlineBlueSmall} onPress={() => setAddressSheet(true)} activeOpacity={0.7}>
              <Text style={s.btnOutlineBlueSmallText}>Modifier</Text>
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
            <Text style={s.mutedItalic}>Aucune adresse</Text>
          )}
        </View>
      </CascadeIn>

      {/* Paiement */}
      <CascadeIn index={4}>
        <View style={s.card}>
          <Text style={s.sectionCaps}>PAIEMENT</Text>
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
                  Expire {String(paymentMethod.expiryMonth).padStart(2, '0')}/{paymentMethod.expiryYear}
                </Text>
              ) : null}
              {paymentMethod.cardHolderName ? (
                <Text style={s.paymentHolder}>Titulaire : {paymentMethod.cardHolderName}</Text>
              ) : null}
            </>
          ) : (
            <Text style={s.mutedItalic}>Aucune carte enregistrée</Text>
          )}
        </View>
      </CascadeIn>

      {/* Code promo */}
      <CascadeIn index={5}>
        <View style={s.card}>
          <Text style={s.sectionCaps}>CODE PROMO</Text>
          <View style={s.promoRow}>
            <TextInput
              style={s.promoInput}
              value={promoCode}
              onChangeText={setPromoCode}
              placeholder="Code promo"
              placeholderTextColor={theme.colors.textLight}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[s.promoBtn, (!promoCode.trim() || !!actionLoading['apply-discount']) && { opacity: 0.5 }]}
              onPress={async () => {
                const ok = await callAction('apply-discount', { discountCode: promoCode.trim() }, 'apply-discount')
                if (ok) { showToast('Code promo appliqué', 'success'); setPromoCode('') }
              }}
              disabled={!promoCode.trim() || !!actionLoading['apply-discount']}
              activeOpacity={0.85}
            >
              {actionLoading['apply-discount']
                ? <ActivityIndicator color={theme.colors.white} size="small" />
                : <Text style={s.promoBtnText}>Appliquer</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </CascadeIn>

      {/* Gérer */}
      <CascadeIn index={6}>
        <View style={s.card}>
          <Text style={[s.sectionCaps, { marginBottom: theme.spacing[4] }]}>GÉRER L'ABONNEMENT</Text>
          <View style={{ gap: 10 }}>
          {isActive && (
            <TouchableOpacity
              style={[s.manageBtn, s.manageBtnOrange]}
              onPress={() => callManage('pause')}
              disabled={!!actionLoading['pause']}
              activeOpacity={0.85}
            >
              {actionLoading['pause']
                ? <ActivityIndicator color={theme.colors.warning} size="small" />
                : <Text style={[s.manageBtnText, { color: theme.colors.warning }]}>⏸ Mettre en pause</Text>
              }
            </TouchableOpacity>
          )}
          {isPaused && (
            <TouchableOpacity
              style={[s.manageBtn, s.manageBtnGreen]}
              onPress={() => callManage('resume')}
              disabled={!!actionLoading['resume']}
              activeOpacity={0.85}
            >
              {actionLoading['resume']
                ? <ActivityIndicator color={theme.colors.success} size="small" />
                : <Text style={[s.manageBtnText, { color: theme.colors.success }]}>▶ Reprendre</Text>
              }
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.manageBtn, s.manageBtnRed]}
            onPress={confirmCancel}
            disabled={!!actionLoading['cancel']}
            activeOpacity={0.85}
          >
            {actionLoading['cancel']
              ? <ActivityIndicator color={theme.colors.error} size="small" />
              : <Text style={[s.manageBtnText, { color: theme.colors.error }]}>✕ Annuler l'abonnement</Text>
            }
          </TouchableOpacity>
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
            <Text style={s.emptyTitle}>Aucune commande planifiée</Text>
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
                  <Text style={[s.miniBadgeText, { color: '#d4a000' }]}>PLANIFIÉE</Text>
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
                    <Text style={s.productRowMeta}>Qté : {item.quantity ?? 1}</Text>
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
                  onPress={async () => {
                    const ok = await callAction('skip', { id: order.id }, skipKey)
                    if (ok) { showToast('Commande passée', 'success'); loadOrders() }
                  }}
                  disabled={!!actionLoading[skipKey]}
                  activeOpacity={0.85}
                >
                  {actionLoading[skipKey]
                    ? <ActivityIndicator color={theme.colors.textMid} size="small" />
                    : <Text style={s.btnGraySmText}>Passer</Text>
                  }
                </TouchableOpacity>
                {index === 0 && (
                  <TouchableOpacity
                    style={[s.btnBlueTint, { flex: 1 }]}
                    onPress={() => setRescheduleSheet(order.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={s.btnBlueTintText}>Reprogrammer</Text>
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
            <Text style={s.emptyTitle}>Aucune commande passée</Text>
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
                  <Text style={s.pastOrderNumber}>{order.orderName ?? `Commande ${index + 1}`}</Text>
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
                    <Text style={s.productRowMeta}>Qté : {item.quantity ?? 1}</Text>
                  </View>
                </View>
              ))}

              <View style={s.divider} />

              <View style={s.cardHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
                  <Text style={s.recapTotalLabel}>TOTAL</Text>
                  <Text style={s.recapTotalValue}>{formatPrice(order.orderAmount, currency)}</Text>
                </View>
                <TouchableOpacity onPress={() => setPastOrderSheet(order)} activeOpacity={0.7}>
                  <Text style={s.detailsLink}>Voir les détails →</Text>
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
            <Text style={s.backText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{sub.product_name ?? 'Abonnement'}</Text>
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
            showToast('Adresse mise à jour', 'success')
            loadOrders()
          }}
        />
      )}
      {rescheduleSheet && (
        <RescheduleSheet
          contractId={contractId}
          attemptId={rescheduleSheet}
          onClose={() => setRescheduleSheet(null)}
          onSaved={() => { setRescheduleSheet(null); loadOrders() }}
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
