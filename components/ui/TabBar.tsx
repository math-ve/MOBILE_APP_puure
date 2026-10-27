import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { router } from 'expo-router'
import { ds, typography } from '../../lib/theme'

// Barre de navigation du Puure DS (maquette P04) : pilule blanche flottante,
// 3 entrées égales — Mon eau, Commandes, Support. Entrée active sur bleu pâle.

type IconProps = { color: string }

const DropIcon = ({ color }: IconProps) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)
const BoxIcon = ({ color }: IconProps) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M21 8l-9-5-9 5 9 5 9-5z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3 8v8l9 5 9-5V8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M12 13v8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)
const HeadphonesIcon = ({ color }: IconProps) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M3 14v-2a9 9 0 0 1 18 0v2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M21 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3 15a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)

const TABS: Record<string, { labelKey: string; Icon: (p: IconProps) => React.JSX.Element }> = {
  index: { labelKey: 'tabs:water', Icon: DropIcon },
  orders: { labelKey: 'tabs:orders', Icon: BoxIcon },
  support: { labelKey: 'tabs:support', Icon: HeadphonesIcon },
}

/** Hauteur occupée par la barre (pour réserver l'espace en bas des écrans). */
export const TAB_BAR_SPACE = 130

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { bottom: insets.bottom > 0 ? insets.bottom - 6 : 16 }]}
    >
      {state.routes.filter((r) => TABS[r.name]).map((route) => {
        const focused = state.routes[state.index]?.key === route.key
        const { labelKey, Icon } = TABS[route.name]
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(labelKey)}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!focused && !event.defaultPrevented) {
                Haptics.selectionAsync().catch(() => {})
                navigation.navigate(route.name as never)
              }
            }}
            style={({ pressed }) => [styles.item, focused && styles.itemActive, pressed && !focused && { opacity: 0.7 }]}
          >
            <Icon color={focused ? ds.blue : ds.muted} />
            <Text style={[styles.label, focused && styles.labelActive]}>{t(labelKey)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 68,
    padding: 6,
    borderRadius: 999,
    backgroundColor: ds.raised,
    borderWidth: 1,
    borderColor: ds.line,
    flexDirection: 'row',
    gap: 4,
    shadowColor: '#0C1639',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  item: { flex: 1, height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', gap: 3 },
  itemActive: { backgroundColor: ds.blueSoft },
  label: { fontFamily: typography.fontFamily.medium, fontSize: 13, color: ds.muted },
  labelActive: { color: ds.ink },
})

/**
 * Même barre, pour un écran ouvert par-dessus les onglets (détail de
 * l'abonnement, maquette P08) : l'onglet parent reste en surbrillance.
 */
export function StaticTabBar({ active }: { active: 'index' | 'orders' | 'support' }) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const go = (name: string) => {
    if (name === active) return router.back()
    router.dismissAll()
    router.navigate(name === 'index' ? '/(tabs)' : (`/(tabs)/${name}` as any))
  }
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { bottom: insets.bottom > 0 ? insets.bottom - 6 : 16 }]}>
      {(Object.keys(TABS) as ('index' | 'orders' | 'support')[]).map((name) => {
        const focused = name === active
        const { labelKey, Icon } = TABS[name]
        return (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); go(name) }}
            style={({ pressed }) => [styles.item, focused && styles.itemActive, pressed && !focused && { opacity: 0.7 }]}
          >
            <Icon color={focused ? ds.blue : ds.muted} />
            <Text style={[styles.label, focused && styles.labelActive]}>{t(labelKey)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}
