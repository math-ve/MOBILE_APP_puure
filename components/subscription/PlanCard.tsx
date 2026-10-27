import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import { ds, typography } from '../../lib/theme'
import { formatDate } from '../../lib/i18n/format'
import { planImage, planSubtitle, planTitle } from '../../lib/plan'

// Carte « Mon abonnement » (maquettes P04, P10) : vignette, formule, prix,
// prochaine livraison. Ouvre le détail de l'abonnement.

export default function PlanCard({ sub, onPress }: { sub: any; onPress: () => void }) {
  const { t } = useTranslation()
  const image = planImage(sub)
  const paused = sub.status === 'paused'
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.top}>
        {image ? <Image source={{ uri: image }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: ds.fill }]} />}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.title} numberOfLines={1}>{planTitle(sub)}</Text>
          <Text style={styles.sub} numberOfLines={1}>{planSubtitle(sub)}</Text>
        </View>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M9 6l6 6-6 6" stroke={ds.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <View style={styles.bottom}>
        <Text style={styles.label}>{paused ? t('water:plan.paused') : t('water:plan.nextDelivery')}</Text>
        {!paused && sub.next_billing_date ? <Text style={styles.value}>{formatDate(sub.next_billing_date)}</Text> : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: ds.radius.card,
    paddingVertical: 16, paddingHorizontal: 18, gap: 14,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: { width: 56, height: 56, borderRadius: 14 },
  title: { fontFamily: typography.fontFamily.medium, fontSize: 16, color: ds.ink },
  sub: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.muted },
  bottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: ds.line, paddingTop: 14,
  },
  label: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.muted },
  value: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },
})
