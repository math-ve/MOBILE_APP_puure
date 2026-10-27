import { supabase } from './supabase'
import { track } from './analytics'

// Filtres et cartouches du client (écran « Mon eau ») : lecture, calculs et
// actions. Repris de l'ancien onglet Filtres pour que la logique ne change pas.

export type FilterType = 'robinet' | 'douche' | 'sous-evier'

export type WaterFilter = {
  id: string
  product_name: string
  filter_type: FilterType | 'autre'
  location_label: string | null
  cartridge_lifespan_days: number | null
  created_at: string
  timer: CartridgeTimer | null
}

export type CartridgeTimer = {
  id: string
  filter_id: string
  started_at: string
  expected_duration_days: number
  total_paused_seconds: number | null
  paused_at: string | null
}

const DAY_MS = 86400000

function elapsedMs(t: CartridgeTimer): number {
  const end = t.paused_at ? new Date(t.paused_at).getTime() : Date.now()
  return end - new Date(t.started_at).getTime() - (t.total_paused_seconds ?? 0) * 1000
}

/** Part de la cartouche déjà utilisée, 0–100. */
export function usedPercent(t: CartridgeTimer | null): number {
  if (!t) return 0
  return Math.min(100, Math.max(0, Math.round((elapsedMs(t) / (t.expected_duration_days * DAY_MS)) * 100)))
}

/** Jours restants avant de changer la cartouche (0 = à changer). */
export function daysLeft(t: CartridgeTimer | null): number {
  if (!t) return 0
  return Math.max(0, Math.ceil((t.expected_duration_days * DAY_MS - elapsedMs(t)) / DAY_MS))
}

/** Date à laquelle la cartouche devra être changée. */
export function changeDate(t: CartridgeTimer | null): Date | null {
  if (!t) return null
  return new Date(Date.now() + daysLeft(t) * DAY_MS)
}

/** Seuil d'alerte de la maquette (P05) : 7 jours ou moins. */
export const SOON_DAYS = 7

export async function loadWater(): Promise<{ userId: string; filters: WaterFilter[] } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const [{ data: filters }, { data: timers }] = await Promise.all([
    supabase.from('filters').select('*').eq('user_id', user.id).eq('is_active', true).order('created_at'),
    supabase.from('cartridge_timers').select('*').eq('user_id', user.id).eq('is_active', true),
  ])
  const byFilter = new Map((timers ?? []).map((t: any) => [t.filter_id, t as CartridgeTimer]))
  return {
    userId: user.id,
    filters: (filters ?? []).map((f: any) => ({ ...f, timer: byFilter.get(f.id) ?? null })),
  }
}

export async function addFilter(userId: string, input: {
  name: string; type: FilterType; location: string; lifespanDays: number; installedAt: Date
}) {
  const { data: filter, error } = await supabase.from('filters').insert({
    user_id: userId,
    product_name: input.name.trim(),
    filter_type: input.type,
    location_label: input.location.trim() || null,
    cartridge_lifespan_days: input.lifespanDays,
    is_active: true,
  }).select().single()
  if (error) throw error
  // Le décompte part de la date d'installation choisie.
  const { error: timerError } = await supabase.from('cartridge_timers').insert({
    user_id: userId,
    filter_id: filter.id,
    started_at: input.installedAt.toISOString(),
    expected_duration_days: input.lifespanDays,
    total_paused_seconds: 0,
    is_active: true,
  })
  if (timerError) throw timerError
  track('filter_added', { filter_type: input.type, lifespan_days: input.lifespanDays })
}

export async function replaceCartridge(userId: string, f: WaterFilter) {
  if (f.timer) {
    await supabase.from('cartridge_timers')
      .update({ is_active: false, replaced_at: new Date().toISOString() })
      .eq('id', f.timer.id)
  }
  const { error } = await supabase.from('cartridge_timers').insert({
    user_id: userId,
    filter_id: f.id,
    started_at: new Date().toISOString(),
    expected_duration_days: f.cartridge_lifespan_days ?? f.timer?.expected_duration_days ?? 90,
    total_paused_seconds: 0,
    is_active: true,
  })
  if (error) throw error
  track('cartridge_replaced', { filter_type: f.filter_type, progress: f.timer ? usedPercent(f.timer) : null })
}

/** Pause / reprise du décompte ; à la reprise, la durée de pause est cumulée. */
export async function togglePause(f: WaterFilter) {
  const t = f.timer
  if (!t) return
  if (t.paused_at) {
    const added = Math.max(0, Math.round((Date.now() - new Date(t.paused_at).getTime()) / 1000))
    await supabase.from('cartridge_timers')
      .update({ paused_at: null, total_paused_seconds: (t.total_paused_seconds ?? 0) + added })
      .eq('id', t.id)
    track('cartridge_timer_resumed', { paused_s: added })
  } else {
    await supabase.from('cartridge_timers').update({ paused_at: new Date().toISOString() }).eq('id', t.id)
    track('cartridge_timer_paused')
  }
}

export async function deleteFilter(f: WaterFilter) {
  if (f.timer) await supabase.from('cartridge_timers').update({ is_active: false }).eq('id', f.timer.id)
  await supabase.from('filters').update({ is_active: false }).eq('id', f.id)
  track('filter_removed', { filter_type: f.filter_type })
}
