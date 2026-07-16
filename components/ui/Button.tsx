import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native'
import { Animated } from 'react-native'
import { useRef } from 'react'
import theme from '../../lib/theme'

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'outline' | 'destructive' | 'ghost'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  size?: 'sm' | 'md' | 'lg'
  style?: ViewStyle
}

export default function Button({
  label, onPress, variant = 'primary',
  loading, disabled, fullWidth = true, size = 'md', style
}: ButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start()
  }

  const variantStyles = {
    primary: { bg: theme.colors.navy, text: theme.colors.white, border: 'transparent' },
    secondary: { bg: theme.colors.white, text: theme.colors.navy, border: 'transparent' },
    accent: { bg: theme.colors.lime, text: theme.colors.white, border: 'transparent' },
    outline: { bg: 'transparent', text: theme.colors.navy, border: theme.colors.navy },
    destructive: { bg: 'rgba(227,44,43,0.08)', text: theme.colors.error, border: theme.colors.error },
    ghost: { bg: 'transparent', text: theme.colors.textMid, border: 'transparent' },
  }

  const sizeStyles = {
    sm: { paddingVertical: 8, paddingHorizontal: 16, fontSize: theme.typography.size.sm },
    md: { paddingVertical: 14, paddingHorizontal: 24, fontSize: theme.typography.size.base },
    lg: { paddingVertical: 18, paddingHorizontal: 32, fontSize: theme.typography.size.md },
  }

  const vs = variantStyles[variant]
  const ss = sizeStyles[size]

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, fullWidth && { width: '100%' }]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={0.85}
        style={[
          styles.base,
          {
            backgroundColor: vs.bg,
            borderColor: vs.border,
            borderWidth: variant === 'outline' || variant === 'destructive' ? 1.5 : 0,
            paddingVertical: ss.paddingVertical,
            paddingHorizontal: ss.paddingHorizontal,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        {loading
          ? <ActivityIndicator color={vs.text} size="small" />
          : <Text style={[styles.label, { color: vs.text, fontSize: ss.fontSize }]}>{label}</Text>
        }
      </TouchableOpacity>
    </Animated.View>
  )
}

// Named export alias for backward compatibility
export { Button }

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  label: {
    fontFamily: theme.typography.fontFamily.bold,
    letterSpacing: -0.3,
  },
})
