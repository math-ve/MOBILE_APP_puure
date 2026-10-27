import { useEffect, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import { ds, typography } from '../../lib/theme'
import Logo from '../../components/ui/Logo'
import PillButton from '../../components/ds/PillButton'

export const NOTIF_INTRO_SEEN_KEY = 'notifications_intro_seen'
const EAS_PROJECT_ID = 'c1ed5ce2-a996-401f-a527-1f1705efef9e'

// Activation des notifications au premier login (maquette P03).

const LOGO_WIDTH = 26 * 341.1 / 96.8

export default function NotificationsIntroScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(false)

  // Bénéfices affichés — centrés sur l'utilité concrète des rappels
  const BENEFITS = [
    {
      icon: <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z" {...ICON} /></Svg>,
      title: t('auth:notifBenefit1Title'), text: t('auth:notifBenefit1Text'),
    },
    {
      icon: <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M21 12a9 9 0 1 1-3-6.7L21 8" {...ICON} /><Path d="M21 3v5h-5" {...ICON} /></Svg>,
      title: t('auth:notifBenefit2Title'), text: t('auth:notifBenefit2Text'),
    },
    {
      icon: <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M3 6h11v10H3z" {...ICON} /><Path d="M14 9h4l3 3v4h-7" {...ICON} /><Circle cx={7} cy={18} r={2} {...ICON} /><Circle cx={17} cy={18} r={2} {...ICON} /></Svg>,
      title: t('auth:notifBenefit3Title'), text: t('auth:notifBenefit3Text'),
    },
  ]

  useEffect(() => {
    track('notif_intro_shown')
  }, [])

  const skip = async () => {
    track('notif_intro_skipped')
    await finish()
  }

  const finish = async () => {
    await AsyncStorage.setItem(NOTIF_INTRO_SEEN_KEY, 'true')
    router.replace('/(tabs)')
  }

  const enableNotifications = async () => {
    setLoading(true)
    try {
      if (Device.isDevice) {
        const { status: existing } = await Notifications.getPermissionsAsync()
        let finalStatus = existing
        if (existing !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync()
          finalStatus = status
        }
        track('notif_intro_result', { status: finalStatus })
        // Si accordée, on enregistre le token tout de suite
        if (finalStatus === 'granted') {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const token = (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data
            await supabase.from('profiles').update({ push_token: token }).eq('id', user.id)
          }
        }
      }
    } catch {
      // Échec silencieux (Expo Go, etc.) — ne bloque pas l'entrée dans l'app
    } finally {
      await finish()
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}>
      <Logo width={LOGO_WIDTH} />
      <Text style={styles.title} accessibilityRole="header">{t('auth:notifTitle')}</Text>
      <Text style={styles.subtitle}>{t('auth:notifSubtitle')}</Text>

      <View style={styles.list}>
        {BENEFITS.map((b, i) => (
          <View key={b.title} style={[styles.item, i === BENEFITS.length - 1 && styles.itemLast]}>
            <View style={{ marginTop: 2 }}>{b.icon}</View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.itemTitle}>{b.title}</Text>
              <Text style={styles.itemText}>{b.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ gap: 4 }}>
        <PillButton label={t('auth:notifEnable')} loading={loading} onPress={enableNotifications} />
        <PillButton variant="quiet" label={t('auth:notifLater')} onPress={skip} disabled={loading} />
      </View>
    </View>
  )
}

const ICON = { stroke: ds.blue, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 28, gap: 22 },
  title: { fontFamily: typography.fontFamily.medium, fontSize: 38, lineHeight: 43, letterSpacing: -0.76, color: ds.ink },
  subtitle: { fontFamily: typography.fontFamily.regular, fontSize: 17, lineHeight: 25, color: ds.body },
  list: { marginTop: 12 },
  item: { flexDirection: 'row', gap: 14, paddingVertical: 18, borderTopWidth: 1, borderTopColor: ds.line },
  itemLast: { borderBottomWidth: 1, borderBottomColor: ds.line },
  itemTitle: { fontFamily: typography.fontFamily.medium, fontSize: 16, color: ds.ink },
  itemText: { fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: ds.body },
})
