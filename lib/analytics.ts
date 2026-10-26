/**
 * Analytics — collecte d'usage pour la section « Statistiques » de l'admin.
 *
 * - Événements bufferisés puis insérés par lots dans analytics_events
 *   (RLS : un utilisateur n'écrit que ses propres événements).
 * - Session = période au premier plan ; une nouvelle session démarre après
 *   30 min en arrière-plan. session_end porte la durée en secondes.
 * - À chaque début de session, profiles reçoit l'appareil, la version de
 *   l'app et last_seen_at.
 *
 * Tout est best-effort : aucune erreur d'analytics ne doit remonter à l'UI.
 * Uniquement du JS (pas de module natif) → publiable en mise à jour OTA.
 */
import { AppState, Platform, type AppStateStatus } from 'react-native'
import * as Device from 'expo-device'
import * as Updates from 'expo-updates'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const FLUSH_INTERVAL_MS = 15_000
const MAX_BATCH = 50
const MAX_QUEUE = 200
const SESSION_TIMEOUT_MS = 30 * 60_000
const PUSH_PERMISSION_KEY = 'analytics_push_permission'

type EventRow = {
  client_event_id: string
  user_id: string
  session_id: string | null
  source: 'app'
  name: string
  screen: string | null
  properties: Record<string, unknown>
  platform: string
  app_version: string | null
  created_at: string
}

const appVersion = Constants.expoConfig?.version ?? null
const appBuild =
  (Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber
    : Constants.expoConfig?.android?.versionCode?.toString()) ?? null

let userId: string | null = null
let sessionId: string | null = null
let activeSince = 0      // début de la période au premier plan en cours
let foregroundMs = 0     // temps cumulé au premier plan dans la session
let backgroundedAt = 0
let currentScreen: string | null = null
let queue: EventRow[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let appStateSub: { remove: () => void } | null = null
let flushing = false

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Enregistre un événement (ignoré tant qu'aucun utilisateur n'est connecté). */
export function track(name: string, properties: Record<string, unknown> = {}) {
  if (!userId) return
  queue.push({
    client_event_id: uuid(),
    user_id: userId,
    session_id: sessionId,
    source: 'app',
    name,
    screen: currentScreen,
    properties,
    platform: Platform.OS,
    app_version: appVersion,
    created_at: new Date().toISOString(),
  })
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
  if (queue.length >= MAX_BATCH) void flush()
}

/** Écran affiché (dédoublonné : un même écran consécutif n'est compté qu'une fois). */
export function trackScreen(pathname: string | null | undefined) {
  if (!pathname || pathname === currentScreen) return
  currentScreen = pathname
  track('screen_view')
}

export async function flush() {
  if (flushing || queue.length === 0) return
  flushing = true
  const batch = queue.slice(0, MAX_BATCH)
  try {
    // ignoreDuplicates : un lot déjà reçu (app suspendue par iOS avant la
    // réponse) est renvoyé sans créer de doublon (client_event_id unique).
    const { error } = await supabase.from('analytics_events')
      .upsert(batch, { onConflict: 'client_event_id', ignoreDuplicates: true })
    // En cas d'échec réseau, on garde les événements pour le prochain essai.
    if (!error) queue = queue.slice(batch.length)
  } catch {
    /* réseau indisponible : nouvel essai au prochain flush */
  } finally {
    flushing = false
  }
}

function startSession() {
  sessionId = uuid()
  activeSince = Date.now()
  foregroundMs = 0
  track('session_start', { update_id: Updates.updateId ?? null, channel: Updates.channel ?? null })
  void syncDeviceProfile()
}

function sessionDurationS(): number {
  const current = activeSince > 0 ? Date.now() - activeSince : 0
  return Math.round((foregroundMs + current) / 1000)
}

function endSession() {
  if (!sessionId) return
  track('session_end', { duration_s: sessionDurationS() })
}

function onAppStateChange(state: AppStateStatus) {
  if (state === 'active') {
    // Pas de session_end ici : la durée de l'ancienne session a déjà été
    // envoyée au passage en arrière-plan (sans le temps passé hors de l'app).
    const expired = !sessionId || (backgroundedAt > 0 && Date.now() - backgroundedAt > SESSION_TIMEOUT_MS)
    if (expired) startSession()
    else activeSince = Date.now()
    backgroundedAt = 0
  } else if (state === 'background') {
    backgroundedAt = Date.now()
    // La durée (temps au premier plan) est envoyée tout de suite : l'app peut
    // être tuée en arrière-plan. Les stats retiennent le max par session.
    track('session_end', { duration_s: sessionDurationS(), partial: true })
    if (activeSince > 0) foregroundMs += Date.now() - activeSince
    activeSince = 0
    void flush()
  }
}

/** Appareil, version, permission push et activité → profiles. */
async function syncDeviceProfile() {
  const id = userId
  if (!id) return
  try {
    const { status } = await Notifications.getPermissionsAsync()
    const previous = await AsyncStorage.getItem(PUSH_PERMISSION_KEY)
    if (previous && previous !== status) track('push_permission_changed', { status, previous })
    await AsyncStorage.setItem(PUSH_PERMISSION_KEY, status)

    const now = new Date().toISOString()
    await supabase.from('profiles').update({
      platform: Platform.OS,
      os_version: Device.osVersion ?? null,
      device_model: Device.modelName ?? null,
      app_version: appVersion,
      app_build: appBuild,
      update_id: Updates.updateId ?? null,
      push_permission: status,
      last_seen_at: now,
    }).eq('id', id)
    await supabase.from('profiles').update({ first_seen_at: now }).eq('id', id).is('first_seen_at', null)
  } catch {
    /* best-effort */
  }
}

/** À appeler quand une session Supabase est disponible (connexion / refresh). */
export function identify(id: string) {
  if (userId === id) return
  userId = id
  if (!flushTimer) flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS)
  if (!appStateSub) appStateSub = AppState.addEventListener('change', onAppStateChange)
  startSession()
}

/** Déconnexion : on envoie ce qui reste puis on oublie l'utilisateur. */
export async function reset() {
  endSession()
  await flush()
  userId = null
  sessionId = null
  currentScreen = null
  queue = []
}

const LAST_OPENED_KEY = 'analytics_last_opened_notification'

/** Tap sur une notification push : ouverture mesurée dans notification_logs. */
export async function trackNotificationOpened(data: Record<string, unknown> | undefined) {
  const notificationId = typeof data?.notification_id === 'string' ? data.notification_id : null
  try {
    // App lancée par le tap (démarrage à froid) : la session Supabase n'est
    // pas encore restaurée. getSession() attend la restauration ; sans ça,
    // l'update part sans JWT et la RLS le refuse silencieusement.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    identify(session.user.id)

    // getLastNotificationResponseAsync renvoie le même tap à chaque lancement :
    // on ne compte qu'une fois chaque notification.
    if (notificationId && (await AsyncStorage.getItem(LAST_OPENED_KEY)) === notificationId) return
    if (notificationId) await AsyncStorage.setItem(LAST_OPENED_KEY, notificationId)

    track('notification_opened', {
      notification_id: notificationId,
      type: data?.type ?? null,
      campaign_id: data?.campaign_id ?? null,
    })
    if (!notificationId) return
    await supabase.from('notification_logs')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', notificationId)
      .is('opened_at', null)
  } catch {
    /* best-effort */
  }
}

/** Erreurs JS non gérées → app_error (compteur de santé dans l'admin). */
export function installErrorTracking() {
  const errorUtils = (global as any).ErrorUtils
  if (!errorUtils?.getGlobalHandler) return
  const previous = errorUtils.getGlobalHandler()
  errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    track('app_error', { message: String(error?.message ?? error).slice(0, 300), fatal: !!isFatal })
    void flush()
    previous?.(error, isFatal)
  })
}
