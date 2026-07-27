import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import theme from '../../lib/theme'
import Logo from '../../components/ui/Logo'

export const NOTIF_INTRO_SEEN_KEY = 'notifications_intro_seen'
const EAS_PROJECT_ID = 'c1ed5ce2-a996-401f-a527-1f1705efef9e'

// Bénéfices affichés — centrés sur l'utilité concrète des rappels
const BENEFITS = [
  { icon: '💧', title: 'Rappel de cartouche', text: 'Sachez exactement quand remplacer votre cartouche, ni trop tôt ni trop tard.' },
  { icon: '🔄', title: 'Renouvellement à venir', text: 'Un rappel avant chaque renouvellement de votre abonnement.' },
  { icon: '📦', title: 'Suivi de commande', text: 'Soyez prévenu dès que votre commande est expédiée.' },
]

export default function NotificationsIntroScreen() {
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(false)

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
    <View style={styles.root}>
      <LinearGradient
        colors={[theme.colors.navyDark, theme.colors.navyDeep]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.content, { paddingTop: insets.top + theme.spacing[10], paddingBottom: insets.bottom + theme.spacing[6] }]}>
        <View style={styles.logoWrap}>
          <Logo width={104} color={theme.colors.white} />
        </View>

        <View style={styles.bellCircle}>
          <Text style={styles.bellEmoji}>🔔</Text>
        </View>

        <Text style={styles.title}>Ne manquez plus rien</Text>
        <Text style={styles.subtitle}>
          Activez les notifications pour tirer le meilleur de votre eau filtrée.
        </Text>

        <View style={styles.benefits}>
          {BENEFITS.map(b => (
            <View key={b.title} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Text style={styles.benefitEmoji}>{b.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.benefitTitle}>{b.title}</Text>
                <Text style={styles.benefitText}>{b.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity
          style={[styles.btnPrimary, loading && { opacity: 0.7 }]}
          onPress={enableNotifications}
          disabled={loading}
          activeOpacity={0.85}
        >
          <Text style={styles.btnPrimaryText}>
            {loading ? 'Activation…' : 'Activer les notifications'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={finish} disabled={loading} activeOpacity={0.6}>
          <Text style={styles.skip}>Plus tard</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.navyDeep },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing[6],
    alignItems: 'center',
  },
  logoWrap: {
    marginBottom: theme.spacing[8],
  },
  bellCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(39,100,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(112,152,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[5],
  },
  bellEmoji: { fontSize: 38 },
  title: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size['3xl'],
    color: theme.colors.white,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.base,
    color: '#c7d0e8',
    textAlign: 'center',
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[8],
    lineHeight: theme.typography.size.base * theme.typography.lineHeight.relaxed,
    paddingHorizontal: theme.spacing[4],
  },
  benefits: {
    width: '100%',
    gap: theme.spacing[4],
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[4],
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: theme.radius.xl,
    padding: theme.spacing[4],
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitEmoji: { fontSize: 22 },
  benefitTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.white,
  },
  benefitText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.sm,
    color: '#a9b6d4',
    marginTop: 2,
    lineHeight: theme.typography.size.sm * theme.typography.lineHeight.normal,
  },
  btnPrimary: {
    width: '100%',
    height: 56,
    backgroundColor: theme.colors.blue,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing[4],
  },
  btnPrimaryText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.md,
    color: theme.colors.white,
  },
  skip: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.base,
    color: '#8a9bbf',
    paddingVertical: theme.spacing[2],
  },
})
