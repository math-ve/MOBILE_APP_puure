import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import { ds, typography } from '../../lib/theme'

// Bouton pilule du Puure DS (54 px). Un seul bouton `primary` par écran.
//  primary   : bleu plein (action principale)
//  secondary : contour gris (alternative)
//  link      : texte bleu (alternative douce, « Choisir une autre date »)
//  quiet     : texte gris (« Annuler quand même », « Plus tard »)
//  danger    : texte rouge (action définitive)
//  destructive    : rouge plein (« Supprimer »)
//  dangerOutline  : contour gris, texte rouge (« Annuler l'abonnement »)

type Variant = 'primary' | 'secondary' | 'link' | 'quiet' | 'danger' | 'destructive' | 'dangerOutline'

type Props = {
  label: string
  onPress: () => void
  variant?: Variant
  loading?: boolean
  disabled?: boolean
  style?: ViewStyle
  /** Couleur du libellé imposée (ex. « Appliquer » bleu sur bouton blanc, P08). */
  labelColor?: string
  accessibilityHint?: string
}

export default function PillButton({ label, onPress, variant = 'primary', loading, disabled, style, labelColor, accessibilityHint }: Props) {
  const inactive = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (variant === 'primary') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
        onPress()
      }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !inactive && styles.pressed,
        disabled && !loading && styles.disabled,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={variant === 'primary' || variant === 'destructive' ? '#fff' : ds.blue} />
        : <Text style={[styles.label, labelStyles[variant], labelColor ? { color: labelColor } : null]} numberOfLines={1}>{label}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: ds.control,
    borderRadius: ds.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primary: { backgroundColor: ds.blue },
  secondary: { backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line },
  destructive: { backgroundColor: ds.red },
  dangerOutline: { backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line },
  link: { minHeight: 44 },
  quiet: { minHeight: 44 },
  danger: { minHeight: 44 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  label: { fontFamily: typography.fontFamily.medium, fontSize: 16 },
})

const labelStyles = StyleSheet.create({
  primary: { color: '#FFFFFF' },
  secondary: { color: ds.ink },
  destructive: { color: '#FFFFFF' },
  dangerOutline: { color: ds.red },
  link: { color: ds.blue, fontSize: 15 },
  quiet: { color: ds.body, fontSize: 15, fontFamily: typography.fontFamily.regular },
  danger: { color: ds.red, fontSize: 15 },
})
