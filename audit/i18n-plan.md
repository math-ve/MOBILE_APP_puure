# Plan i18n — Puure Filters (FR / EN / DE)

## Objectif
Application entièrement traduite en français, anglais, allemand.
- Détection automatique de la langue du téléphone au premier lancement
- Nouvel écran Réglages (accessible depuis le dashboard) avec sélecteur manuel FR/EN/DE
- Choix manuel persistant, prioritaire sur la détection
- Fiches stores (App Store Connect + Play Console) traduites EN/DE
- Publication TestFlight APRÈS la fin de l'i18n (un seul build avec les 3 langues)

## Décisions validées
| Sujet | Choix |
|---|---|
| Sélecteur langue | Nouvel écran `app/settings.tsx` depuis le dashboard + détection auto au 1er lancement |
| Traductions EN/DE | Claude génère, Mathieu relit les nuances métier |
| Fiches stores | Traduites EN + DE |
| Ordre | i18n d'abord, puis un seul build TestFlight |

## Stack
- `i18next` + `react-i18next` (pas de dépendance native)
- `expo-localization` (déjà installé) pour la langue device initiale
- `@react-native-async-storage/async-storage` (déjà installé) pour persister le choix manuel
- Miroir du choix dans `profiles.language` (colonne déjà existante)
- Fallback : clé manquante en `de`/`en` → `fr`

## Architecture fichiers
```
lib/i18n/
  index.ts       ← init i18next, ordre de résolution langue, changeLanguage()
  locales/
    fr.json      ← référence (source de vérité)
    en.json
    de.json
  format.ts      ← formatDate / formatCurrency / formatRelativeDay liés à i18n.language
lib/statuses.ts  ← module unique statuts commande/abo (remplace les 4 STATUS_MAP dupliqués)
app/settings.tsx ← nouvel écran Réglages (langue + hooks futurs)
```

Namespaces : `common`, `auth`, `home`, `orders`, `subscription`, `filters`, `support`, `tracking`, `notifications`, `settings`.

Ordre de résolution de la langue :
1. Choix manuel stocké dans AsyncStorage (`user_language`)
2. Langue du device via `expo-localization` si dans `['fr','en','de']`
3. `fr` par défaut

## Périmètre du texte à traduire (audit)
- ~270 occurrences `<Text>`
- 30 `showToast(...)`
- 10 `Alert.alert(...)` (~20 chaînes titre+message)
- 7 `placeholder=`
- `CATEGORIES` (support.tsx) : ~60 libellés (7 catégories + ~50 sous-catégories) — `value` stable, libellé par clé i18n
- `STATUS_MAP` / `STATUS_BADGE` / `STATUS_CONFIG` dupliqués dans orders.tsx, subscription-detail.tsx, SubscriptionsSection.tsx, tracking.tsx → fusion dans `lib/statuses.ts`
- `TRANSLATIONS` transporteur (tracking.tsx) → clés i18n
- ~12 `toLocaleDateString('fr-FR', …)` + 3 `Intl.NumberFormat('fr-FR')` → helpers `format.ts`
- Chaînes interpolées : greeting, `Commande #${n}`, `Annulé le ${date}`, onglets `Passées (${n})` → placeholders + pluriels i18next

**Total estimé : ~350–400 chaînes uniques, 13 écrans + 6 composants UI.**

## Étapes

### 1. Setup (~0.5 j)
- `npm i i18next react-i18next`
- `lib/i18n/index.ts` : config + détection + `changeLanguage()`
- `lib/i18n/format.ts` : `formatDate(iso, opts)`, `formatCurrency(cents, currency)`, `formatRelativeDay(iso)` → mappe `i18n.language` sur `fr-FR|en-GB|de-DE`
- Brancher l'init i18n dans `app/_layout.tsx`
- Refondre `syncLanguage` : pilote `i18n.changeLanguage` + écrit `profiles.language` ; respecte l'ordre de priorité (manuel > device > fr)

### 2. Extraction FR — 1 commit par écran (~2.5–3 j)
1. `common` : composants UI (`Button`, `Badge`, `Toast`, `SectionTitle`, `SystemsProgress`, `TabBar`) + `lib/statuses.ts` (supprime les 4 STATUS_MAP)
2. `auth` : `login.tsx`, `notifications-intro.tsx`
3. `home` : `(tabs)/index.tsx` + `getGreeting()`
4. `orders` : `(tabs)/orders.tsx`
5. `filters` : `(tabs)/filters.tsx`
6. `tracking` : `tracking.tsx` (+ dico transporteur)
7. `support` : `(tabs)/support.tsx` (CATEGORIES → value stable + clé)
8. `subscription` : `subscription-detail.tsx` + `components/SubscriptionsSection.tsx`

Pour chaque écran : `t('ns:key')`, interpolation `t('home:greeting', { name })`, pluriels `t('subscription:pastCount', { count })`, dates/devises via `format.ts`.

### 3. Traduction EN + DE (~1 j)
- `fr.json` complet = référence
- Claude génère `en.json` + `de.json` (terminologie cohérente : cartouche→cartridge/Kartusche, filtre→filter/Filter, abonnement→subscription/Abonnement)
- Mathieu relit / corrige nuances métier et ton de marque

### 4. Écran Réglages + sélecteur (~0.5 j)
- `app/settings.tsx` : accès depuis le dashboard (icône/entrée à placer)
- Section Langue : 3 options FR/EN/DE → `changeLanguage` + persiste AsyncStorage + update `profiles.language`
- Option « Automatique » (efface le choix manuel, revient à la détection device)
- Prévoir la place pour futurs réglages (notifs, déconnexion, liens légaux)

### 5. Config stores (~0.5 j) — FAIT
- `app.json` : `CFBundleLocalizations = ["fr","en","de"]` + `CFBundleDevelopmentRegion` ✅
- `store/fiche-store.md` : sections EN + DE ajoutées (nom, sous-titre, description longue, mots-clés ASO) ✅
- ⚠️ Notifications push NON localisées — hors scope de ce lot. Les crons
  (`notify-cartridge`, `notify-renewal`, `sync-orders`…) **codent les textes FR
  en dur** et ne lisent ni `profiles.language` ni `notification_templates`.
  Chantier backend séparé : faire lire `profiles.language` aux edge functions,
  remplir `notification_templates.translations` (en/de) pour les 9 clés, et
  brancher les fonctions dessus.

### 6. QA (~0.5 j) — À FAIRE
- Parcours complet des 3 langues sur simulateur
- Troncatures : l'allemand est ~30 % plus long → vérifier boutons, badges, onglets
- Dates, devises, pluriels
- Vérifier le sélecteur Réglages + bascule automatique/manuelle

## État d'avancement (2026-09-09)

Branche `feat/i18n` — 9 commits :
| Lot | Statut |
|---|---|
| Socle i18n (i18next, format, statuses, check:i18n) | ✅ |
| auth (login, notifications-intro) | ✅ |
| common + composants (TabBar, SystemsProgress) | ✅ |
| home | ✅ |
| orders + SubscriptionsSection | ✅ |
| filters (+ modal ajout) | ✅ |
| tracking (statuts, jalons, events transporteur) | ✅ |
| support (+ ~60 catégories Zendesk) | ✅ |
| subscription-detail (+ 4 bottom-sheets) | ✅ |
| Écran Réglages + sélecteur langue | ✅ |
| Config stores (app.json + fiche-store EN/DE) | ✅ |
| Relecture EN/DE par Mathieu | à faire |
| QA 3 langues sur simulateur | à faire |
| Notifications push localisées (backend) | hors scope, à planifier |
| Merge feat/i18n → main, build EAS iOS, submit TestFlight | à faire |
| Déployer edge functions du commit b11a783 | à faire |

## Estimation totale : ~8 jours de dev

## Après l'i18n
1. `npx eas build --platform ios --profile production`
2. `npx eas submit --platform ios --latest`
3. App Store Connect → TestFlight → assigner le build aux groupes de testeurs
4. Déployer aussi les edge functions du commit b11a783 : `sync-orders`, `get-subscription-detail`, `sync-subscriptions`, `shopify-webhook`
