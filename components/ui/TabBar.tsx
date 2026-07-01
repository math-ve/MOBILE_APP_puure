import { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import theme from '../../lib/theme'

// ─── Icônes SVG ────────────────────────────────────────────

interface IconProps {
  color: string
  size: number
}

function HomeIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 11.5 12 4l9 7.5M5 10.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8.5M10 20v-5h4v5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function BoxIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8ZM4 8l2-4h12l2 4M4 12h16"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function RefreshIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21.5 4.5v5.5H16M2.5 19.5V14H8M3.8 9a8.5 8.5 0 0 1 14-3.2l3.7 3.7M2.5 14l3.7 3.7a8.5 8.5 0 0 0 14-3.2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function DropIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.7 17.66 8.35a8 8 0 1 1-11.31 0L12 2.7Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function HeadphonesIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5ZM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// ─── Config onglets ────────────────────────────────────────

const TABS: Record<string, { label: string; Icon: (p: IconProps) => React.JSX.Element }> = {
  index: { label: 'Accueil', Icon: HomeIcon },
  orders: { label: 'Commandes', Icon: BoxIcon },
  subscription: { label: 'Abonnement', Icon: RefreshIcon },
  filters: { label: 'Filtres', Icon: DropIcon },
  support: { label: 'Support', Icon: HeadphonesIcon },
}

// ─── Item d'onglet ─────────────────────────────────────────

interface TabItemProps {
  routeName: string
  isFocused: boolean
  onPress: () => void
  onLayout: (e: any) => void
}

function TabItem({ routeName, isFocused, onPress, onLayout }: TabItemProps) {
  const tab = TABS[routeName]
  const iconScale = useRef(new Animated.Value(1)).current
  const labelOpacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current
  const labelTx = useRef(new Animated.Value(isFocused ? 0 : -8)).current
  const pressScale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (isFocused) {
      // Pop de l'icône qui devient active
      iconScale.setValue(0.7)
      Animated.spring(iconScale, { toValue: 1, tension: 200, friction: 8, useNativeDriver: true }).start()
      // Fade-in du label
      labelOpacity.setValue(0)
      labelTx.setValue(-8)
      Animated.parallel([
        Animated.timing(labelOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(labelTx, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start()
    }
  }, [isFocused])

  const handlePressIn = () => {
    if (!isFocused) {
      pressScale.setValue(0.85)
      Animated.spring(pressScale, { toValue: 1, tension: 300, friction: 10, useNativeDriver: true }).start()
    }
  }

  if (!tab) return null
  const { label, Icon } = tab

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onLayout={onLayout}
      style={[styles.tab, isFocused ? styles.tabActive : styles.tabInactive]}
      activeOpacity={0.8}
    >
      <Animated.View style={{ transform: [{ scale: isFocused ? iconScale : pressScale }] }}>
        <Icon
          color={isFocused ? theme.colors.white : theme.colors.textLight}
          size={isFocused ? 20 : 22}
        />
      </Animated.View>
      {isFocused && (
        <Animated.Text
          style={[styles.label, { opacity: labelOpacity, transform: [{ translateX: labelTx }] }]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
      )}
    </TouchableOpacity>
  )
}

// ─── TabBar ────────────────────────────────────────────────

export default function TabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets()
  const layouts = useRef<{ x: number; width: number }[]>([]).current
  const indicatorLeft = useRef(new Animated.Value(0)).current
  const indicatorWidth = useRef(new Animated.Value(0)).current
  const initialized = useRef(false)

  const moveIndicator = (index: number) => {
    const layout = layouts[index]
    if (!layout) return
    if (!initialized.current) {
      indicatorLeft.setValue(layout.x)
      indicatorWidth.setValue(layout.width)
      initialized.current = true
      return
    }
    Animated.parallel([
      Animated.spring(indicatorLeft, { toValue: layout.x, tension: 60, friction: 9, useNativeDriver: false }),
      Animated.spring(indicatorWidth, { toValue: layout.width, tension: 60, friction: 9, useNativeDriver: false }),
    ]).start()
  }

  useEffect(() => {
    moveIndicator(state.index)
  }, [state.index])

  const handleLayout = (index: number) => (e: any) => {
    layouts[index] = {
      x: e.nativeEvent.layout.x,
      width: e.nativeEvent.layout.width,
    }
    // L'onglet actif change de taille en s'élargissant — recale l'indicateur
    if (index === state.index) moveIndicator(index)
  }

  const handlePress = (route: any, isFocused: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    })
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name)
    }
  }

  return (
    <View
      style={[
        styles.container,
        { bottom: insets.bottom > 0 ? insets.bottom + 16 : 24 },
      ]}
    >
      {/* Indicateur navy glissant */}
      <Animated.View
        style={[styles.indicator, { left: indicatorLeft, width: indicatorWidth }]}
      />
      {state.routes.map((route: any, index: number) => (
        <TabItem
          key={route.key}
          routeName={route.name}
          isFocused={state.index === index}
          onPress={() => handlePress(route, state.index === index)}
          onLayout={handleLayout(index)}
        />
      ))}
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.full,
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: theme.colors.navy,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },
  indicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    backgroundColor: theme.colors.navy,
    borderRadius: theme.radius.full,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    gap: 8,
  },
  tabActive: {
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  tabInactive: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  label: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.sm,
    color: theme.colors.white,
    letterSpacing: -0.2,
  },
})
