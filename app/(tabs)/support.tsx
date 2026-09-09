import { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Linking, Animated, Easing, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import { supabase } from '../../lib/supabase'
import theme from '../../lib/theme'
import i18n from '../../lib/i18n'
import { useToast } from '../../hooks/useToast'
import Logo from '../../components/ui/Logo'

// Worker Cloudflare qui crée le ticket Zendesk — même endpoint que le site
const WORKER_URL = 'https://lively-sound-95c2.mathieu-vaneynde.workers.dev/'
const SUPPORT_EMAIL = 'customercare@puurefilters.com'

// ─── Catégories ────────────────────────────────────────────
// `value` : valeur machine envoyée à Zendesk (routing) — NE PAS traduire.
// `catKey` / sous-valeurs : clés i18n (support:cat.* / support:sub.*).

interface Category { value: string; catKey: string; subs: string[] }

const CATEGORIES: Category[] = [
  {
    value: 'Order / Delivery',
    catKey: 'order_delivery',
    subs: [
      'order_/_delivery__order_not_received',
      'order_/_delivery__delivery_delayed',
      'order_/_delivery__tracking_issue',
      'order_/_delivery__wrong_item_received',
      'order_/_delivery__missing_item',
      'order_/_delivery__partial_delivery',
      'order_/_delivery__address_issue',
    ],
  },
  {
    value: 'Adapter / Compatibility',
    catKey: 'adapter_compatibility',
    subs: [
      'adapter_/_compatibility__wrong_adapter_needed',
      'adapter_/_compatibility__adapter_missing',
      'adapter_/_compatibility__faucet_not_compatible',
      'adapter_/_compatibility__thread_size_issue',
      'adapter_/_compatibility__measurement_issue',
      'adapter_/_compatibility__adapter_order_follow-up',
    ],
  },
  {
    value: 'Installation / Setup',
    catKey: 'installation_setup',
    subs: [
      'installation_/_setup__installation_help',
      'installation_/_setup__setup_instructions',
      'installation_/_setup__cannot_attach_filter',
      'installation_/_setup__leak_after_installation',
      'installation_/_setup__wrong_assembly',
      'installation_/_setup__tap_dripping_after_setup',
    ],
  },
  {
    value: 'Product issue',
    catKey: 'product_issue',
    subs: [
      'product_issue__defective_product',
      'product_issue__damaged_on_arrival',
      'product_issue__product_not_working',
      'product_issue__broken_part',
      'product_issue__stainless_steel_cover_issue',
      'product_issue__dripping_/_leakage',
      'product_issue__weak_connection',
    ],
  },
  {
    value: 'Filter / Cartridge',
    catKey: 'filter_cartridge',
    subs: [
      'filter_/_cartridge__missing_filter',
      'filter_/_cartridge__wrong_filter_received',
      'filter_/_cartridge__filter_replacement',
      'filter_/_cartridge__cartridge_question',
      'filter_/_cartridge__filter_lifespan',
      'filter_/_cartridge__subscription_filter_issue',
    ],
  },
  {
    value: 'Water quality / Performance',
    catKey: 'water_quality',
    subs: [
      'water_quality_/_performance__water_taste_issue',
      'water_quality_/_performance__water_flow_too_low',
      'water_quality_/_performance__filter_performance_concern',
      'water_quality_/_performance__water_test_concern',
      'water_quality_/_performance__water_still_not_drinkable',
      'water_quality_/_performance__product_efficiency_question',
    ],
  },
  {
    value: 'Refund / Return',
    catKey: 'refund_return',
    subs: [
      'refund_/_return__refund_request',
      'refund_/_return__full_refund',
      'refund_/_return__partial_refund',
      'refund_/_return__return_request',
      'refund_/_return__exchange_request',
      'refund_/_return__cancellation_before_shipment',
      'refund_/_return__cancellation_after_shipment',
      'refund_/_return__commercial_gesture_request',
    ],
  },
  {
    value: 'Subscription / Billing',
    catKey: 'subscription_billing',
    subs: [
      'subscription_/_billing__subscription_cancellation',
      'subscription_/_billing__subscription_modification',
      'subscription_/_billing__duplicate_charge',
      'subscription_/_billing__billing_issue',
      'subscription_/_billing__payment_failed',
      'subscription_/_billing__renewal_question',
    ],
  },
  {
    value: 'Complaint / Escalation',
    catKey: 'complaint_escalation',
    subs: [
      'complaint_/_escalation__delay_complaint',
      'complaint_/_escalation__product_complaint',
      'complaint_/_escalation__service_complaint',
      'complaint_/_escalation__no_response_complaint',
      'complaint_/_escalation__repeated_contact',
      'complaint_/_escalation__escalation_request',
    ],
  },
  {
    value: 'Other',
    catKey: 'other',
    subs: ['other__other'],
  },
]

// Libellé traduit d'une sous-catégorie (accès direct : les valeurs
// contiennent des '/' incompatibles avec keySeparator).
const subLabel = (value: string): string => {
  const table =
    (i18n.getResource(i18n.language, 'support', 'sub') as Record<string, string> | undefined) ??
    (i18n.getResource('fr', 'support', 'sub') as Record<string, string> | undefined)
  return table?.[value] ?? value
}

// ─── Icônes ────────────────────────────────────────────────

function ChevronDown({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="m6 9 6 6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="m5 13 4 4L19 7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

// ─── Bottom sheet de sélection ─────────────────────────────

interface SelectSheetProps {
  visible: boolean
  title: string
  options: { label: string; value: string }[]
  selectedValue: string | null
  onSelect: (value: string) => void
  onClose: () => void
}

function SelectSheet({ visible, title, options, selectedValue, onSelect, onClose }: SelectSheetProps) {
  const insets = useSafeAreaInsets()
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + theme.spacing[6], transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {options.map(opt => {
              const isSelected = opt.value === selectedValue
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.sheetOption, isSelected && styles.sheetOptionActive]}
                  onPress={() => { onSelect(opt.value); onClose() }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sheetOptionText, isSelected && styles.sheetOptionTextActive]}>
                    {opt.label}
                  </Text>
                  {isSelected && <CheckIcon color={theme.colors.blue} />}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

// ─── Écran ─────────────────────────────────────────────────

export default function SupportScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()
  // Catégorie éventuellement pré-sélectionnée via la navigation (ex: depuis Commandes)
  const params = useLocalSearchParams<{ category?: string }>()

  const [email, setEmail] = useState('')
  const [groupValue, setGroupValue] = useState<string | null>(null)
  const [subValue, setSubValue] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [groupSheetOpen, setGroupSheetOpen] = useState(false)
  const [subSheetOpen, setSubSheetOpen] = useState(false)

  // Pré-remplit l'email du client connecté
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email)
    })
  }, [])

  // Pré-sélectionne la catégorie passée en paramètre de navigation
  useEffect(() => {
    if (params.category && CATEGORIES.some(c => c.value === params.category)) {
      setGroupValue(params.category)
      setSubValue(null)
    }
  }, [params.category])

  const selectedGroup = CATEGORIES.find(c => c.value === groupValue) ?? null
  const selectedSubValue = selectedGroup?.subs.find(s => s === subValue) ?? null

  const handleSelectGroup = (value: string) => {
    setGroupValue(value)
    setSubValue(null) // reset la sous-catégorie comme sur le site
    setFeedback(null)
  }

  const handleSubmit = async () => {
    setFeedback(null)

    // Validation — identique au site
    if (!email.trim() || !groupValue || !subValue || !message.trim()) {
      setFeedback({ text: t('support:errorFillAll'), type: 'error' })
      return
    }
    if (message.trim().length < 10) {
      setFeedback({ text: t('support:errorMinLength'), type: 'error' })
      return
    }

    setSending(true)

    // Sujet — même format que le site : valeur groupe + libellé sous-catégorie.
    // On garde le libellé FR pour que le routing/lecture Zendesk reste stable.
    const frSub = (i18n.getResource('fr', 'support', 'sub') as Record<string, string>)?.[subValue!] ?? subValue
    const subjectLabel = `${groupValue} — ${frSub}`
    const payload = {
      email: email.trim(),
      category: subValue,
      subject: `Contact via app — ${subjectLabel}`,
      message: message.trim(),
    }

    try {
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.status === 201) {
        setGroupValue(null)
        setSubValue(null)
        setMessage('')
        setFeedback({ text: t('support:successBody'), type: 'success' })
        showToast(t('support:sent'), 'success')
      } else {
        setFeedback({ text: t('support:errorGeneric'), type: 'error' })
        showToast(t('support:sendError'), 'error')
      }
    } catch {
      setFeedback({ text: t('support:errorGeneric'), type: 'error' })
      showToast(t('support:sendError'), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + theme.spacing[5], paddingHorizontal: theme.spacing[2] }}>
          <Text style={styles.pageTitle}>{t('support:pageTitle')}</Text>
        </View>

        {/* Intro */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{t('support:heroTitle')}</Text>
          <Text style={styles.heroIntro}>{t('support:heroIntro')}</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            activeOpacity={0.7}
          >
            <Text style={styles.heroEmail}>
              {t('support:heroEmailPrefix')}
              <Text style={styles.heroEmailLink}>{SUPPORT_EMAIL}</Text>
            </Text>
          </TouchableOpacity>
          <View style={styles.heroDivider} />
        </View>

        {/* Card formulaire */}
        <View style={styles.card}>

          {/* Email */}
          <Text style={styles.fieldLabel}>{t('support:fieldEmail')}</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder={t('support:emailPlaceholder')}
            placeholderTextColor={theme.colors.textXLight}
            value={email}
            onChangeText={(v) => { setEmail(v); setFeedback(null) }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Catégorie */}
          <Text style={styles.fieldLabel}>{t('support:fieldCategory')}</Text>
          <TouchableOpacity
            style={styles.selectField}
            onPress={() => setGroupSheetOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={selectedGroup ? styles.selectValue : styles.selectPlaceholder}>
              {selectedGroup ? t(`support:cat.${selectedGroup.catKey}`) : t('support:chooseCategory')}
            </Text>
            <ChevronDown color={theme.colors.textLight} />
          </TouchableOpacity>

          {/* Sous-catégorie — apparaît après le choix de la catégorie */}
          {selectedGroup && (
            <>
              <Text style={styles.fieldLabel}>{t('support:fieldSubCategory')}</Text>
              <TouchableOpacity
                style={styles.selectField}
                onPress={() => setSubSheetOpen(true)}
                activeOpacity={0.7}
              >
                <Text style={selectedSubValue ? styles.selectValue : styles.selectPlaceholder}>
                  {selectedSubValue ? subLabel(selectedSubValue) : t('support:chooseSubCategory')}
                </Text>
                <ChevronDown color={theme.colors.textLight} />
              </TouchableOpacity>
            </>
          )}

          {/* Message */}
          <Text style={styles.fieldLabel}>{t('support:fieldMessage')}</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldTextarea]}
            placeholder={t('support:messagePlaceholder')}
            placeholderTextColor={theme.colors.textXLight}
            value={message}
            onChangeText={(v) => { setMessage(v); setFeedback(null) }}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          {/* Feedback */}
          {feedback && (
            <View style={[
              styles.feedback,
              feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
            ]}>
              <Text style={[
                styles.feedbackText,
                { color: feedback.type === 'success' ? theme.colors.success : theme.colors.error },
              ]}>
                {feedback.text}
              </Text>
            </View>
          )}

          {/* Envoyer */}
          <TouchableOpacity
            style={[styles.submitBtn, sending && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={sending}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator color={theme.colors.white} size="small" />
              : <Text style={styles.submitBtnText}>{t('support:send')}</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.footerBrand}>
          <Logo width={92} color={theme.colors.navy} />
          <Text style={styles.signature}>{t('support:signature')}</Text>
        </View>

        {/* Liens légaux — requis par l'App Store et Google Play */}
        <View style={styles.legalRow}>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://puurefilters.com/policies/privacy-policy')}
            accessibilityRole="link"
            accessibilityLabel={t('support:privacyPolicy')}
          >
            <Text style={styles.legalLink}>{t('support:privacyPolicy')}</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>·</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://puurefilters.com/policies/terms-of-service')}
            accessibilityRole="link"
            accessibilityLabel={t('support:termsOfService')}
          >
            <Text style={styles.legalLink}>{t('support:termsOfService')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sheets de sélection */}
      <SelectSheet
        visible={groupSheetOpen}
        title={t('support:sheetCategory')}
        options={CATEGORIES.map(c => ({ label: t(`support:cat.${c.catKey}`), value: c.value }))}
        selectedValue={groupValue}
        onSelect={handleSelectGroup}
        onClose={() => setGroupSheetOpen(false)}
      />
      <SelectSheet
        visible={subSheetOpen}
        title={t('support:sheetSubCategory')}
        options={(selectedGroup?.subs ?? []).map(v => ({ label: subLabel(v), value: v }))}
        selectedValue={subValue}
        onSelect={(v) => { setSubValue(v); setFeedback(null) }}
        onClose={() => setSubSheetOpen(false)}
      />
    </KeyboardAvoidingView>
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
  },
  pageTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size['3xl'],
    color: theme.colors.navy,
    letterSpacing: -0.5,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: theme.spacing[5],
    paddingHorizontal: theme.spacing[2],
  },
  heroTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.xl,
    color: theme.colors.navy,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  heroIntro: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base - 1,
    color: theme.colors.textMid,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: theme.spacing[3],
  },
  heroEmail: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    textAlign: 'center',
    marginTop: theme.spacing[4],
  },
  heroEmailLink: {
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.blue,
    textDecorationLine: 'underline',
  },
  heroDivider: {
    width: 48,
    height: 3,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.blue,
    opacity: 0.35,
    marginTop: theme.spacing[5],
    marginBottom: theme.spacing[5],
  },

  // Card
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[6],
    ...theme.shadows.card,
  },
  fieldLabel: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textLight,
    letterSpacing: 1,
    marginBottom: theme.spacing[2],
  },
  fieldInput: {
    minHeight: 50,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
    marginBottom: theme.spacing[4],
  },
  fieldTextarea: {
    height: 120,
    paddingTop: theme.spacing[3],
  },
  selectField: {
    height: 50,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[4],
  },
  selectValue: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  selectPlaceholder: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base,
    color: theme.colors.textXLight,
    flex: 1,
    marginRight: theme.spacing[2],
  },

  // Feedback
  feedback: {
    borderRadius: theme.radius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  feedbackSuccess: {
    backgroundColor: 'rgba(30,187,110,0.12)',
  },
  feedbackError: {
    backgroundColor: 'rgba(227,44,43,0.10)',
  },
  feedbackText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.sm,
    lineHeight: 19,
  },

  // Submit
  submitBtn: {
    height: 52,
    backgroundColor: theme.colors.lime,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.white,
  },

  footerBrand: {
    alignItems: 'center',
    marginTop: theme.spacing[5],
    opacity: 0.75,
  },
  signature: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: theme.spacing[2],
    opacity: 0.7,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  legalLink: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textLight,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: theme.colors.textLight,
    fontSize: theme.typography.size.xs,
  },

  // Sheet
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
    fontSize: theme.typography.size.xl,
    color: theme.colors.navy,
    marginBottom: theme.spacing[4],
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing[2],
  },
  sheetOptionActive: {
    backgroundColor: theme.colors.bluePale,
  },
  sheetOptionText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: theme.colors.textMid,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  sheetOptionTextActive: {
    fontFamily: theme.typography.fontFamily.semiBold,
    color: theme.colors.blue,
  },
})
