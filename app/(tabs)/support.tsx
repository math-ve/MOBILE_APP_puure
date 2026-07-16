import { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Linking, Animated, Easing, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { supabase } from '../../lib/supabase'
import theme from '../../lib/theme'
import { useToast } from '../../hooks/useToast'
import Logo from '../../components/ui/Logo'

// Worker Cloudflare qui crée le ticket Zendesk — même endpoint que le site
const WORKER_URL = 'https://lively-sound-95c2.mathieu-vaneynde.workers.dev/'
const SUPPORT_EMAIL = 'customercare@puurefilters.com'

// ─── Catégories — valeurs machine identiques au site (routing Zendesk) ───

interface SubCategory { label: string; value: string }
interface Category { value: string; label: string; subs: SubCategory[] }

const CATEGORIES: Category[] = [
  {
    value: 'Order / Delivery',
    label: 'Commande / Livraison',
    subs: [
      { label: 'Commande non reçue', value: 'order_/_delivery__order_not_received' },
      { label: 'Livraison retardée', value: 'order_/_delivery__delivery_delayed' },
      { label: 'Problème de suivi', value: 'order_/_delivery__tracking_issue' },
      { label: 'Mauvais article reçu', value: 'order_/_delivery__wrong_item_received' },
      { label: 'Article manquant', value: 'order_/_delivery__missing_item' },
      { label: 'Livraison partielle', value: 'order_/_delivery__partial_delivery' },
      { label: "Problème d'adresse", value: 'order_/_delivery__address_issue' },
    ],
  },
  {
    value: 'Adapter / Compatibility',
    label: 'Adaptateur / Compatibilité',
    subs: [
      { label: 'Mauvais adaptateur', value: 'adapter_/_compatibility__wrong_adapter_needed' },
      { label: 'Adaptateur manquant', value: 'adapter_/_compatibility__adapter_missing' },
      { label: 'Robinet non compatible', value: 'adapter_/_compatibility__faucet_not_compatible' },
      { label: 'Problème de filetage', value: 'adapter_/_compatibility__thread_size_issue' },
      { label: 'Problème de mesure', value: 'adapter_/_compatibility__measurement_issue' },
      { label: 'Suivi commande adaptateur', value: 'adapter_/_compatibility__adapter_order_follow-up' },
    ],
  },
  {
    value: 'Installation / Setup',
    label: 'Installation / Montage',
    subs: [
      { label: "Aide à l'installation", value: 'installation_/_setup__installation_help' },
      { label: 'Instructions de montage', value: 'installation_/_setup__setup_instructions' },
      { label: 'Impossible de fixer le filtre', value: 'installation_/_setup__cannot_attach_filter' },
      { label: 'Fuite après installation', value: 'installation_/_setup__leak_after_installation' },
      { label: 'Mauvais assemblage', value: 'installation_/_setup__wrong_assembly' },
      { label: 'Robinet qui goutte après montage', value: 'installation_/_setup__tap_dripping_after_setup' },
    ],
  },
  {
    value: 'Product issue',
    label: 'Problème produit',
    subs: [
      { label: 'Produit défectueux', value: 'product_issue__defective_product' },
      { label: 'Endommagé à la réception', value: 'product_issue__damaged_on_arrival' },
      { label: 'Produit ne fonctionne pas', value: 'product_issue__product_not_working' },
      { label: 'Pièce cassée', value: 'product_issue__broken_part' },
      { label: 'Problème couvercle inox', value: 'product_issue__stainless_steel_cover_issue' },
      { label: 'Goutte / fuite', value: 'product_issue__dripping_/_leakage' },
      { label: 'Connexion fragile', value: 'product_issue__weak_connection' },
    ],
  },
  {
    value: 'Filter / Cartridge',
    label: 'Filtre / Cartouche',
    subs: [
      { label: 'Filtre manquant', value: 'filter_/_cartridge__missing_filter' },
      { label: 'Mauvais filtre reçu', value: 'filter_/_cartridge__wrong_filter_received' },
      { label: 'Remplacement de filtre', value: 'filter_/_cartridge__filter_replacement' },
      { label: 'Question cartouche', value: 'filter_/_cartridge__cartridge_question' },
      { label: 'Durée de vie du filtre', value: 'filter_/_cartridge__filter_lifespan' },
      { label: 'Problème filtre abonnement', value: 'filter_/_cartridge__subscription_filter_issue' },
    ],
  },
  {
    value: 'Water quality / Performance',
    label: "Qualité de l'eau / Performance",
    subs: [
      { label: "Goût de l'eau", value: 'water_quality_/_performance__water_taste_issue' },
      { label: 'Débit trop faible', value: 'water_quality_/_performance__water_flow_too_low' },
      { label: 'Performance du filtre', value: 'water_quality_/_performance__filter_performance_concern' },
      { label: "Inquiétude test d'eau", value: 'water_quality_/_performance__water_test_concern' },
      { label: 'Eau toujours non potable', value: 'water_quality_/_performance__water_still_not_drinkable' },
      { label: 'Question efficacité produit', value: 'water_quality_/_performance__product_efficiency_question' },
    ],
  },
  {
    value: 'Refund / Return',
    label: 'Remboursement / Retour',
    subs: [
      { label: 'Demande de remboursement', value: 'refund_/_return__refund_request' },
      { label: 'Remboursement total', value: 'refund_/_return__full_refund' },
      { label: 'Remboursement partiel', value: 'refund_/_return__partial_refund' },
      { label: 'Demande de retour', value: 'refund_/_return__return_request' },
      { label: "Demande d'échange", value: 'refund_/_return__exchange_request' },
      { label: 'Annulation avant expédition', value: 'refund_/_return__cancellation_before_shipment' },
      { label: 'Annulation après expédition', value: 'refund_/_return__cancellation_after_shipment' },
      { label: 'Demande de geste commercial', value: 'refund_/_return__commercial_gesture_request' },
    ],
  },
  {
    value: 'Subscription / Billing',
    label: 'Abonnement / Facturation',
    subs: [
      { label: "Annulation d'abonnement", value: 'subscription_/_billing__subscription_cancellation' },
      { label: "Modification d'abonnement", value: 'subscription_/_billing__subscription_modification' },
      { label: 'Double prélèvement', value: 'subscription_/_billing__duplicate_charge' },
      { label: 'Problème de facturation', value: 'subscription_/_billing__billing_issue' },
      { label: 'Paiement échoué', value: 'subscription_/_billing__payment_failed' },
      { label: 'Question renouvellement', value: 'subscription_/_billing__renewal_question' },
    ],
  },
  {
    value: 'Complaint / Escalation',
    label: 'Réclamation / Escalade',
    subs: [
      { label: 'Réclamation délai', value: 'complaint_/_escalation__delay_complaint' },
      { label: 'Réclamation produit', value: 'complaint_/_escalation__product_complaint' },
      { label: 'Réclamation service', value: 'complaint_/_escalation__service_complaint' },
      { label: 'Absence de réponse', value: 'complaint_/_escalation__no_response_complaint' },
      { label: 'Contacts répétés', value: 'complaint_/_escalation__repeated_contact' },
      { label: "Demande d'escalade", value: 'complaint_/_escalation__escalation_request' },
    ],
  },
  {
    value: 'Other',
    label: 'Autre',
    subs: [
      { label: 'Autre', value: 'other__other' },
    ],
  },
]

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
  const insets = useSafeAreaInsets()
  const { showToast } = useToast()

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

  const selectedGroup = CATEGORIES.find(c => c.value === groupValue) ?? null
  const selectedSub = selectedGroup?.subs.find(s => s.value === subValue) ?? null

  const handleSelectGroup = (value: string) => {
    setGroupValue(value)
    setSubValue(null) // reset la sous-catégorie comme sur le site
    setFeedback(null)
  }

  const handleSubmit = async () => {
    setFeedback(null)

    // Validation — identique au site
    if (!email.trim() || !groupValue || !subValue || !message.trim()) {
      setFeedback({ text: 'Veuillez remplir tous les champs.', type: 'error' })
      return
    }
    if (message.trim().length < 10) {
      setFeedback({ text: 'Votre message doit contenir au moins 10 caractères.', type: 'error' })
      return
    }

    setSending(true)

    // Sujet — même format que le site : valeur groupe + libellé sous-catégorie
    const subjectLabel = `${groupValue} — ${selectedSub!.label}`
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
        setFeedback({ text: 'Votre demande a bien été envoyée. Nous reviendrons vers vous rapidement.', type: 'success' })
        showToast('Demande envoyée ✓', 'success')
      } else {
        setFeedback({ text: 'Une erreur est survenue. Réessayez ou contactez-nous directement.', type: 'error' })
        showToast('Erreur lors de l\'envoi', 'error')
      }
    } catch {
      setFeedback({ text: 'Une erreur est survenue. Réessayez ou contactez-nous directement.', type: 'error' })
      showToast('Erreur lors de l\'envoi', 'error')
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
          <Text style={styles.pageTitle}>Support</Text>
        </View>

        {/* Intro */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Nous sommes là pour vous aider</Text>
          <Text style={styles.heroIntro}>
            Une question ou besoin d'assistance ? Remplissez le formulaire ci-dessous
            et nous reviendrons vers vous au plus vite.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            activeOpacity={0.7}
          >
            <Text style={styles.heroEmail}>
              Ou contactez-nous directement :{' '}
              <Text style={styles.heroEmailLink}>{SUPPORT_EMAIL}</Text>
            </Text>
          </TouchableOpacity>
          <View style={styles.heroDivider} />
        </View>

        {/* Card formulaire */}
        <View style={styles.card}>

          {/* Email */}
          <Text style={styles.fieldLabel}>VOTRE ADRESSE EMAIL</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="votre@email.com"
            placeholderTextColor={theme.colors.textXLight}
            value={email}
            onChangeText={(t) => { setEmail(t); setFeedback(null) }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Catégorie */}
          <Text style={styles.fieldLabel}>CATÉGORIE</Text>
          <TouchableOpacity
            style={styles.selectField}
            onPress={() => setGroupSheetOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={selectedGroup ? styles.selectValue : styles.selectPlaceholder}>
              {selectedGroup?.label ?? 'Choisir une catégorie'}
            </Text>
            <ChevronDown color={theme.colors.textLight} />
          </TouchableOpacity>

          {/* Sous-catégorie — apparaît après le choix de la catégorie */}
          {selectedGroup && (
            <>
              <Text style={styles.fieldLabel}>SOUS-CATÉGORIE</Text>
              <TouchableOpacity
                style={styles.selectField}
                onPress={() => setSubSheetOpen(true)}
                activeOpacity={0.7}
              >
                <Text style={selectedSub ? styles.selectValue : styles.selectPlaceholder}>
                  {selectedSub?.label ?? 'Choisir une sous-catégorie'}
                </Text>
                <ChevronDown color={theme.colors.textLight} />
              </TouchableOpacity>
            </>
          )}

          {/* Message */}
          <Text style={styles.fieldLabel}>VOTRE MESSAGE</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldTextarea]}
            placeholder="Décrivez votre demande..."
            placeholderTextColor={theme.colors.textXLight}
            value={message}
            onChangeText={(t) => { setMessage(t); setFeedback(null) }}
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
              : <Text style={styles.submitBtnText}>Envoyer la demande</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.footerBrand}>
          <Logo width={92} color={theme.colors.navy} />
          <Text style={styles.signature}>– L'équipe Puure</Text>
        </View>

        {/* Liens légaux — requis par l'App Store et Google Play */}
        <View style={styles.legalRow}>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://puurefilters.com/policies/privacy-policy')}
            accessibilityRole="link"
            accessibilityLabel="Politique de confidentialité"
          >
            <Text style={styles.legalLink}>Politique de confidentialité</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>·</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://puurefilters.com/policies/terms-of-service')}
            accessibilityRole="link"
            accessibilityLabel="Conditions d'utilisation"
          >
            <Text style={styles.legalLink}>Conditions d'utilisation</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sheets de sélection */}
      <SelectSheet
        visible={groupSheetOpen}
        title="Catégorie"
        options={CATEGORIES.map(c => ({ label: c.label, value: c.value }))}
        selectedValue={groupValue}
        onSelect={handleSelectGroup}
        onClose={() => setGroupSheetOpen(false)}
      />
      <SelectSheet
        visible={subSheetOpen}
        title="Sous-catégorie"
        options={selectedGroup?.subs ?? []}
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
