import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Glyph from '../ds/Glyph'
import { ds, typography } from '../../lib/theme'

// « Change ta cartouche à temps » (maquettes P04 / P05) + lien « Mon filtre ne
// va pas sur mon robinet ? ». Version urgente quand une cartouche arrive au bout.

type Props = {
  /** Durée de vie prévue des cartouches actives, en jours. */
  lifespansDays: number[]
  /** Jours restants de la cartouche la plus proche de la fin (null si aucun filtre). */
  soonestDaysLeft: number | null
  hasActiveSubscription: boolean
}

const URGENT_DAYS = 7

export default function CartridgeAdvice({ lifespansDays, soonestDaysLeft, hasActiveSubscription }: Props) {
  const { t } = useTranslation()
  if (lifespansDays.length === 0) return null

  const urgent = soonestDaysLeft != null && soonestDaysLeft <= URGENT_DAYS
  // Rythme le plus courant parmi les filtres, en mois (90 j → 3 mois).
  const months = Math.max(1, Math.round(mode(lifespansDays) / 30))

  const title = urgent
    ? (soonestDaysLeft! <= 0 ? t('care:cartridge.late') : t('care:cartridge.soon', { count: soonestDaysLeft! }))
    : t('care:cartridge.rhythm', { count: months })
  const body = !urgent && hasActiveSubscription ? t('care:cartridge.rhythmBody') : t('care:cartridge.soonBody')

  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.card, urgent && styles.cardUrgent]}>
        <View style={[styles.icon, urgent && { backgroundColor: '#FFFFFF' }]}>
          <Glyph name={urgent ? 'alert' : 'drop'} size={20} color={urgent ? ds.red : ds.blue} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.title, urgent && { color: '#A11F27' }]}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
      </View>
      <Pressable
        onPress={() => router.push({ pathname: '/filter-help', params: { source: 'home' } })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.linkText}>{t('care:filterHelp.link')}</Text>
        <Glyph name="chevron" size={16} color={ds.blue} />
      </Pressable>
    </View>
  )
}

function mode(values: number[]): number {
  const counts = new Map<number, number>()
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
    backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: ds.radius.card, padding: 18,
  },
  cardUrgent: { backgroundColor: ds.redSoft, borderColor: ds.redSoft },
  icon: { width: 40, height: 40, borderRadius: 14, backgroundColor: ds.blueSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: typography.fontFamily.medium, fontSize: 16, lineHeight: 21, color: ds.ink },
  body: { fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: ds.body },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 },
  linkText: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.blue },
})
