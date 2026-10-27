import { useEffect, useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import { FlowScreen } from '../components/ds/Flow'
import RadioRow from '../components/ds/RadioRow'
import PillButton from '../components/ds/PillButton'
import { FieldLabel, GroupCard } from '../components/ds/Field'
import { supabase } from '../lib/supabase'
import * as analytics from '../lib/analytics'
import {
  SUPPORTED_LANGUAGES,
  type Language,
  setLanguage,
  useDeviceLanguage,
  hasManualLanguage,
  getDeviceLanguage,
} from '../lib/i18n'

// Réglages (maquette P13) : langue, à propos, déconnexion.

const APP_VERSION = Constants.expoConfig?.version ?? '—'

export default function SettingsScreen() {
  const { t, i18n } = useTranslation()
  const [manual, setManual] = useState(true)

  useEffect(() => {
    hasManualLanguage().then(setManual)
  }, [])

  // Répercute le choix dans profiles.language (utilisé par les notifications push).
  const persist = async (lang: Language) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('profiles').update({ language: lang }).eq('id', user.id)
    } catch {
      // non bloquant
    }
  }

  const pickLanguage = async (lang: Language) => {
    await setLanguage(lang, persist)
    setManual(true)
    analytics.track('language_changed', { language: lang, mode: 'manual' })
  }

  const pickAuto = async () => {
    await useDeviceLanguage(persist)
    setManual(false)
    analytics.track('language_changed', { mode: 'auto' })
  }

  const handleSignOut = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('profiles').update({ push_token: null }).eq('id', user.id)
    analytics.track('sign_out')
    await analytics.reset()
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  const currentLang = i18n.language as Language
  // « Langue du téléphone : français » : minuscule en français (les autres noms restent natifs).
  const deviceName = t(`settings:${getDeviceLanguage()}`)
  const deviceLanguageName = currentLang === 'fr' && getDeviceLanguage() === 'fr' ? 'français' : deviceName

  return (
    <FlowScreen title={t('settings:title')} onBack={() => router.back()}>
      <View style={styles.section}>
        <FieldLabel>{t('settings:language')}</FieldLabel>
        <GroupCard>
          <RadioRow
            label={t('settings:languageAuto')}
            hint={t('settings:languageAutoHint', { language: deviceLanguageName })}
            selected={!manual}
            onPress={pickAuto}
          />
          {SUPPORTED_LANGUAGES.map((lang, i) => (
            <RadioRow
              key={lang}
              label={t(`settings:${lang}`)}
              selected={manual && currentLang === lang}
              onPress={() => pickLanguage(lang)}
              last={i === SUPPORTED_LANGUAGES.length - 1}
            />
          ))}
        </GroupCard>
      </View>

      <View style={styles.section}>
        <FieldLabel>{t('settings:about')}</FieldLabel>
        <GroupCard>
          <RadioRow label={t('settings:version')} value={APP_VERSION} />
          <RadioRow chevron label={t('settings:privacyPolicy')} onPress={() => Linking.openURL('https://puurefilters.com/policies/privacy-policy')} />
          <RadioRow chevron last label={t('settings:termsOfService')} onPress={() => Linking.openURL('https://puurefilters.com/policies/terms-of-service')} />
        </GroupCard>
      </View>

      <PillButton variant="secondary" label={t('settings:signOut')} onPress={handleSignOut} />
    </FlowScreen>
  )
}

const styles = StyleSheet.create({
  section: { gap: 10 },
})
