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
puure-mobile-v2/            ← app React Native (maquette Puure DS, 42 écrans P01 → P42)
  app/
    _layout.tsx             ← root layout, deep links, Stack des écrans hors onglets
    (auth)/login.tsx        ← P01 e-mail (vidéo) → P02 code 6 chiffres
    (auth)/notifications-intro.tsx ← P03
    (tabs)/                 ← 3 onglets : Mon eau (index), Commandes (orders), Support (support)
    subscription-detail.tsx ← P08/P19/P20/P33, barre d'onglets fixe (StaticTabBar « Commandes »)
    tracking.tsx, tracking-history.tsx ← P11/P15/P17, P16
    cancel-subscription.tsx ← P27 → P30, P37 → P39, confirmation P22 en feuille
    add-filter.tsx (P07), filter-help.tsx (P34), notifications.tsx (P14), settings.tsx (P13), done.tsx (P35/P41/P42)
  components/ds/            ← Puure DS : Sheet, PillButton, Field/GroupCard, RadioRow, ChoiceRow, Flow (FlowScreen, Hero…), Glyph, AppHeader
  components/subscription/  ← feuilles P09, P18, P21, P25, P31, P40 + PlanCard
  components/orders/, components/water/
  lib/                      ← supabase, subscriptionApi, support, plan, orders, tracking, water, i18n…

../supabase/ (mobile-app)   ← backend Supabase CLI (copie miroir de puure-mobile-v2/supabase)
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

## Abonnement en libre-service (refonte 42 écrans, branche refonte-libre-service)
- **Toutes** les actions d'abonnement de l'app passent par `subscription-api` (client `lib/subscriptionApi.ts`) : client identifié par son jeton, propriété du contrat et de la livraison vérifiée. Ne plus appeler get-subscription-detail / subscription-action / manage-subscription / sync-subscriptions (aucune vérification de propriétaire — à retirer)
- Actions : detail, sync, skip, order-now, reschedule, update-frequency, update-address, apply-discount, pause, resume, cancel (motif + note Appstle), payment-link (e-mail Shopify, 1 / 24 h), retention-discount (inactif tant que le secret `RETENTION_DISCOUNT_CODE` n'est pas défini ; `RETENTION_DISCOUNT_PERCENT`, 20 par défaut)
- Code partagé : `supabase/functions/_shared/` (http, appstle + synchro du cache, messages traduits)
- Cron `sync-subscriptions-daily` 07h30 UTC : synchro Appstle + détection des paiements refusés (`subscriptions_cache.payment_failed_at`) + notification unique (si activée)
- Rappels de renouvellement = **campagnes de l'admin** (`notification_campaigns` + `notification_templates`, exécutées par `notification-runner` via `notification-scheduler` toutes les 5 min). `notify-renewal` / `notify-cartridge` ne sont plus planifiées. Campagne J-3 (ex J-2) : texte FR/EN/DE ; `template.screen` accepte `{{contract_id}}` → passer à `/subscription-detail?contractId={{contract_id}}&open=reschedule` une fois l'app ≥ refonte publiée (en attendant `/(tabs)/orders`)
- Notification « paiement refusé » : coupée tant que le secret `PAYMENT_FAILED_PUSH` ≠ `on` (la détection tourne quand même)
- Anciennes fonctions (get-subscription-detail, manage-subscription, subscription-action, sync-subscriptions, sync-orders) : sécurisées en production par `_shared/legacyGuard.ts` — sources déployées dans `supabase/legacy-prod/` (les copies de `supabase/functions/` diffèrent de la prod, ne pas les redéployer)
- Migration `20261026100000_subscription_self_service.sql` : colonnes paiement/annulation, bucket privé `support-photos`, cron 07h30
- Écrans : `app/cancel-subscription.tsx` (motif → offre → confirmation en feuille), `app/done.tsx` (états de fin), `app/filter-help.tsx` (photo du robinet), « problème de colis » = `components/orders/ParcelProblemSheet.tsx` ; feuilles dans `components/subscription/` ; composants Puure DS dans `components/ds/` (tokens `ds` de lib/theme.ts)
- `subscription-detail` accepte `open=reschedule|payment|address` et se charge sans `subData`
- Photo : `expo-image-picker` (build ≥ 1.0.2) chargé via `lib/photoPicker.ts` seulement s'il est présent → le JS reste compatible OTA avec 1.0.0 / 1.0.1
- Tickets support : `lib/support.ts` (worker Cloudflare → Zendesk), photo = lien signé 30 jours

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