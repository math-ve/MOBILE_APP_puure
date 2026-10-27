import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import AppHeader from '../../components/ds/AppHeader'
import PillButton from '../../components/ds/PillButton'
import RadioRow from '../../components/ds/RadioRow'
import { Field, FieldLabel, GroupCard } from '../../components/ds/Field'
import { TAB_BAR_SPACE } from '../../components/ui/TabBar'
import { supabase } from '../../lib/supabase'
import { sendSupportTicket, SUPPORT_EMAIL } from '../../lib/support'
import { ds, typography } from '../../lib/theme'

// Support (maquette P12) : catégorie, e-mail, message → ticket Zendesk.
// Chaque catégorie part avec une sous-catégorie générique pour le routage
// Zendesk (le formulaire du site en demande une) ; l'agent lit le message.

type Category = { group: string; key: string; category: string }

const CATEGORIES: Category[] = [
  { group: 'Order / Delivery', key: 'order_delivery', category: 'order_/_delivery__tracking_issue' },
  { group: 'Adapter / Compatibility', key: 'adapter_compatibility', category: 'adapter_/_compatibility__wrong_adapter_needed' },
  { group: 'Installation / Setup', key: 'installation_setup', category: 'installation_/_setup__installation_help' },
  { group: 'Product issue', key: 'product_issue', category: 'product_issue__product_not_working' },
  { group: 'Filter / Cartridge', key: 'filter_cartridge', category: 'filter_/_cartridge__cartridge_question' },
  { group: 'Water quality / Performance', key: 'water_quality', category: 'water_quality_/_performance__product_efficiency_question' },
  { group: 'Refund / Return', key: 'refund_return', category: 'refund_/_return__refund_request' },
]

export default function SupportScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  // Catégorie pré-sélectionnée par la navigation (valeur de groupe Zendesk).
  const params = useLocalSearchParams<{ category?: string }>()

  const [email, setEmail] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session?.user?.email) setEmail(data.session.user.email) })
  }, [])

  useEffect(() => {
    const found = CATEGORIES.find((c) => c.group === params.category)
    if (found) setCategory(found)
  }, [params.category])

  const send = async () => {
    setError(null)
    if (!category) return setError(t('support:needCategory'))
    if (!email.trim()) return setError(t('support:needEmail'))
    if (message.trim().length < 10) return setError(t('support:errorMinLength'))
    setSending(true)
    try {
      const replyTo = await sendSupportTicket({ group: category.group, category: category.category, message, email, source: 'support' })
      setCategory(null)
      setMessage('')
      router.push({ pathname: '/done', params: { kind: 'sent', email: replyTo } })
    } catch {
      setError(t('support:errorGeneric'))
    } finally {
      setSending(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader />

        <View style={styles.head}>
          <Text style={styles.h1} accessibilityRole="header">{t('support:pageTitle')}</Text>
          <Text style={styles.intro}>{t('support:introDs')}</Text>
        </View>

        <View style={{ gap: 10 }}>
          <FieldLabel>{t('support:categoryDs')}</FieldLabel>
          <GroupCard>
            {CATEGORIES.map((c, i) => (
              <RadioRow
                key={c.key}
                label={t(`support:cat.${c.key}`)}
                selected={category?.key === c.key}
                onPress={() => { setCategory(c); setError(null) }}
                last={i === CATEGORIES.length - 1}
              />
            ))}
          </GroupCard>
        </View>

        <Field
          label={t('support:emailDs')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
        />

        <Field
          label={t('support:messageDs')}
          value={message}
          onChangeText={setMessage}
          placeholder={t('support:messagePlaceholderDs')}
          multiline
          multilineHeight={128}
          maxLength={2000}
        />

        <View style={{ gap: 14 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PillButton label={t('support:send')} loading={sending} onPress={send} />
          <Text style={styles.mail}>
            {t('support:writeUs')}
            <Text style={styles.mailLink} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} accessibilityRole="link">
              {SUPPORT_EMAIL}
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },
  content: { paddingHorizontal: 20, gap: 20 },
  head: { alignItems: 'center', gap: 6, paddingTop: 12 },
  h1: { fontFamily: typography.fontFamily.medium, fontSize: 20, lineHeight: 25, color: ds.ink, textAlign: 'center' },
  intro: { fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: ds.muted, textAlign: 'center' },
  error: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center' },
  mail: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.muted, textAlign: 'center' },
  mailLink: { color: ds.blue, textDecorationLine: 'underline' },
})
