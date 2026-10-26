import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { FlowScreen } from '../components/ds/Flow'
import ChoiceRow from '../components/ds/ChoiceRow'
import PillButton from '../components/ds/PillButton'
import Glyph from '../components/ds/Glyph'
import { isPhotoPickerAvailable, pickPhoto, PickedPhoto } from '../lib/photoPicker'
import { sendSupportTicket, uploadSupportPhoto } from '../lib/support'
import { track } from '../lib/analytics'
import { ds, typography } from '../lib/theme'

// « Mon filtre ne va pas » (maquette P34) : photo du robinet + problème →
// demande d'adaptateur au support. Accessible depuis l'accueil et depuis le
// parcours d'annulation (motif « le filtre ne va pas sur mon robinet »).

type Problem = 'thread' | 'pullout' | 'leak' | 'other'

// Catégorie Zendesk de chaque problème (mêmes valeurs que le formulaire du site).
const ROUTING: Record<Problem, { group: string; category: string }> = {
  thread: { group: 'Adapter / Compatibility', category: 'adapter_/_compatibility__thread_size_issue' },
  pullout: { group: 'Adapter / Compatibility', category: 'adapter_/_compatibility__faucet_not_compatible' },
  leak: { group: 'Installation / Setup', category: 'installation_/_setup__leak_after_installation' },
  other: { group: 'Adapter / Compatibility', category: 'adapter_/_compatibility__wrong_adapter_needed' },
}

const FR_PROBLEM: Record<Problem, string> = {
  thread: 'Le filtre ne se visse pas',
  pullout: 'Douchette ou bec extractible',
  leak: 'Fuite au niveau du raccord',
  other: 'Autre problème',
}

export default function FilterHelpScreen() {
  const { t } = useTranslation()
  const { source = 'home', contractId } = useLocalSearchParams<{ source?: string; contractId?: string }>()

  const [photo, setPhoto] = useState<PickedPhoto | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const choose = async (from: 'camera' | 'library') => {
    setNotice(null)
    const result = await pickPhoto(from)
    if (result === 'denied') return setNotice(t('care:filterHelp.permissionDenied'))
    if (result) setPhoto(result)
  }

  const send = async () => {
    if (isPhotoPickerAvailable && !photo) return setNotice(t('care:filterHelp.needPhoto'))
    if (!problem) return setNotice(t('care:filterHelp.needProblem'))
    setSending(true)
    setNotice(null)
    try {
      const photoUrl = photo ? await uploadSupportPhoto(photo.uri, photo.mimeType) : null
      const email = await sendSupportTicket({
        ...ROUTING[problem],
        message: details.trim() || FR_PROBLEM[problem],
        context: {
          'Problème': FR_PROBLEM[problem],
          'Photo du robinet': photoUrl ?? 'non jointe (version de l\'app sans appareil photo) — demander la photo par e-mail',
          'Abonnement': contractId ? `#${contractId}` : null,
          'Origine': source === 'cancel' ? 'Parcours d\'annulation (motif : le filtre ne va pas)' : 'App — Mon filtre ne va pas',
        },
        source: `filter-help_${source}`,
      })
      track('filter_help_sent', { problem, with_photo: !!photoUrl, source })
      router.replace({ pathname: '/done', params: { kind: contractId ? 'sentKeep' : 'sent', email } })
    } catch {
      setNotice(t('care:errors.generic'))
    } finally {
      setSending(false)
    }
  }

  return (
    <FlowScreen
      title={t('care:filterHelp.header')}
      onBack={() => router.back()}
      actions={<>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <PillButton label={t('care:filterHelp.send')} loading={sending} onPress={send} />
      </>}
    >
      <Text style={styles.intro}>{t('care:filterHelp.intro')}</Text>

      {isPhotoPickerAvailable ? (
        photo ? (
          <View style={styles.photoCard}>
            <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel={t('care:filterHelp.photoAdded')} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.photoOk}>
                <Glyph name="check" size={16} color={ds.blue} />
                <Text style={styles.photoOkText}>{t('care:filterHelp.photoAdded')}</Text>
              </View>
              <Pressable onPress={() => choose('camera')} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>{t('care:filterHelp.retake')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Pressable
              onPress={() => choose('camera')}
              accessibilityRole="button"
              accessibilityLabel={t('care:filterHelp.takePhoto')}
              accessibilityHint={t('care:filterHelp.photoHint')}
              style={({ pressed }) => [styles.capture, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.captureIcon}><Glyph name="camera" size={28} color={ds.blue} /></View>
              <Text style={styles.captureTitle}>{t('care:filterHelp.takePhoto')}</Text>
              <Text style={styles.captureHint}>{t('care:filterHelp.photoHint')}</Text>
            </Pressable>
            <PillButton variant="link" label={t('care:filterHelp.fromLibrary')} onPress={() => choose('library')} />
          </View>
        )
      ) : (
        <View style={styles.infoCard}>
          <Glyph name="mail" size={20} color={ds.blue} />
          <Text style={styles.infoText}>{t('care:filterHelp.noCamera')}</Text>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>{t('care:filterHelp.question')}</Text>
        {(Object.keys(ROUTING) as Problem[]).map((p) => (
          <ChoiceRow key={p} label={t(`care:filterHelp.problems.${p}`)} selected={problem === p} onPress={() => setProblem(p)} />
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.label}>{t('care:filterHelp.details')}</Text>
        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder={t('care:filterHelp.detailsPlaceholder')}
          placeholderTextColor={ds.muted}
          multiline
          maxLength={900}
          style={styles.textarea}
          accessibilityLabel={t('care:filterHelp.details')}
        />
      </View>
    </FlowScreen>
  )
}

const styles = StyleSheet.create({
  intro: { fontFamily: typography.fontFamily.regular, fontSize: 15, lineHeight: 22, color: ds.body, textAlign: 'center' },
  capture: {
    alignItems: 'center', gap: 6, paddingVertical: 24, paddingHorizontal: 20,
    borderRadius: ds.radius.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9C8F5', backgroundColor: ds.raised,
  },
  captureIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: ds.blueSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  captureTitle: { fontFamily: typography.fontFamily.medium, fontSize: 16, color: ds.ink },
  captureHint: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: ds.muted, textAlign: 'center' },
  photoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12,
    borderRadius: ds.radius.card, borderWidth: 1, borderColor: ds.line, backgroundColor: ds.raised,
  },
  photo: { width: 72, height: 72, borderRadius: 16, backgroundColor: ds.fill },
  photoOk: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoOkText: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },
  link: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.blue },
  infoCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16,
    borderRadius: 20, backgroundColor: ds.blueSoft,
  },
  infoText: { flex: 1, fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: ds.body },
  label: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: ds.ink },
  textarea: {
    minHeight: 96, borderWidth: 1, borderColor: ds.line, borderRadius: 20, backgroundColor: ds.raised,
    padding: 16, fontFamily: typography.fontFamily.regular, fontSize: 16, color: ds.ink, textAlignVertical: 'top',
  },
  notice: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center', marginBottom: 6 },
})
