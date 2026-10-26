import { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { ds, typography } from '../../lib/theme'
import Glyph, { GlyphName } from './Glyph'

// Briques des écrans plein écran du Puure DS (annulation, demandes, résultats).

/** Texte rouge sur fond rouge pâle (token red-tag-ink). */
const RED_INK = '#A11F27'

type Tone = 'blue' | 'red' | 'amber' | 'neutral'

const TONES: Record<Tone, { bg: string; fg: string }> = {
  blue: { bg: ds.blueSoft, fg: ds.blue },
  red: { bg: ds.redSoft, fg: ds.red },
  amber: { bg: ds.amberSoft, fg: ds.amber },
  neutral: { bg: ds.fill, fg: ds.ink },
}

// ─── Écran ──────────────────────────────────────────────────────

type FlowScreenProps = {
  /** Titre court centré dans la barre du haut (contexte du parcours). */
  title?: string
  onBack?: () => void
  children: ReactNode
  /** Actions collées en bas d'écran. */
  actions?: ReactNode
  /** Centre verticalement le contenu (écrans d'offre et de résultat). */
  centered?: boolean
}

export function FlowScreen({ title, onBack, children, actions, centered }: FlowScreenProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel={t('common:back')}>
            <Glyph name="back" color={ds.blue} />
          </Pressable>
        ) : <View style={styles.back} />}
        {title ? <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">{title}</Text> : <View style={{ flex: 1 }} />}
        <View style={styles.back} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, centered && styles.centered]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {actions ? <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>{actions}</View> : null}
    </View>
  )
}

// ─── Haut d'écran : pictogramme + titre + texte ─────────────────

export function Hero({ glyph, tone = 'blue', title, body }: { glyph: GlyphName; tone?: Tone; title: string; body?: string }) {
  const c = TONES[tone]
  return (
    <View style={styles.hero}>
      <View style={[styles.heroIcon, { backgroundColor: c.bg }]}>
        <Glyph name={glyph} size={32} color={c.fg} />
      </View>
      <Text style={styles.heroTitle} accessibilityRole="header">{title}</Text>
      {body ? <Text style={styles.heroBody}>{body}</Text> : null}
    </View>
  )
}

// ─── Carte d'informations (lignes libellé / valeur) ─────────────

export function InfoCard({ rows, children }: { rows?: { label: string; value: string; strong?: boolean }[]; children?: ReactNode }) {
  return (
    <View style={styles.card}>
      {rows?.map((r) => (
        <View key={r.label} style={styles.row}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          <Text style={[styles.rowValue, r.strong && { color: ds.blue }]}>{r.value}</Text>
        </View>
      ))}
      {children}
    </View>
  )
}

// ─── Bandeau d'alerte (paiement refusé…) ────────────────────────

export function AlertBanner({ title, body, onPress }: { title: string; body: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      style={({ pressed }) => [styles.banner, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.bannerIcon}><Glyph name="alertCircle" size={18} color="#FFFFFF" /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.bannerTitle}>{title}</Text>
        <Text style={styles.bannerBody}>{body}</Text>
      </View>
      <Glyph name="chevron" size={18} color={RED_INK} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ds.surface },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, minHeight: 44 },
  back: { width: 44, height: 44, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: typography.fontFamily.medium, fontSize: 20, color: ds.ink },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24, gap: 20 },
  centered: { flexGrow: 1, justifyContent: 'center' },
  actions: { paddingHorizontal: 20, paddingTop: 12, gap: 6, backgroundColor: ds.surface },

  hero: { alignItems: 'center', gap: 8 },
  heroIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { fontFamily: typography.fontFamily.medium, fontSize: 24, lineHeight: 29, letterSpacing: -0.24, color: ds.ink, textAlign: 'center' },
  heroBody: { fontFamily: typography.fontFamily.regular, fontSize: 15, lineHeight: 22, color: ds.body, textAlign: 'center' },

  card: { backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: ds.radius.card, paddingVertical: 18, paddingHorizontal: 20, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  // Le libellé garde sa largeur ; c'est la valeur qui passe à la ligne si elle est longue.
  rowLabel: { flexShrink: 0, maxWidth: '55%', fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.body },
  rowValue: { flex: 1, fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink, textAlign: 'right' },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: ds.redSoft, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16,
  },
  bannerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: ds.red, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: RED_INK },
  bannerBody: { fontFamily: typography.fontFamily.regular, fontSize: 13, lineHeight: 18, color: ds.body },
})
