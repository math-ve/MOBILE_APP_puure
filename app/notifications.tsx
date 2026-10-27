import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { FlowScreen } from '../components/ds/Flow'
import Glyph, { GlyphName } from '../components/ds/Glyph'
import { ds, typography } from '../lib/theme'
import { formatDate } from '../lib/i18n/format'
import { track } from '../lib/analytics'
import { InboxNotification, lastSeenAt, loadNotifications, markNotificationsSeen } from '../lib/notificationsInbox'

// Notifications (maquette P14) : une carte, une ligne par notification,
// point bleu pour celles arrivées depuis la dernière visite.

function iconFor(n: InboxNotification): GlyphName {
  const type = `${n.type ?? ''} ${n.data?.type ?? ''}`
  if (/renewal|subscription/.test(type)) return 'calendar'
  if (/payment/.test(type)) return 'card'
  if (/cartridge/.test(type)) return 'drop'
  return 'box'
}

export default function NotificationsScreen() {
  const { t } = useTranslation()
  const [items, setItems] = useState<InboxNotification[] | null>(null)
  const [seen, setSeen] = useState(0)

  useFocusEffect(useCallback(() => {
    let alive = true
    Promise.all([loadNotifications(), lastSeenAt()]).then(([list, last]) => {
      if (!alive) return
      setItems(list)
      setSeen(last)
      track('notification_center_opened', { had_unread: list.some((n) => new Date(n.sent_at).getTime() > last) })
      markNotificationsSeen()
    }).catch(() => setItems([]))
    return () => { alive = false }
  }, []))

  const relative = (iso: string) => {
    const d = new Date(iso)
    const mins = Math.round((Date.now() - d.getTime()) / 60000)
    if (mins < 1) return t('notifications:now')
    if (mins < 60) return t('notifications:minutesAgo', { count: mins })
    const hours = Math.round(mins / 60)
    if (hours < 24) return t('notifications:hoursAgo', { count: hours })
    const days = Math.floor(hours / 24)
    if (days === 1) return t('notifications:yesterday')
    if (days < 7) {
      const w = formatDate(d, { weekday: 'long' })
      return w.charAt(0).toLocaleUpperCase() + w.slice(1)
    }
    return formatDate(d, { day: 'numeric', month: 'long' })
  }

  const open = (n: InboxNotification) => {
    let screen = n.data?.screen
    if (typeof screen !== 'string' || !screen) return
    if (screen === '/(tabs)/subscription') screen = '/(tabs)/orders'
    router.push(screen as any)
  }

  return (
    <FlowScreen title={t('notifications:title')} onBack={() => router.back()}>
      {items === null ? (
        <ActivityIndicator color={ds.blue} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Glyph name="mail" size={28} color={ds.blue} /></View>
          <Text style={styles.emptyText}>{t('notifications:empty')}</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {items.map((n, i) => {
            const unread = new Date(n.sent_at).getTime() > seen
            const tappable = typeof n.data?.screen === 'string' && !!n.data.screen
            return (
              <Pressable
                key={n.id}
                onPress={() => open(n)}
                disabled={!tappable}
                accessibilityRole={tappable ? 'button' : undefined}
                style={({ pressed }) => [styles.row, i < items.length - 1 && styles.rowDivider, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.icon}><Glyph name={iconFor(n)} size={20} color={ds.blue} /></View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title}>{n.title}</Text>
                    {unread && <View style={styles.dot} />}
                  </View>
                  <Text style={styles.body}>{n.body}</Text>
                  <Text style={styles.time}>{relative(n.sent_at)}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      )}
    </FlowScreen>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: ds.radius.card, paddingHorizontal: 18 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 18 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: ds.line },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: ds.blueSoft, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },
  dot: { width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: ds.blue },
  body: { fontFamily: typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: ds.body },
  time: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: ds.muted },
  empty: { alignItems: 'center', gap: 14, paddingTop: 60 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: ds.blueSoft, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.muted, textAlign: 'center' },
})
