# Anciennes fonctions d'abonnement — versions en production (26/10/2026)

Ces 5 fonctions sont encore appelées par les versions 1.0.0 et 1.0.1 de l'app.
Elles ne vérifiaient pas le propriétaire du contrat (un client pouvait lire ou
modifier l'abonnement d'un autre). Elles ont été corrigées **à partir des
versions réellement déployées** (les copies de `supabase/functions/` en
diffèrent) en ajoutant `_shared/legacyGuard.ts` en tête de traitement.

- Pour les redéployer : copier le dossier dans un `supabase/functions/` à côté
  de `_shared/` (import `../_shared/legacyGuard.ts`).
- À retirer quand l'app ≥ 1.0.2 (qui utilise `subscription-api`) est installée
  par la quasi-totalité des clients.
