import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { ds, typography } from '../../lib/theme'

// Ligne de choix en pilule (radio) : libellé à gauche, détail + pastille à droite.
// Sélectionnée : contour bleu 2 px sur fond bleu pâle.

type Props = {
  label: string
  detail?: string
  selected: boolean
  onPress: () => void
  /** Ligne-lien (sans pastille radio), ex. « Le filtre ne va pas sur mon robinet ». */
  asLink?: boolean
}

export default function ChoiceRow({ label, detail, selected, onPress, asLink }: Props) {
  return (
    <Pressable
      accessibilityRole={asLink ? 'button' : 'radio'}
      accessibilityState={asLink ? undefined : { checked: selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress() }}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={2}>{label}</Text>
      <View style={styles.right}>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {asLink
          ? <Text style={styles.chevron}>›</Text>
          : <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.dot} />}</View>}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: ds.control,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: ds.radius.pill,
    borderWidth: 1,
    borderColor: ds.line,
    backgroundColor: ds.raised,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowSelected: { borderWidth: 2, borderColor: ds.blue, backgroundColor: ds.blueSoft, paddingHorizontal: 19 },
  label: { flex: 1, fontFamily: typography.fontFamily.regular, fontSize: 16, color: ds.ink },
  labelSelected: { fontFamily: typography.fontFamily.medium },
  right: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detail: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.muted },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#B9BECB', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: ds.blue },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ds.blue },
  chevron: { fontSize: 22, color: ds.muted, marginTop: -2 },
})
