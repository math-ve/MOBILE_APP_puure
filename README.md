# Puure Filters — Application mobile

Application mobile React Native / Expo pour les clients Puure Filters : suivi des commandes,
gestion des abonnements, timers de cartouches, support et notifications push.

Ce dépôt contient **l'application mobile** (`app/`, `lib/`, `components/`, `hooks/`) **et**
le **backend Supabase** (`supabase/functions/`, `supabase/migrations/`).

---

## Stack

- **Front** : React Native + Expo SDK 54 (compatible Expo Go, sauf notifications push)
- **Navigation** : Expo Router (typed routes)
- **Backend** : Supabase (Auth, Postgres, Edge Functions en Deno)
- **Intégrations** : Shopify (commandes), Appstle (abonnements), Resend (emails), Expo Push (notifs), Cloudflare Worker (support → Zendesk)
- **Langage** : TypeScript

## Infos projet

| | |
|---|---|
| Supabase URL | `https://vwlqdrrlggolgdssdwoh.supabase.co` |
| Supabase Project ID | `vwlqdrrlggolgdssdwoh` |
| EAS Project ID | `c1ed5ce2-a996-401f-a527-1f1705efef9e` |
| Bundle ID (iOS/Android) | `com.puurefilters.mobile` |
| Deep link scheme | `puure://` |
| Boutique Shopify | `tqjtej-jq.myshopify.com` |
| Domaine email (Resend) | `noreply.puurefilters.com` (from : `noreply@noreply.puurefilters.com`) |

> La clé Supabase dans [lib/supabase.ts](lib/supabase.ts) est la clé **anon** (publique) — elle est
> destinée à être embarquée dans l'app, aucun secret côté mobile. Aucun fichier `.env` n'est requis
> pour lancer l'app.

---

## Démarrage rapide (app)

```bash
npm install
npx expo start
```

Puis scanner le QR code avec **Expo Go** (iOS/Android).

Scripts disponibles :

```bash
npm start        # expo start
npm run ios      # build natif iOS (nécessite un dev build)
npm run android  # build natif Android
npm run web      # version web
```

### Se connecter (auth)

Flow OTP à 6 chiffres (pas de magic link, pour compatibilité Expo Go) :

1. L'utilisateur saisit son email.
2. Le backend vérifie que c'est bien un **client Shopify**, puis envoie un code à 6 chiffres par email.
3. L'utilisateur saisit le code → session créée.

Pour tester, il faut un email présent comme client dans la boutique Shopify.

---

## Structure

```
puure-mobile-v2/
├── app/                          # écrans (Expo Router)
│   ├── _layout.tsx               # root : auth, deep links, notifs push, syncs auto
│   ├── (auth)/login.tsx          # login OTP 6 chiffres
│   ├── (tabs)/
│   │   ├── index.tsx             # dashboard (timers, abonnement, dernière commande, notifs)
│   │   ├── orders.tsx            # historique commandes
│   │   ├── subscription.tsx      # liste des abonnements
│   │   ├── filters.tsx           # filtres + timers de cartouches
│   │   └── support.tsx           # formulaire support
│   ├── subscription-detail.tsx   # détail abonnement (3 onglets)
│   └── tracking.tsx              # suivi de colis
├── components/ui/                # TabBar, Toast, ProgressRing, Badge, Button, Input, Card…
├── hooks/                        # hooks partagés
├── lib/
│   ├── supabase.ts               # client Supabase (URL + clé anon)
│   └── theme.ts                  # thème (couleurs, typo Instrument Sans)
├── assets/                       # icônes, splash, vidéos
├── supabase/                     # ⬇️ BACKEND (voir section dédiée)
│   ├── config.toml
│   ├── functions/                # 13 edge functions Deno
│   └── migrations/               # migrations SQL (dont crons pg_cron)
├── app.json                      # config Expo
└── eas.json                      # profils de build EAS
```

---

## Backend Supabase

Le projet Supabase est **déjà déployé** (ton associé y a accès). Le code source des functions est
dans [`supabase/`](supabase/) pour pouvoir les modifier et les redéployer.

### Lier le projet en local

```bash
supabase link --project-ref vwlqdrrlggolgdssdwoh
```

### Edge functions

Appelées **par l'app** :

| Function | Rôle |
|---|---|
| `magic-link` | Auth OTP : envoi du code (`{ email }`) et vérif (`{ email, action: "verify", token }`). Vérifie que l'email est client Shopify. |
| `sync-orders` | Sync des commandes depuis Shopify → `orders_cache`. Notifie « Commande expédiée » sur passage à `fulfilled`. |
| `sync-subscriptions` | Sync des abonnements depuis Appstle → `subscriptions_cache`. |
| `manage-subscription` | Actions abonnement : pause / resume / cancel. |
| `subscription-action` | order-now, skip, reschedule, update-frequency, update-address, apply-discount. |
| `get-subscription-detail` | Détail complet d'un abonnement (commandes à venir/passées, adresse, paiement). |
| `scrape-tracking` | Suivi de colis (scraping transporteur). |

Internes / crons (non appelées directement par l'app) :

| Function | Rôle |
|---|---|
| `send-notification` | Envoi push via l'API Expo + log dans `notification_logs`. Exige le **service role** en Bearer. |
| `notify-renewal` | **Cron 08:00 UTC** — rappel renouvellement abonnement J-2. |
| `notify-cartridge` | **Cron 08:15 UTC** — cartouche à 80 % et 95 %. |
| `check-push-receipts` | **Cron 08:45 UTC** — purge les `push_token` morts (DeviceNotRegistered). |
| `skip-order`, `reschedule-order` | Helpers d'actions sur les commandes d'abonnement. |

Les crons sont planifiés via **pg_cron** (migration [supabase/migrations/20260611090000_notifications_cron.sql](supabase/migrations/20260611090000_notifications_cron.sql)),
déployés avec `--no-verify-jwt` et protégés par le header `x-cron-secret` (= `CRON_SECRET`).

### Déployer une function

```bash
supabase functions deploy magic-link
# crons : déployés sans vérif JWT
supabase functions deploy notify-renewal --no-verify-jwt
```

### Secrets backend (à configurer côté Supabase)

Ces variables sont lues via `Deno.env.get(...)` dans les functions. Elles sont **déjà configurées**
sur le projet Supabase déployé, mais **non lisibles** une fois posées — si tu dois recréer
l'environnement, il faut redemander/regénérer les valeurs.

| Variable | Utilisée pour |
|---|---|
| `SUPABASE_URL` | fournie automatiquement par Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | fournie automatiquement par Supabase |
| `SHOPIFY_STORE_DOMAIN` | domaine boutique Shopify |
| `SHOPIFY_ADMIN_TOKEN` | API Admin Shopify (commandes, clients) |
| `APPSTLE_API_KEY` | API Appstle (abonnements) |
| `RESEND_API_KEY` | envoi des emails OTP |
| `EXPO_ACCESS_TOKEN` | envoi des notifications push Expo |
| `CRON_SECRET` | header `x-cron-secret` des functions cron |

Configuration d'un secret :

```bash
supabase secrets set SHOPIFY_ADMIN_TOKEN=xxxx
```

### Base de données

Tables : `profiles`, `filters`, `cartridge_timers`, `subscriptions_cache`, `orders_cache`,
`support_tickets`, `notification_logs`. **RLS activé** sur toutes les tables.

---

## Notifications push

- Le `push_token` Expo est enregistré au login dans `profiles.push_token`.
  ⚠️ **Échoue silencieusement dans Expo Go** — un **dev build** est requis pour tester les push.
- Canal Android `default`, badge remis à 0 à l'ouverture, tap sur notif → `router.push(data.screen)`,
  token nettoyé au `signOut`.
- Centre de notifications dans la cloche du dashboard (`notification_logs` + `AsyncStorage`).

### ⚠️ Restant à configurer pour les builds

Pour que les notifications push fonctionnent en build réel :

- **Android** : credentials FCM (`google-services.json` + configuration EAS).
- **iOS** : clé APNs (`eas credentials`).

---

## Dépendance externe : Worker Cloudflare (support)

Le formulaire de support ([app/(tabs)/support.tsx](app/(tabs)/support.tsx)) envoie les tickets vers un
**Cloudflare Worker** :

```
https://lively-sound-95c2.mathieu-vaneynde.workers.dev/
```

⚠️ Le code de ce Worker **n'est pas dans ce dépôt** — il vit sur le compte Cloudflare de Mathieu, et
crée les tickets côté Zendesk. Pour le modifier, il faut un accès à ce compte Cloudflare.

---

## Builds EAS

Profils définis dans [eas.json](eas.json) : `development` (dev client), `preview` (interne),
`production` (auto-increment). Voir aussi les credentials push à configurer ci-dessus.

```bash
eas build --profile development --platform ios
eas build --profile preview --platform android
```
