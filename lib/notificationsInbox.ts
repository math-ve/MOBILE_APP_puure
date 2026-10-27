import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

// Centre de notifications (maquette P14) : notifications reçues par le client
// (notification_logs) et repère « déjà vu » local (pastille de la cloche).

export const NOTIF_LAST_SEEN_KEY = 'notifications_last_seen'

export type InboxNotification = {
  id: string
  title: string
  body: string
  sent_at: string
  type: string | null
  data: Record<string, any> | null
}

export async function loadNotifications(limit = 30): Promise<InboxNotification[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('notification_logs')
    .select('id, title, body, sent_at, type, data')
    .eq('user_id', user.id)
    .order('sent_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as InboxNotification[]
}

export async function lastSeenAt(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(NOTIF_LAST_SEEN_KEY)
    return v ? new Date(v).getTime() : 0
  } catch {
    return 0
  }
}

export async function markNotificationsSeen() {
  try { await AsyncStorage.setItem(NOTIF_LAST_SEEN_KEY, new Date().toISOString()) } catch { /* stockage indisponible */ }
}

export async function hasUnreadNotifications(): Promise<boolean> {
  const [list, seen] = await Promise.all([loadNotifications(1), lastSeenAt()])
  return list.length > 0 && new Date(list[0].sent_at).getTime() > seen
}
