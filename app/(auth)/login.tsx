import { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet,
  Platform, Dimensions, ScrollView, KeyboardAvoidingView,
} from 'react-native'
import { VideoView, useVideoPlayer } from 'expo-video'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { track } from '../../lib/analytics'
import Logo from '../../components/ui/Logo'
import { NOTIF_INTRO_SEEN_KEY } from './notifications-intro'

const { height } = Dimensions.get('window')

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

  const player = useVideoPlayer(
    require('../../assets/videos/Purificateur_Inox_SequenceFixe_HomePage_Telephone_WEB_HD.mp4'),
    (p) => { p.loop = true; p.muted = true; p.play() }
  )

  const handleOtpChange = (val: string, index: number) => {
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
      {/* VIDEO */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        nativeControls={false}
      />

      {/* GRADIENTS */}
      <LinearGradient
        colors={['rgba(8,21,61,0.3)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }}
      />
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.85)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.65 }}
      />

      {/* KEYBOARD AVOIDING — technique correcte iOS */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={false}
          bounces={false}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 32 }]}>

            {/* Inner highlight — réflexion lumineuse sur le verre */}
            <LinearGradient
              colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
              style={styles.innerHighlight}
              pointerEvents="none"
            />

            {/* Drag handle */}
            <View style={styles.handle} />

            {/* Logo */}
            <Pressable
              style={styles.logoRow}
              onLongPress={() => { setStep('password'); setError('') }}
              delayLongPress={1500}
            >
              <Logo width={132} />
            </Pressable>

            {step === 'email' ? (
              <>
                <Text style={styles.title}>{t('auth:loginTitle')}</Text>
                <Text style={styles.subtitle}>{t('auth:loginSubtitle')}</Text>

                <TextInput
                  style={styles.input}
                  placeholder={t('auth:emailPlaceholder')}
                  placeholderTextColor="rgba(35,48,86,0.35)"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  keyboardAppearance="light"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleSendCode}
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.btnLime, loading && { opacity: 0.7 }]}
                  onPress={handleSendCode}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnLimeText}>
                    {loading ? t('auth:sending') : t('auth:sendCode')}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.footer}>{t('auth:securedAccess')}</Text>
              </>
            ) : step === 'password' ? (
              <>
                <Text style={styles.title}>{t('auth:loginTitle')}</Text>

                <TextInput
                  style={styles.input}
                  placeholder={t('auth:emailPlaceholder')}
                  placeholderTextColor="rgba(35,48,86,0.35)"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  keyboardAppearance="light"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                />

                <TextInput
                  style={styles.input}
                  placeholder={t('auth:passwordPlaceholder')}
                  placeholderTextColor="rgba(35,48,86,0.35)"
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

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.btnLime, loading && { opacity: 0.7 }]}
                  onPress={handlePasswordLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnLimeText}>
                    {loading ? t('auth:verifying') : t('auth:signIn')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={backToEmail} style={{ marginTop: 12, alignItems: 'center' }}>
                  <Text style={styles.backLink}>{t('auth:backToCode')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.title}>{t('auth:verifyTitle')}</Text>
                <Text style={styles.subtitle}>
                  {t('auth:codeSentTo')}
                  <Text style={{ color: '#2764FF' }}>{email}</Text>
                </Text>

                <View style={styles.otpRow}>
                  {otpValues.map((val, i) => (
                    <TextInput
                      key={i}
                      ref={(r) => { otpRefs.current[i] = r }}
                      style={[styles.otpBox, val ? styles.otpBoxFilled : null]}
                      value={val}
                      onChangeText={(v) => handleOtpChange(v.slice(-1), i)}
                      keyboardType="number-pad"
                      keyboardAppearance="light"
                      maxLength={1}
                      selectTextOnFocus
                    />
                  ))}
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.btnLime, loading && { opacity: 0.7 }]}
                  onPress={handleVerifyCode}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnLimeText}>
                    {loading ? t('auth:verifying') : t('auth:signIn')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={backToEmail}
                  style={{ marginTop: 12, alignItems: 'center' }}
                >
                  <Text style={styles.backLink}>{t('auth:changeEmail')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#08153d',
  },
  sheet: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.9)',
    borderLeftColor: 'rgba(255,255,255,0.4)',
    borderRightColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 24,
    paddingTop: 8,
    shadowColor: '#233056',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
  },
  innerHighlight: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 80,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(35,48,86,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  logoRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#233056',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(35,48,86,0.6)',
    lineHeight: 22,
    marginBottom: 24,
  },
  input: {
    height: 54,
    backgroundColor: 'rgba(35,48,86,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(35,48,86,0.12)',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#233056',
    marginBottom: 12,
  },
  btnLime: {
    height: 56,
    backgroundColor: '#2764FF',
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  btnLimeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(35,48,86,0.45)',
    marginBottom: 8,
  },
  error: {
    color: '#e32c2b',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
    textAlign: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
    justifyContent: 'center',
  },
  otpBox: {
    width: 46,
    height: 56,
    backgroundColor: 'rgba(35,48,86,0.06)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(35,48,86,0.12)',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: '#233056',
  },
  otpBoxFilled: {
    borderColor: '#2764FF',
    backgroundColor: 'rgba(39,100,255,0.06)',
  },
  backLink: {
    color: 'rgba(35,48,86,0.55)',
    fontSize: 14,
    textAlign: 'center',
  },
})
