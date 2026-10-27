import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Glyph from './Glyph'
import { ds, typography } from '../../lib/theme'

// Ligne d'une carte de choix groupés (maquettes P12, P27, P34, P36) :
// libellé à gauche, rond de sélection (ou chevron) à droite, trait dessous.

type Props = {
  label: string
  selected?: boolean
  onPress: () => void
  /** Dernière ligne de la carte : pas de trait dessous. */
  last?: boolean
  /** Ligne de navigation (chevron) plutôt que choix (rond). */
  chevron?: boolean
}

export default function RadioRow({ label, selected = false, onPress, last, chevron }: Props) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress() }}
      accessibilityRole={chevron ? 'button' : 'radio'}
      accessibilityState={chevron ? undefined : { checked: selected }}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.label}>{label}</Text>
      {chevron
        ? <Glyph name="chevron" size={18} color={ds.blue} />
        : <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.dot} />}</View>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { minHeight: 52, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: ds.line },
  label: { flex: 1, fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.ink },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#9AA0B1', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: ds.blue },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ds.blue },
})
