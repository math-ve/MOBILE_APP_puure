import { View, ViewStyle, StyleSheet } from 'react-native'
import theme from '../../lib/theme'

interface CardProps {
  children: React.ReactNode
  style?: ViewStyle
  variant?: 'default' | 'navy' | 'elevated'
  padding?: number
}

export default function Card({ children, style, variant = 'default', padding = 20 }: CardProps) {
  const variantStyles = {
    default: { backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border },
    navy: { backgroundColor: theme.colors.navy, borderWidth: 0 },
    elevated: { backgroundColor: theme.colors.white, borderWidth: 0 },
  }

  return (
    <View style={[
      styles.base,
      variantStyles[variant],
      variant === 'elevated' ? theme.shadows.card : theme.shadows.light,
      { padding },
      style,
    ]}>
      {children}
    </View>
  )
}

// Named export alias for backward compatibility
export { Card }

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius['2xl'],
  },
})
