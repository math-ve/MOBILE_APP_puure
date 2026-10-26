-- ============================================================================
-- Analytics — collecte des données d'usage de l'app
--
-- Alimente la section « Statistiques » du dashboard admin (puure-mobile-admin).
--   - profiles            : appareil, version de l'app, activité (first/last seen)
--   - analytics_events    : événements app (écrans, sessions, actions) et
--                           serveur (connexion OTP, actions d'abonnement, push)
--   - notification_logs   : ouverture (tap) et statut de distribution Expo
--
-- Lecture réservée aux admins (is_admin()). L'app n'écrit que ses propres
-- événements ; les Edge Functions écrivent en service role (RLS contournée).
-- ============================================================================

-- ── profiles : appareil + activité ──────────────────────────────────────────
alter table public.profiles
  add column if not exists platform text,          -- ios | android
  add column if not exists os_version text,
  add column if not exists device_model text,
  add column if not exists app_version text,       -- ex: 1.0.0
  add column if not exists app_build text,         -- ex: 11
  add column if not exists update_id text,         -- id de la mise à jour OTA (expo-updates)
  add column if not exists push_permission text,   -- granted | denied | undetermined
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz;

create index if not exists profiles_last_seen_at_idx on public.profiles (last_seen_at);

-- ── analytics_events ────────────────────────────────────────────────────────
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  session_id uuid,
  source text not null default 'app' check (source in ('app', 'server')),
  name text not null check (char_length(name) between 1 and 64),
  screen text check (screen is null or char_length(screen) <= 128),
  properties jsonb not null default '{}'::jsonb check (pg_column_size(properties) <= 4096),
  platform text,
  app_version text
);

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at);
create index if not exists analytics_events_name_created_at_idx on public.analytics_events (name, created_at);
create index if not exists analytics_events_user_created_at_idx on public.analytics_events (user_id, created_at);
create index if not exists analytics_events_session_idx on public.analytics_events (session_id);

alter table public.analytics_events enable row level security;

-- L'app insère uniquement ses propres événements, en source 'app'.
drop policy if exists "users insert own app events" on public.analytics_events;
create policy "users insert own app events" on public.analytics_events
  for insert to authenticated
  with check (source = 'app' and user_id = auth.uid());

drop policy if exists "admins read analytics_events" on public.analytics_events;
create policy "admins read analytics_events" on public.analytics_events
  for select using (public.is_admin());

-- ── notification_logs : ouverture + distribution ────────────────────────────
alter table public.notification_logs
  add column if not exists opened_at timestamptz,          -- tap sur la notification
  add column if not exists delivery_status text,           -- ok | error (receipt Expo)
  add column if not exists delivery_error text,            -- ex: DeviceNotRegistered
  add column if not exists receipt_checked_at timestamptz;

create index if not exists notification_logs_sent_at_idx on public.notification_logs (sent_at);
create index if not exists notification_logs_user_sent_at_idx on public.notification_logs (user_id, sent_at);

-- Les admins lisent tous les logs (stats). Les utilisateurs gardent leurs
-- policies existantes (lecture + mise à jour de leurs propres lignes).
drop policy if exists "admins read notification_logs" on public.notification_logs;
create policy "admins read notification_logs" on public.notification_logs
  for select using (public.is_admin());

-- Dédoublonnage : l'app renvoie un lot si iOS l'a suspendue avant la réponse
-- du serveur. Chaque événement porte un id généré côté app (ON CONFLICT DO NOTHING).
alter table public.analytics_events add column if not exists client_event_id uuid;
create unique index if not exists analytics_events_client_event_id_key on public.analytics_events (client_event_id);
