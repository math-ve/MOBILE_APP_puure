import { forwardRef, ReactNode } from 'react'
import { StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native'
import { ds, typography } from '../../lib/theme'

// Champs de formulaire du Puure DS (maquettes P07, P12, P18) : étiquette en
// capitales grises, champ en pilule blanche de 52 px.

export function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children.toLocaleUpperCase()}</Text>
}

type FieldProps = TextInputProps & { label?: string; style?: ViewStyle; multilineHeight?: number }

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, style, multilineHeight, ...input }, ref) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={ds.muted}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, input.multiline && { height: multilineHeight ?? 120, borderRadius: 24, paddingTop: 16, textAlignVertical: 'top' }]}
      />
    </View>
  )
})

/** Carte de choix groupés (maquettes P12, P34, P36) : lignes séparées par un trait. */
export function GroupCard({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>
}

const styles = StyleSheet.create({
  label: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, letterSpacing: 0.96, color: ds.muted },
  input: {
    height: 52, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1, borderColor: ds.line,
    backgroundColor: ds.raised, fontFamily: typography.fontFamily.regular, fontSize: 16, color: ds.ink,
  },
  group: { backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: ds.radius.card, paddingHorizontal: 18 },
})
