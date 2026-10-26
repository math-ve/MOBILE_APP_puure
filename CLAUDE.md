# Puure Filters — Application Mobile

## Stack
- React Native + Expo SDK 54 (Expo Go compatible)
- Supabase (auth, database, edge functions)
- TypeScript

## Infos projet
- Supabase URL: https://vwlqdrrlggolgdssdwoh.supabase.co
- Supabase Project ID: vwlqdrrlggolgdssdwoh
- Shopify store: tqjtej-jq.myshopify.com
- Bundle ID: com.puurefilters.mobile
- Deep link scheme: puure://

## Structure
```
puure-mobile-v2/          ← app React Native
  app/
    _layout.tsx           ← root layout, gestion deep links
    (auth)/
      _layout.tsx
      login.tsx           ← écran login avec OTP 6 chiffres
    (tabs)/
      _layout.tsx         ← navigation tabs
      index.tsx           ← dashboard accueil
      orders.tsx          ← historique commandes (placeholder)
      subscription.tsx    ← abonnement (placeholder)
      filters.tsx         ← mes filtres + timer cartouche (placeholder)
      support.tsx         ← support Zendesk (placeholder)
  lib/
    supabase.ts           ← client Supabase configuré

mobile-app/               ← backend Supabase CLI
  supabase/
    functions/
      magic-link/         ← Edge Function auth OTP
        index.ts
```

## Authentification
- Flow OTP 6 chiffres (pas magic link) pour compatibilité Expo Go
- L'utilisateur entre son email → reçoit un code à 6 chiffres → se connecte
- Vérification que l'email est bien un client Shopify avant d'envoyer le code
- Edge Function: POST /functions/v1/magic-link
  - body: { email } → envoie le code
  - body: { email, action: "verify", token: "123456" } → vérifie et retourne session

## Base de données Supabase
Tables: profiles, filters, cartridge_timers, subscriptions_cache, orders_cache, support_tickets, notification_logs
RLS activé sur toutes les tables.

## Secrets Supabase (déjà configurés)
- SHOPIFY_CLIENT_ID
- SHOPIFY_CLIENT_SECRET
- SHOPIFY_STORE_DOMAIN
- SHOPIFY_ADMIN_TOKEN
- RESEND_API_KEY
- EXPO_ACCESS_TOKEN
- CRON_SECRET (header x-cron-secret des fonctions cron)

## Notifications push
- Token : enregistré au login dans profiles.push_token (échoue silencieusement en Expo Go — dev build requis pour tester)
- `send-notification` : envoi via API Expo Push + log dans notification_logs. Exige le service role en Bearer (anon refusée)
- Fonctions cron (déployées --no-verify-jwt, protégées par x-cron-secret = CRON_SECRET) :
  - `notify-renewal` 08h00 UTC — renouvellement abonnement J-2 (dédup par jour)
  - `notify-cartridge` 08h15 UTC — cartouche à 80% et 95% (dédup par timer+seuil via data->>timer_id)
  - `check-push-receipts` 08h45 UTC — purge les push_token morts (DeviceNotRegistered)
- Crons planifiés via pg_cron (migration supabase/migrations/20260611090000_notifications_cron.sql)
- `sync-orders` notifie "Commande expédiée" sur transition de statut → fulfilled
- App : channel Android "default", badge remis à 0 à l'ouverture, tap sur notif → router.push(data.screen), push_token nettoyé au signOut, centre de notifications dans la cloche du dashboard (notification_logs + AsyncStorage notifications_last_seen)
- iOS : clé APNs configurée (notifications reçues sur TestFlight depuis l'admin)
- ⚠️ Restant : credentials FCM Android (google-services.json + EAS) à configurer avant une sortie Play Store

## Analytics (stats admin)
- `lib/analytics.ts` : `track(name, props)`, `trackScreen`, `identify`/`reset`, `trackNotificationOpened` — événements bufferisés dans `analytics_events` (RLS : l'utilisateur n'écrit que les siens), JS uniquement (OTA possible)
- Sessions = temps au premier plan (nouvelle session après 30 min en arrière-plan) ; `profiles` reçoit appareil, version, `last_seen_at`
- `send-notification` ajoute `data.notification_id` (= id du log) → `notification_logs.opened_at` au tap ; `check-push-receipts` remplit `delivery_status`
- `magic-link` trace l'entonnoir de connexion (`auth_otp_*`)
- Migration : `supabase/migrations/20261016100000_analytics_tracking.sql` — à appliquer AVANT de déployer send-notification
- Dashboard + déploiement complet : `puure-mobile-admin/docs/STATS.md`

## Email
- Domaine vérifié: noreply.puurefilters.com
- From: noreply@noreply.puurefilters.com

## Commandes utiles
```bash
# Lancer l'app
cd puure-mobile-v2 && npx expo start

# Déployer une edge function
cd mobile-app && supabase functions deploy magic-link

# Lier au projet Supabase
supabase link --project-ref vwlqdrrlggolgdssdwoh
```

## Prochaines étapes
1. Écran commandes (orders.tsx) — fetch depuis orders_cache + Shopify sync
2. Écran abonnement (subscription.tsx) — fetch depuis subscriptions_cache + Appstle sync
3. Timer cartouche (filters.tsx) — démarrer/arrêter/remplacer cartouche
4. Support (support.tsx) — créer ticket Zendesk
5. Edge Functions sync — sync commandes Shopify, sync abonnements Appstle
6. Notifications push — Expo + FCM + APNs
7. Edge Function Zendesk — créer tickets