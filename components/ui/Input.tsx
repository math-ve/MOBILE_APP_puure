import { TextInput, View, Text, StyleSheet, TextInputProps, ViewStyle } from 'react-native'
import { Colors, Typography, Spacing, Radius } from '../../lib/theme'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
  containerStyle?: ViewStyle
}

export function Input({ label, error, containerStyle, style, ...props }: InputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style]}
        placeholderTextColor={Colors.placeholder}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing[3],
  },
  label: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.muted,
    marginBottom: Spacing[2],
    letterSpacing: Typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  input: {
    // --input-height mobile: 2.625rem ≈ 42px, desktop: 3.125rem = 50px
    height: 52,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.input,         // 8px — input_border_radius
    paddingHorizontal: Spacing[4],      // 16px
    fontSize: Typography.sizes.md,      // 16px
    color: Colors.heading,              // #08153d
    backgroundColor: Colors.background, // #f4f4f4 — --input-bg-col
  },
  inputError: {
    borderColor: Colors.error,
  },
  error: {
    fontSize: Typography.sizes.sm,
    color: Colors.error,
    marginTop: Spacing[1],
  },
})
