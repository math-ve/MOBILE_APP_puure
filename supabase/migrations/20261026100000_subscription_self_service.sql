-- ============================================================================
-- Abonnement en libre-service (refonte 42 écrans)
--   1. subscriptions_cache : paiement refusé, lien de carte envoyé, annulation
--   2. Stockage privé des photos de robinet (« Mon filtre ne va pas »)
--   3. Cron sync-subscriptions-daily 07h30 UTC (avant notify-renewal 08h00)
--
-- Prérequis : le secret 'cron_secret' existe déjà dans le Vault (cf. crons stats).
-- À appliquer AVANT de déployer subscription-api et sync-subscriptions-daily.
-- ============================================================================

-- 1. Colonnes ----------------------------------------------------------------
alter table public.subscriptions_cache
  add column if not exists payment_failed_at     timestamptz,
  add column if not exists payment_link_sent_at  timestamptz,
  add column if not exists cancelled_at          timestamptz,
  add column if not exists cancellation_reason   text;

comment on column public.subscriptions_cache.payment_failed_at is
  'Dernier prélèvement refusé (null = pas de problème). Rempli par la synchro Appstle.';
comment on column public.subscriptions_cache.payment_link_sent_at is
  'Dernier e-mail Shopify « changer de carte » envoyé (limite 1 / 24 h).';
comment on column public.subscriptions_cache.cancelled_at is
  'Vraie date d''annulation (Appstle cancelledOn, ou date de l''annulation depuis l''app).';
comment on column public.subscriptions_cache.cancellation_reason is
  'Motif choisi dans l''app : incompatible, stock, price, moving, unwanted, other.';

create index if not exists subscriptions_cache_payment_failed_idx
  on public.subscriptions_cache (user_id) where payment_failed_at is not null;

-- 2. Photos de robinet ---------------------------------------------------------
-- Bucket privé : chaque client n'écrit et ne lit que son dossier <user_id>/.
-- Le support y accède via une URL signée jointe au ticket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-photos', 'support-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "support_photos_insert_own" on storage.objects;
create policy "support_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'support-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "support_photos_select_own" on storage.objects;
create policy "support_photos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'support-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3. Cron de synchro quotidienne ----------------------------------------------
do $$
begin
  perform cron.unschedule('sync-subscriptions-daily');
exception when others then null;
end $$;

select cron.schedule(
  'sync-subscriptions-daily',
  '30 7 * * *',
  $$
  select net.http_post(
    url := 'https://vwlqdrrlggolgdssdwoh.supabase.co/functions/v1/sync-subscriptions-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
