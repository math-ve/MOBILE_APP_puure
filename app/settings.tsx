import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Constants from 'expo-constants'
import Svg, { Path } from 'react-native-svg'
import { supabase } from '../lib/supabase'
import theme from '../lib/theme'
import {
  SUPPORTED_LANGUAGES,
  type Language,
  setLanguage,
  useDeviceLanguage,
  hasManualLanguage,
  getDeviceLanguage,
} from '../lib/i18n'

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="m5 13 4 4L19 7" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

const APP_VERSION = Constants.expoConfig?.version ?? '—'

export default function SettingsScreen() {
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
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
  }

  const pickAuto = async () => {
    await useDeviceLanguage(persist)
    setManual(false)
  }

  const handleSignOut = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('profiles').update({ push_token: null }).eq('id', user.id)
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  const currentLang = i18n.language as Language

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing[2] }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backText}>{t('tracking:back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings:title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Langue */}
        <Text style={styles.sectionCaps}>{t('settings:language').toUpperCase()}</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={pickAuto} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t('settings:languageAuto')}</Text>
              <Text style={styles.rowHint}>
                {t('settings:languageAutoHint', { language: t(`settings:${getDeviceLanguage()}`) })}
              </Text>
            </View>
            {!manual && <CheckIcon color={theme.colors.blue} />}
          </TouchableOpacity>

          <View style={styles.divider} />

          {SUPPORTED_LANGUAGES.map((lang, i) => (
            <View key={lang}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity style={styles.row} onPress={() => pickLanguage(lang)} activeOpacity={0.7}>
                <Text style={styles.rowLabel}>{t(`settings:${lang}`)}</Text>
                {manual && currentLang === lang && <CheckIcon color={theme.colors.blue} />}
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* À propos */}
        <Text style={styles.sectionCaps}>{t('settings:about').toUpperCase()}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('settings:version')}</Text>
            <Text style={styles.rowValue}>{APP_VERSION}</Text>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL('https://puurefilters.com/policies/privacy-policy')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>{t('settings:privacyPolicy')}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.row}
            onPress={() => Linking.openURL('https://puurefilters.com/policies/terms-of-service')}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabel}>{t('settings:termsOfService')}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Déconnexion */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>{t('settings:signOut')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[3],
  },
  backBtn: { minWidth: 80 },
  backText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: theme.colors.blue,
  },
  headerTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.lg - 1,
    color: theme.colors.navy,
    textAlign: 'center',
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  sectionCaps: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textLight,
    letterSpacing: 1.2,
    marginBottom: theme.spacing[3],
    marginTop: theme.spacing[4],
  },
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    ...theme.shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[5],
    gap: theme.spacing[3],
  },
  rowLabel: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: theme.colors.navy,
  },
  rowHint: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textLight,
    marginTop: 2,
  },
  rowValue: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base,
    color: theme.colors.textLight,
  },
  chevron: {
    fontSize: 22,
    color: theme.colors.textXLight,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: theme.spacing[5],
  },
  signOutBtn: {
    marginTop: theme.spacing[8],
    alignItems: 'center',
    paddingVertical: theme.spacing[3],
  },
  signOutText: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: theme.colors.error,
  },
})
