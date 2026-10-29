import { useState, useRef } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native'
import { VideoView, useVideoPlayer } from 'expo-video'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path, Rect } from 'react-native-svg'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import Logo from '../../components/ui/Logo'
import PillButton from '../../components/ds/PillButton'
import Glyph from '../../components/ds/Glyph'
import { FieldLabel } from '../../components/ds/Field'
import { ds, typography } from '../../lib/theme'
import { NOTIF_INTRO_SEEN_KEY } from './notifications-intro'

// Connexion (maquettes P01, P02) : vidéo plein écran sous un fondu blanc,
// e-mail → code à 6 chiffres.

/** Logo de 26 px de haut (ratio du viewBox 341,1 × 96,8). */
const LOGO_WIDTH = 26 * 341.1 / 96.8

const SUPABASE_URL = 'https://vwlqdrrlggolgdssdwoh.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3bHFkcnJsZ2dvbGdkc3Nkd29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODkyNjIsImV4cCI6MjA5NTI2NTI2Mn0.859w5rLfcdZWG_vhk0tQM0cqcwRluIFlHjLIsM3Sr5o'

export default function LoginScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', ''])
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'email' | 'otp' | 'password'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const otpRefs = useRef<any[]>([])
  const [focused, setFocused] = useState<number | null>(null)

  // Vidéo montée en aller-retour (lecture puis lecture inversée) : la boucle
  // retombe sur l'image de départ, sans saut au raccord.
  const player = useVideoPlayer(
    require('../../assets/videos/login-loop.mp4'),
    (p) => { p.loop = true; p.muted = true; p.play() }
  )

  const handleOtpChange = (raw: string, index: number) => {
    // Code collé ou proposé par le clavier (« Depuis Mail ») : réparti sur les cases.
    const digits = raw.replace(/\D/g, '')
    // Un chiffre tapé derrière celui déjà présent n'est pas un collage.
    const typedAfter = digits.length === 2 && !!otpValues[index] && digits.startsWith(otpValues[index])
    if (digits.length > 1 && !typedAfter) {
      const filled = [...otpValues]
      digits.slice(0, 6 - index).split('').forEach((d, k) => { filled[index + k] = d })
      setOtpValues(filled)
      otpRefs.current[Math.min(index + digits.length, 5)]?.focus()
      return
    }
    const val = digits.slice(-1)
    const newValues = [...otpValues]
    newValues[index] = val
    setOtpValues(newValues)
    if (val && index < 5) otpRefs.current[index + 1]?.focus()
    if (!val && index > 0) otpRefs.current[index - 1]?.focus()
  }

  const handleSendCode = async () => {
    if (!email.includes('@')) { setError(t('auth:emailInvalid')); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (data.success) setStep('otp')
      else setError(data.error ?? t('auth:genericError'))
    } catch { setError(t('auth:serverUnreachable')) }
    finally { setLoading(false) }
  }

  const handleVerifyCode = async () => {
    const fullCode = otpValues.join('')
    if (fullCode.length !== 6) { setError(t('auth:codeIncomplete')); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), action: 'verify', token: fullCode }),
      })
      const data = await res.json()
      if (data.success && data.access_token) {
        await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
        // Au tout premier login, on montre l'écran d'explication des notifications
        // avant de demander la permission système. Ensuite on va droit aux tabs.
        const seen = await AsyncStorage.getItem(NOTIF_INTRO_SEEN_KEY)
        router.replace(seen ? '/(tabs)' : '/(auth)/notifications-intro')
      } else setError(data.error ?? t('auth:codeInvalid'))
    } catch { setError(t('auth:verificationError')) }
    finally { setLoading(false) }
  }

  // Connexion par mot de passe : réservée au compte de démo utilisé par
  // l'App Review d'Apple (pas d'accès à la boîte mail pour recevoir l'OTP).
  // Accessible via un appui long sur le logo, invisible pour les clients.
  const handlePasswordLogin = async () => {
    if (!email.includes('@')) { setError(t('auth:emailInvalid')); return }
    if (!password) { setError(t('auth:passwordInvalid')); return }
    setLoading(true); setError('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (authError) { setError(t('auth:passwordInvalid')); return }
      track('login_password')
      const seen = await AsyncStorage.getItem(NOTIF_INTRO_SEEN_KEY)
      router.replace(seen ? '/(tabs)' : '/(auth)/notifications-intro')
    } catch { setError(t('auth:verificationError')) }
    finally { setLoading(false) }
  }

  const backToEmail = () => {
    setStep('email'); setOtpValues(['', '', '', '', '', '']); setPassword(''); setError('')
  }

  return (
    <View style={styles.root}>
      {step !== 'otp' && (
        <>
          <VideoView player={player} style={StyleSheet.absoluteFillObject} contentFit="cover" nativeControls={false} />
          <LinearGradient
            colors={['#FFFFFF', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
            locations={[0, 0.45, 0.7, 1]}
            style={styles.fade}
            pointerEvents="none"
          />
        </>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {step === 'otp' ? (
          <View style={[styles.page, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
            <Pressable onPress={backToEmail} style={styles.backCircle} accessibilityRole="button" accessibilityLabel={t('common:back')} hitSlop={6}>
              <Glyph name="back" size={20} color={ds.ink} />
            </Pressable>
            <View style={{ gap: 10 }}>
              <Text style={styles.title} accessibilityRole="header">{t('auth:verifyTitle')}</Text>
              <Text style={styles.codeSent}>
                {t('auth:codeSentTo')} <Text style={styles.codeEmail}>{email.trim()}</Text>
              </Text>
            </View>
            <View style={{ gap: 20 }}>
              <FieldLabel>{t('auth:codeLabel')}</FieldLabel>
              <View style={styles.otpRow}>
                {otpValues.map((val, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { otpRefs.current[i] = r }}
                    style={[styles.otpBox, focused === i && styles.otpBoxFocused]}
                    value={val}
                    onChangeText={(v) => handleOtpChange(v, i)}
                    onFocus={() => setFocused(i)}
                    onBlur={() => setFocused((f) => (f === i ? null : f))}
                    onKeyPress={({ nativeEvent }) => {
                      if (nativeEvent.key === 'Backspace' && !val && i > 0) otpRefs.current[i - 1]?.focus()
                    }}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete={i === 0 ? 'sms-otp' : 'off'}
                    autoFocus={i === 0}
                    keyboardAppearance="light"
                    maxLength={i === 0 ? 6 : 1}
                    selectTextOnFocus
                    accessibilityLabel={`${t('auth:codeLabel')} ${i + 1}`}
                  />
                ))}
              </View>
            </View>
            <View style={{ flex: 1 }} />
            <View style={{ gap: 6 }}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PillButton label={t('auth:signIn')} loading={loading} onPress={handleVerifyCode} />
              <PillButton variant="quiet" label={t('auth:changeEmail')} onPress={backToEmail} />
            </View>
          </View>
        ) : (
          <View style={[styles.page, styles.overVideo, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
            <View style={{ gap: 14 }}>
              {/* Appui long sur le logo : connexion par mot de passe (compte de démo App Review). */}
              <Pressable onLongPress={() => { setStep('password'); setError('') }} delayLongPress={1500} style={{ alignSelf: 'flex-start' }}>
                <Logo width={LOGO_WIDTH} />
              </Pressable>
              <View style={{ gap: 8 }}>
                <Text style={styles.title} accessibilityRole="header">{t('auth:loginTitle')}</Text>
                <Text style={styles.subtitle}>{t('auth:loginSubtitle')}</Text>
              </View>
            </View>

            <View style={{ flex: 1 }} />

            <View style={{ gap: 12 }}>
              <TextInput
                style={styles.input}
                placeholder={t('auth:emailPlaceholder')}
                placeholderTextColor={ds.muted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                keyboardAppearance="light"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType={step === 'password' ? 'username' : 'emailAddress'}
                returnKeyType={step === 'password' ? 'next' : 'send'}
                onSubmitEditing={step === 'password' ? undefined : handleSendCode}
                accessibilityLabel={t('auth:emailPlaceholder')}
              />
              {step === 'password' && (
                <TextInput
                  style={styles.input}
                  placeholder={t('auth:passwordPlaceholder')}
                  placeholderTextColor={ds.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  keyboardAppearance="light"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={handlePasswordLogin}
                />
              )}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {step === 'password' ? (
                <>
                  <PillButton label={t('auth:signIn')} loading={loading} onPress={handlePasswordLogin} />
                  <PillButton variant="quiet" label={t('auth:backToCode')} onPress={backToEmail} />
                </>
              ) : (
                <>
                  <PillButton label={t('auth:sendCode')} loading={loading} onPress={handleSendCode} />
                  <View style={styles.secure}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                      <Rect x={4} y={11} width={16} height={10} rx={3} stroke={ds.blue} strokeWidth={1.8} />
                      <Path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={ds.blue} strokeWidth={1.8} strokeLinecap="round" />
                    </Svg>
                    <Text style={styles.secureText}>{t('auth:securedAccess')}</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  fade: { position: 'absolute', left: 0, right: 0, top: 0, height: 300 },
  page: { flex: 1, paddingHorizontal: 24, gap: 28 },
  overVideo: { paddingHorizontal: 20, gap: 0 },
  title: { fontFamily: typography.fontFamily.medium, fontSize: 38, lineHeight: 43, letterSpacing: -0.76, color: ds.ink },
  subtitle: { fontFamily: typography.fontFamily.regular, fontSize: 17, lineHeight: 25, color: ds.body },
  input: {
    height: 54, paddingHorizontal: 22, borderRadius: 999, borderWidth: 1, borderColor: ds.line,
    backgroundColor: '#FFFFFF', fontFamily: typography.fontFamily.regular, fontSize: 16, color: ds.ink,
  },
  secure: {
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#FFFFFF',
  },
  secureText: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: ds.ink },
  error: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center' },
  backCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: ds.line, alignItems: 'center', justifyContent: 'center' },
  codeSent: { fontFamily: typography.fontFamily.regular, fontSize: 15, lineHeight: 22, color: ds.body },
  codeEmail: { fontFamily: typography.fontFamily.medium, color: ds.ink },
  otpRow: { flexDirection: 'row', gap: 8 },
  otpBox: {
    flex: 1, minWidth: 0, height: 60, borderRadius: 16, borderWidth: 1, borderColor: ds.line, backgroundColor: ds.surface,
    textAlign: 'center', fontFamily: typography.fontFamily.medium, fontSize: 24, color: ds.ink,
  },
  otpBoxFocused: { borderWidth: 2, borderColor: ds.blue, backgroundColor: '#FFFFFF' },
})
