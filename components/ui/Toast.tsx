import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Typography, Spacing, Shadows } from '../../lib/theme'

export type ToastType = 'success' | 'warning' | 'error'

interface ToastProps {
  message: string
  type: ToastType
  onHide: () => void
}

const CONFIG: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: '#00a341', icon: '✓' },
  warning: { bg: '#ffb74a', icon: '⚠' },
  error:   { bg: '#f83a3a', icon: '✕' },
}

export function Toast({ message, type, onHide }: ToastProps) {
  const translateY = useRef(new Animated.Value(120)).current
  const opacity = useRef(new Animated.Value(0)).current
  const insets = useSafeAreaInsets()
  const { bg, icon } = CONFIG[type]

  useEffect(() => {
    // Slide up + fade in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()

    // Auto-dismiss après 3s
    const timer = setTimeout(hide, 3000)
    return () => clearTimeout(timer)
  }, [])

  const hide = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 120,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => onHide())
  }

  const bottomOffset = Math.max(insets.bottom, 8) + 80

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bg, bottom: bottomOffset },
        { transform: [{ translateY }], opacity },
        Shadows.card,
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.message} numberOfLines={2}>{message}</Text>
      <TouchableOpacity onPress={hide} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing[4],
    right: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    gap: Spacing[3],
    zIndex: 9999,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  message: {
    flex: 1,
    color: '#fff',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  close: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
})
