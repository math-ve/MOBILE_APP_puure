import { useEffect, useState } from 'react'
import { Platform, AppState } from 'react-native'
import { Stack, router } from 'expo-router'
import * as Linking from 'expo-linking'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts,
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans'
import { supabase } from '../lib/supabase'
import { ToastProvider } from '../hooks/useToast'
import { initI18n, hasManualLanguage, getDeviceLanguage, i18n } from '../lib/i18n'

const SUPABASE_URL = 'https://vwlqdrrlggolgdssdwoh.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3bHFkcnJsZ2dvbGdkc3Nkd29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODkyNjIsImV4cCI6MjA5NTI2NTI2Mn0.859w5rLfcdZWG_vhk0tQM0cqcwRluIFlHjLIsM3Sr5o'

SplashScreen.preventAutoHideAsync()

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

// Channel Android requis pour les notifications heads-up (Android 8+)
async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Notifications Puure',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2764FF',
  })
}

async function registerPushToken(userId: string) {
  if (!Device.isDevice) return

  try {
    // On NE demande PAS la permission ici : c'est l'écran d'onboarding
    // (notifications-intro) qui gère la demande, contexte à l'appui.
    // Ici on se contente d'enregistrer le token si l'autorisation existe déjà
    // (ex: reconnexion d'un utilisateur ayant déjà accepté).
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return

    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: 'c1ed5ce2-a996-401f-a527-1f1705efef9e',
    })).data

    await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', userId)
  } catch (e) {
    // Expo Go ne supporte plus les push remote (SDK 53+) — ne bloque pas le login
    if (__DEV__) console.warn('Push token registration failed:', e)
  }
}

/**
 * Répercute la langue effective de l'app dans profiles.language
 * (utilisé par les notifications push). Respecte le choix manuel : si
 * l'utilisateur n'a rien fixé, on prend la langue de l'appareil telle que
 * i18n l'a résolue.
 */
async function syncLanguage(userId: string) {
  try {
    const manual = await hasManualLanguage()
    const language = manual ? i18n.language : getDeviceLanguage()
    await supabase.from('profiles').update({ language }).eq('id', userId)
  } catch (e) {
    if (__DEV__) console.warn('Language sync failed:', e)
  }
}

// Navigue vers l'écran ciblé par la notification (data.screen envoyé par le backend)
function handleNotificationNavigation(data: Record<string, unknown> | undefined) {
  let screen = data?.screen
  if (typeof screen === 'string' && screen.length > 0) {
    // L'onglet Abonnement a fusionné dans Livraisons (orders). On remappe les
    // anciennes notifications déjà envoyées qui pointent encore vers /subscription.
    if (screen === '/(tabs)/subscription') screen = '/(tabs)/orders'
    router.push(screen as any)
  }
}

async function triggerSyncs(userId: string, accessToken: string) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
  }
  const body = JSON.stringify({ user_id: userId })

  await Promise.allSettled([
    fetch(`${SUPABASE_URL}/functions/v1/sync-orders`, { method: 'POST', headers, body }),
    fetch(`${SUPABASE_URL}/functions/v1/sync-subscriptions`, { method: 'POST', headers, body }),
  ])
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  })
  const [i18nReady, setI18nReady] = useState(false)

  useEffect(() => {
    initI18n().then(() => setI18nReady(true))
  }, [])

  useEffect(() => {
    if (fontsLoaded && i18nReady) SplashScreen.hideAsync()
  }, [fontsLoaded, i18nReady])

  useEffect(() => {
    // Setup notifications : channel Android + badge à zéro à chaque ouverture
    setupAndroidChannel()
    Notifications.setBadgeCountAsync(0)
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') Notifications.setBadgeCountAsync(0)
    })

    // Tap sur une notification (app en background)
    const notifResponseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationNavigation(response.notification.request.content.data)
    })

    // Tap sur une notification (cold start) — léger délai le temps que le router monte
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        setTimeout(() => {
          handleNotificationNavigation(response.notification.request.content.data)
        }, 500)
      }
    })

    const handleDeepLink = async (url: string) => {
      if (url.includes('auth/callback')) {
        const parsed = Linking.parse(url)
        const token = parsed.queryParams?.token as string
        const type = parsed.queryParams?.type as string
        if (token && type) {
          await supabase.auth.verifyOtp({ token_hash: token, type: 'magiclink' })
        }
      }
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url)
    })

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url)
    })

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        registerPushToken(session.user.id)
        syncLanguage(session.user.id)
        triggerSyncs(session.user.id, session.access_token)
      }
    })

    return () => {
      subscription.remove()
      authSub.unsubscribe()
      appStateSub.remove()
      notifResponseSub.remove()
    }
  }, [])

  if (!fontsLoaded || !i18nReady) return null

  return (
    <ToastProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="subscription-detail" />
        <Stack.Screen name="tracking" />
        <Stack.Screen name="settings" />
      </Stack>
    </ToastProvider>
  )
}
