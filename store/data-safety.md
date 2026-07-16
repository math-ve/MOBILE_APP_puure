# Questionnaires confidentialité — réponses préparées

Basé sur l'audit du code et du backend (tables Supabase, edge functions,
intégrations Shopify/Appstle/Expo Push/17track/Cloudflare Worker).

## Google Play — Data Safety

**L'app collecte-t-elle des données utilisateur ?** → Oui
**Toutes les données sont-elles chiffrées en transit ?** → Oui (HTTPS partout)
**Possibilité de demander la suppression ?** → Oui (via le support — customercare@puurefilters.com)

| Donnée | Collectée | Partagée | Finalité | Obligatoire |
|---|---|---|---|---|
| Adresse e-mail | ✅ | ❌ | Fonctionnement (compte, connexion OTP) | ✅ |
| Nom complet | ✅ | ❌ | Fonctionnement (profil client) | ✅ |
| Adresse postale | ✅ | ❌ | Fonctionnement (livraison abonnement) | ✅ |
| N° de téléphone | ✅ (adresse livraison) | ❌ | Fonctionnement (livraison) | ❌ |
| Historique d'achats | ✅ | ❌ | Fonctionnement (commandes, abonnements) | ✅ |
| Identifiants d'appareil (push token) | ✅ | ❌ | Fonctionnement (notifications) | ❌ |

**Ne PAS déclarer** : localisation, contacts, photos, micro, données
financières (les paiements restent chez Shopify/Appstle, jamais dans l'app —
seule une carte masquée `•••• 4242` est affichée en lecture seule),
historique web, données de santé.

**Partage avec des tiers** : aucun au sens Play Store. Les processeurs
(Supabase, Shopify, Appstle, Expo) agissent comme sous-traitants du
service, pas comme destinataires à finalité propre.

## Apple — App Privacy (App Store Connect)

**Data Types collectés, liés à l'identité (Linked to You) :**

| Type Apple | Détail | Finalité Apple |
|---|---|---|
| Contact Info → Email Address | e-mail du compte | App Functionality |
| Contact Info → Name | nom complet | App Functionality |
| Contact Info → Physical Address | adresse de livraison | App Functionality |
| Contact Info → Phone Number | tél. de livraison (optionnel) | App Functionality |
| Purchases → Purchase History | commandes & abonnements | App Functionality |
| Identifiers → Device ID | jeton push Expo | App Functionality |

**Tracking (ATT)** : ❌ Aucun — l'app ne suit pas l'utilisateur entre
apps/sites, pas de publicité, pas de data broker. Ne pas cocher
« Used for Tracking » nulle part.

**Data Not Collected** : localisation, données financières, santé,
messages, photos, audio, historique de navigation, données d'usage
publicitaires.

## Rappels

- Ces réponses supposent qu'aucun SDK analytics/pub n'est ajouté.
  Si un jour Sentry/Amplitude/etc. entre dans l'app → mettre à jour.
- La politique de confidentialité du site doit mentionner l'app mobile
  et les données ci-dessus (vérifier avec le juridique).
- Apple exige que la suppression de compte soit possible si l'app
  permet la création de compte — ici pas de création in-app (clients
  Shopify existants), le mentionner dans les notes de review.
