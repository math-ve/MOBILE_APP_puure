-- Planification des notifications push via pg_cron + pg_net
-- notify-renewal     : tous les jours 08h00 UTC — renouvellements J-2
-- notify-cartridge   : tous les jours 08h15 UTC — cartouches à 80% / 95%
-- check-push-receipts: tous les jours 08h45 UTC — purge des tokens morts

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'notify-renewal-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://vwlqdrrlggolgdssdwoh.supabase.co/functions/v1/notify-renewal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'c144b56918a2131fad35cc3fa7260b5d680aa3013b4e49c904bf45652d4bbefa'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'notify-cartridge-daily',
  '15 8 * * *',
  $$
  select net.http_post(
    url := 'https://vwlqdrrlggolgdssdwoh.supabase.co/functions/v1/notify-cartridge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'c144b56918a2131fad35cc3fa7260b5d680aa3013b4e49c904bf45652d4bbefa'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'check-push-receipts-daily',
  '45 8 * * *',
  $$
  select net.http_post(
    url := 'https://vwlqdrrlggolgdssdwoh.supabase.co/functions/v1/check-push-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'c144b56918a2131fad35cc3fa7260b5d680aa3013b4e49c904bf45652d4bbefa'
    ),
    body := '{}'::jsonb
  );
  $$
);
