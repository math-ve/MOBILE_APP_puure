import { View, Text, StyleSheet, ViewStyle } from 'react-native'
import theme from '../../lib/theme'

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'lime' | 'default'

interface BadgeProps {
  label: string
  variant?: BadgeVariant
  style?: ViewStyle
}

const VARIANTS = {
  success: { bg: 'rgba(30,187,110,0.12)', text: '#1EBB6E' },
  warning: { bg: 'rgba(255,92,0,0.10)', text: '#ff5c00' },
  error: { bg: 'rgba(227,44,43,0.10)', text: '#e32c2b' },
  info: { bg: 'rgba(39,100,255,0.10)', text: '#2764FF' },
  neutral: { bg: 'rgba(35,48,86,0.08)', text: '#3D5278' },
  lime: { bg: theme.colors.lime, text: theme.colors.white },
  default: { bg: theme.colors.bluePale, text: theme.colors.blueFooter },
}

export default function Badge({ label, variant = 'neutral', style }: BadgeProps) {
  const v = VARIANTS[variant]
  return (
    <View style={[styles.base, { backgroundColor: v.bg }, style]}>
      <Text style={[styles.label, { color: v.text }]}>{label.toUpperCase()}</Text>
    </View>
  )
}

// Named export alias for backward compatibility
export { Badge }

// Legacy Tag component
interface TagProps {
  label: string
  dark?: boolean
  style?: ViewStyle
}

export function Tag({ label, dark = false, style }: TagProps) {
  return (
    <View style={[
      styles.tag,
      dark ? styles.tagDark : styles.tagLight,
      style,
    ]}>
      <Text style={[styles.tagText, dark ? styles.tagTextDark : styles.tagTextLight]}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.full,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  tagLight: {
    borderColor: theme.colors.blueMedium,
    backgroundColor: 'transparent',
  },
  tagDark: {
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'transparent',
  },
  tagText: {
    fontSize: 12,
    fontFamily: theme.typography.fontFamily.semiBold,
    letterSpacing: 1.4,
  },
  tagTextLight: { color: theme.colors.blueMedium },
  tagTextDark: { color: 'rgba(255,255,255,0.92)' },
})
