import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Svg, { Circle, Path } from 'react-native-svg'
import Logo from '../ui/Logo'
import { ds } from '../../lib/theme'
import { hasUnreadNotifications } from '../../lib/notificationsInbox'

// En-tête des onglets (maquettes P04, P10, P12) : logo à gauche, cloche
// (pastille bleue s'il y a du nouveau) et réglages à droite.

export default function AppHeader() {
  const { t } = useTranslation()
  const [unread, setUnread] = useState(false)

  useFocusEffect(useCallback(() => {
    hasUnreadNotifications().then(setUnread).catch(() => {})
  }, []))

  return (
    <View style={styles.row}>
      <Logo width={77.5} />
      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push('/notifications')}
          style={styles.btn}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={unread ? t('home:notificationsUnreadA11y') : t('home:notificationsA11y')}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" stroke={ds.blue} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" stroke={ds.blue} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          {unread && <View style={styles.dot} />}
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings')}
          style={styles.btn}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('settings:openA11y')}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={3} stroke={ds.blue} strokeWidth={1.8} />
            <Path
              d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
              stroke={ds.blue}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 4 },
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: ds.blue },
})
