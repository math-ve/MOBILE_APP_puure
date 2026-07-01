import { Text, StyleSheet } from 'react-native'
import theme from '../../lib/theme'

export default function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={styles.title}>{children.toUpperCase()}</Text>
  )
}

const styles = StyleSheet.create({
  title: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 11,
    color: theme.colors.textLight,
    letterSpacing: 1.2,
    marginBottom: 12,
    marginTop: 8,
  },
})
