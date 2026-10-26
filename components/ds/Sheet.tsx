import { ReactNode, useEffect, useRef } from 'react'
import {
  Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { ds, typography } from '../../lib/theme'

// Feuille du bas du Puure DS : fond assombri, coins 28 px, poignée,
// titre centré + sous-titre, contenu défilant si besoin, actions en bas.

type Props = {
  title: string
  subtitle?: string
  /** Mise en garde sous le sous-titre (ex. cartouche saturée). */
  note?: string
  onClose: () => void
  children?: ReactNode
  /** Boutons du bas (restent visibles quand le contenu défile). */
  footer?: ReactNode
}

export default function Sheet({ title, subtitle, note, onClose, children, footer }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const slide = useRef(new Animated.Value(700)).current
  const fade = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const easing = Easing.bezier(0.16, 1, 0.3, 1)
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 380, easing, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common:close')} accessibilityRole="button" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: insets.bottom + 24, transform: [{ translateY: slide }] }]}
        >
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {note ? <Text style={styles.note}>{note}</Text> : null}
          </View>
          {children ? (
            <ScrollView style={styles.body} contentContainerStyle={{ gap: 8 }} bounces={false} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : null}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: ds.backdrop },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: ds.raised,
    borderTopLeftRadius: ds.radius.sheet,
    borderTopRightRadius: ds.radius.sheet,
    paddingTop: 12,
    paddingHorizontal: 24,
    maxHeight: '92%',
    gap: 20,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: ds.line },
  head: { gap: 6, alignItems: 'center' },
  title: { fontFamily: typography.fontFamily.medium, fontSize: 20, lineHeight: 25, color: ds.ink, textAlign: 'center' },
  subtitle: { fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: ds.muted, textAlign: 'center' },
  note: { fontFamily: typography.fontFamily.regular, fontSize: 13, lineHeight: 19, color: ds.muted, textAlign: 'center' },
  body: { flexGrow: 0 },
  footer: { gap: 4 },
})
