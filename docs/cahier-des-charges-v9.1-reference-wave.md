# AVENANT AU CAHIER DES CHARGES V9.1 — « Référence de paiement optionnelle pour Wave »

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Sénégal) |
| **Version document** | **1.0 — 20/11/2026** |
| **Auteur** | Agent `@cahier-des-charges` |
| **Statut** | **Approuvé par le chef de projet le 20/11/2026** — recette finale `docs/recette-v9.1-reference-wave.md` : **6/6 🟢, VERDICT : CONFORME**. Mention conservée : **aucune ligne de code applicatif écrite par cette modification documentaire, aucune clé / aucun secret posé, aucun déploiement, aucune migration**. |
| **Nature** | **Avenant additif** au cahier V9 approuvé. Le cahier `docs/cahier-des-charges-v9-wave-checkout.md` **reste la source de vérité de V9 et n'est pas modifié**. Le présent avenant ne le complète que pour V9.1 : en cas de divergence sur le seul objet traité (référence de paiement Wave), l'avenant prévaut pour V9.1 ; pour tout le reste, V9 et les cahiers antérieurs restent inchangés. |
| **Base de livraison V9** | V9 livré, déployé **désactivé**, recette **CONFORME — 55/55 critères, 12/12 scénarios** (`docs/recette-v9-wave-checkout.md:271-273`), commit `b57eb54` poussé sur `origin`. |
| **Décision d'origine** | Demande verbale de l'utilisateur : supprimer l'obligation de saisir une référence de paiement pour Wave, l'activation étant déjà automatique via webhook signé sur paiement réussi. |
| **Cible** | Web (React + Vite, `revends/web`) + API (Node + Express + Postgres, `revends/server`). Aucune cible mobile native. |
| **Sources vérifiées (`verifie-toujours`)** | `server/src/services/wave-webhook.service.ts:32-63` (corrélation `client_reference` / `session_id` / devise `XOF` / montant) et `:65-135` (activation `:120-121`) · `server/src/utils/storefront-validation.ts:12` (regex) et `:102-127` (`validatePaymentFields`, erreurs `:117-125`) · `server/migrations/020_storefront_v8.sql:19-22` (`payment_reference varchar(64) NULL`) · `docs/cahier-des-charges-v8-hebergement-boutique.md:406` (CA-V8-050) · `docs/cahier-des-charges-v9-wave-checkout.md:18` (verrous), `:261` (CA-V9-060 flux manuel), `:274` (CA-V9-074 bascule hors V9) · `web/src/pages/MonAbonnement.tsx:104-117` et `:362` · `web/src/components/storefront/PaymentReferenceFields.tsx:64` · `web/src/components/storefront/WaveCheckoutPanel.tsx:102` · `docs/api.md:2340` (extension E1 héritée v2.8 dans le contrat v2.9). |

> **Convention de lecture (identique à V8/V9).** Chaque critère `CA-V9.1-xxx` est **binaire** : 🟢 **prouvé** ou ⚪ **non prouvé**. Modes de preuve : `[TEST]` = test automatisé **nommé** et rejouable · `[EXEC]` = requête/curl/mesure exécutable · `[AUDIT]` = revue de code avec référence `fichier:ligne`. **Aucune intention annoncée ne vaut preuve.** Un seul critère non prouvé rend V9.1 **NON CONFORME** (`CA-V9.1-006`).

> **Avertissement de périmètre (non négociable, identique à `cahier V9:18`).** Bouton « Vendre un produit » **gratuit et illimité** ; quota **boutique-only** ; annonces **jamais masquées du catalogue** à l'expiration ; commission vendeur **10 %** ; V6.4 (aucune notification vendeur avant paiement confirmé) ; parrainage « Le Cercle des 10 » inchangés. Aucune occurrence de « ranga » ; contact public unique `revendsen@gmail.com` ; Montants Découverte **2 000**, Boutique **5 000**, Atelier **10 000** FCFA/mois. **Ne pas toucher à Gmail ni Whapi ; ne pas modifier `REDIS_URL`.**

---

## 1. Contexte et problème

1. **Ce que V9 fait déjà correctement.** Le webhook `checkout.session.completed`, **signé** (`Wave-Signature`, HMAC-SHA256), corrélé par `client_reference` **avec repli sur `session_id`** (`wave-webhook.service.ts:32-45`), avec devise `XOF` et montant strictement égal au prix du forfait, active immédiatement la souscription `PENDING → ACTIVE` via `activateSubscription()` (`wave-webhook.service.ts:32-63`, `:115-135`). **Aucun passage admin n'est nécessaire** pour un paiement Wave par session API.
2. **Le frottement restant.** `POST /api/subscriptions` exige encore `paymentMethod` **et** `paymentReference` pour **tous** les moyens de paiement (`CA-V8-050`, `docs/cahier-des-charges-v8-hebergement-boutique.md:406` ; validation réelle `storefront-validation.ts:117-125`, codes `PAYMENT_REFERENCE_REQUIRED` / `INVALID_PAYMENT_REFERENCE`). Le vendeur qui choisit Wave doit donc saisir une référence **inutile** avant de voir apparaître le bouton « Payer avec Wave ».
3. **Aucun impact base de données.** `payment_reference` est déjà `varchar(64) NULL` (`server/migrations/020_storefront_v8.sql:20`) : la référence interne générée pour Wave y est stockée sans `ALTER`, sans backfill et sans nouvelle migration. La colonne reste non publique et non journalisée en clair (CA-V8-052/055).

## 2. Périmètre

### 2.1 Dans le périmètre V9.1

- Acceptation de `POST /api/subscriptions` avec `paymentMethod = 'wave'` **sans** référence saisie, avec génération serveur d'une référence interne de traçabilité (`CA-V9.1-001`).
- Maintien strict de l'obligation de référence pour `orange_money` et `virement` (`CA-V9.1-002`).
- Confirmation que le webhook signé reste la **seule** source d'activation (`CA-V9.1-003`).
- Adaptation du formulaire web `/mon-abonnement` : champ masqué pour Wave, conservé pour OM/virement (`CA-V9.1-004`).
- Non-régression des verrous de contenu, secrets et configurations (`CA-V9.1-005`) et recette binaire (`CA-V9.1-006`).

### 2.2 Hors périmètre (explicite)

- **Aucune bascule Wave** : `WAVE_ENABLED` reste absent/`false` (`CA-V9-074`), aucune clé `WAVE_API_KEY` / `WAVE_WEBHOOK_SECRET` / `WAVE_SYSTEM_ADMIN_ID`, aucun webhook enregistré chez Wave, aucun paiement réel de test.
- **Aucune migration de base**, aucun `ALTER`, aucune nouvelle table, aucun changement de schéma (`020_storefront_v8.sql:19-22` suffit).
- Aucune modification du flux manuel Orange Money / virement, du back-office d'activation/refus, de l'e-mail vendeur, de Gmail, de Whapi, de `REDIS_URL`, des montants, de la commission ou de la gratuité « Vendre un produit ».
- Aucune nouvelle source d'activation : ni `success_url`, ni retour navigateur, ni référence (saisie ou générée), ni appel admin automatique.
- Aucune modification des cahiers V1→V9 approuvés, de la recette V9 ou de l'API contractuelle v2.9 hors du seul champ devenu optionnel pour Wave.

## 3. Persona et parcours

**Persona — vendeur boutique.** Il choisit un forfait, renseigne son slug, sélectionne « Wave » et souhaite payer sans inventer une référence : le paiement est confirmé automatiquement par Wave.

**Parcours cible.** `/mon-abonnement` → forfait + slug valides → moyen « Wave » sélectionné → **aucun champ « Référence de paiement » affiché**, texte informatif « Paiement Wave confirmé automatiquement » → bouton « Soumettre ma demande » actif → `201 PENDING` avec `payment_reference = WAVE-AUTO-4F2A9C31` (exemple) générée serveur → bouton « Payer avec Wave » (`WaveCheckoutPanel.tsx:102`) → session API `cos-…` → webhook signé → `ACTIVE`. Si le vendeur choisit OM ou virement, le champ reste affiché et obligatoire exactement comme en V8/V9.

**User story.** *En tant que vendeur boutique payant par Wave, je veux soumettre ma demande de souscription sans saisir de référence de paiement, afin d'accéder au bouton « Payer avec Wave » et d'être activé automatiquement dès la confirmation du paiement, sans étape administrative ni donnée inventée.*

## 4. Critères d'acceptation (6 critères binaires)

| ID | Critère — énoncé binaire et vérifiable | Mode de preuve | Référence amont | État |
|---|---|---|---|---|
| **CA-V9.1-001** | Avec `paymentMethod = 'wave'` et `paymentReference` **absente, `null`, vide ou composée uniquement d'espaces** (après `trim`), `POST /api/subscriptions` renvoie **201** et crée une souscription **`PENDING`** avec `payment_method = 'wave'`. Le serveur génère **`WAVE-AUTO-<8 hexadécimales majuscules>`** (regex `^WAVE-AUTO-[0-9A-F]{8}$`, **18 caractères**, ex. `WAVE-AUTO-4F2A9C31`), stockée dans `payment_reference` ; cette valeur satisfait `PAYMENT_REFERENCE_REGEX` (`storefront-validation.ts:12`). **Aucune erreur `PAYMENT_REFERENCE_REQUIRED`**, aucun `400`. La référence est interne, non secrète, non publique, jamais journalisée en clair ; deux souscriptions successives donnent deux références distinctes. | `[TEST]` + `[EXEC]` (lignes `payment_reference` en base) | `CA-V8-050` (`cahier V8:406`) adapté pour Wave seul ; `storefront-validation.ts:12,117-125` ; `020_storefront_v8.sql:20` | 🟢 (renvoi : `docs/recette-v9.1-reference-wave.md` §2) |
| **CA-V9.1-002** | Avec `paymentMethod = 'orange_money'` **ou** `'virement'`, la référence reste **obligatoire** : absente/vide → **400 `PAYMENT_REFERENCE_REQUIRED`** ; hors 4–64 car. ou hors regex → **400 `INVALID_PAYMENT_REFERENCE`** ; `paymentMethod` absent/invalide → **400 `INVALID_PAYMENT_METHOD`** ; aucune souscription créée dans ces cas. Regex `^[A-Za-z0-9][A-Za-z0-9 .\-_/]{2,62}$` et codes d'erreur **inchangés**. Aucune régression du flux manuel (`CA-V9-060`). | `[TEST]` (non-régression) | `cahier V8:406` ; `cahier V9:261` ; `storefront-validation.ts:102-127` ; `api.md:2340` | 🟢 (renvoi : `docs/recette-v9.1-reference-wave.md` §2) |
| **CA-V9.1-003** | Le **webhook signé reste la seule source d'activation automatique** : retour navigateur, `success_url`, présence d'une référence (saisie ou `WAVE-AUTO-…`) et tout déclencheur automatique hors webhook ne peuvent activer la souscription, qui reste `PENDING`. **L'activation manuelle admin reste inchangée** (plan B du §5), mais jamais déclenchée par la seule présence d'une référence. Le chemin `client_reference` / `session_id` / contrôle devise `XOF` / contrôle montant `price_fcfa` est **inchangé** (`wave-webhook.service.ts:32-63`) ; idempotence par `event.id` et accusé 2xx rapide inchangés ; activation automatique effective uniquement via `activateSubscription()` (`wave-webhook.service.ts:120-121`). | `[TEST]` + [scénario négatif] | `cahier V9:261,331` (R-V9-10) ; `wave-webhook.service.ts:32-63,65-135` | 🟢 (renvoi : `docs/recette-v9.1-reference-wave.md` §2) |
| **CA-V9.1-004** | Côté web, quand « Wave » est sélectionné, le champ « Référence de paiement » **n'est pas rendu** dans le DOM (`queryByLabelText` → `null`) et un texte informatif indique que le paiement Wave est confirmé automatiquement. Pour `orange_money` / `virement`, le champ est rendu, marqué obligatoire et sa validation bloque toujours la soumission. Le bouton « Soumettre ma demande » est **actif** dès qu'un forfait, un slug et le moyen « Wave » sont valides, **sans aucune saisie de référence** (`MonAbonnement.tsx:104-117`, `:362` ; `PaymentReferenceFields.tsx:64`). | `[TEST]` (DOM + clic) | `MonAbonnement.tsx:104-117` ; `PaymentReferenceFields.tsx:64` ; `WaveCheckoutPanel.tsx:102` ; `cahier V9:201-202` (CA-V9-002) | 🟢 (renvoi : `docs/recette-v9.1-reference-wave.md` §2) |
| **CA-V9.1-005** | Aucune donnée sensible ni secret ajouté ou exposé ; **0 ligne de diff** sur Gmail, Whapi et `REDIS_URL` ; aucune occurrence de « ranga » ; contact public unique `revendsen@gmail.com` ; montants **2 000 / 5 000 / 10 000** FCFA inchangés (aucun « 1000 ») ; commission **10 %** et bouton « Vendre un produit » **gratuit et illimité** préservés ; `WAVE_ENABLED` non activé par ce changement. La référence générée n'est **pas** un identifiant de transaction Wave et ne déclenche aucune activation. | `[AUDIT]` + `[EXEC]` (`git diff`, `grep`) | `cahier V9:18,355` ; `cahier V8:17` ; `cahier V9:274` (CA-V9-074) | 🟢 (renvoi : `docs/recette-v9.1-reference-wave.md` §2) |
| **CA-V9.1-006** | **Recette binaire V9.1** : les **6 critères `CA-V9.1-001` à `CA-V9.1-006` doivent être 🟢 prouvés** par un test nommé rejouable ou une commande dont l'output est consigné, **avant tout déploiement**. Grille à produire par `@tester` : `ID | Scénario | État 🟢/⚪ | Commande/preuve`. **Un seul ⚪ → V9.1 NON CONFORME** ; aucun déploiement, aucune bascule Wave. | `[EXEC]` (grille + outputs) | `recette-v9-wave-checkout.md:12,271-273` (règle V9 reprise) | 🟢 (renvoi : `docs/recette-v9.1-reference-wave.md` §2) |

### 4.1 Précisions normatives

- **Champ « absent ou vide »** : `undefined`, `null`, `''` ou une chaîne ne contenant que des espaces après `trim()` sont traités comme « non saisis ». Une référence Wave **saisie volontairement** par le vendeur reste acceptée si elle respecte la règle V8 (4–64 car., regex inchangée) : V9.1 retire une **obligation**, il n'interdit pas la saisie.
- **Génération côté serveur uniquement** : le front n'envoie aucune référence fabriquée pour Wave ; il n'envoie que `paymentMethod = 'wave'` (et éventuellement la référence réellement saisie). Toute valeur `WAVE-AUTO-…` fabriquée côté client est sans effet sur l'activation.
- **Référence non publique** : stockée dans `payment_reference` déjà nullable, visible back-office comme toute référence, masquée selon les règles V8, jamais affichée sur la boutique publique (`CA-V8-055`).
- **Tests nommés attendus** (noms proposés, emplacements à confirmer par `@tester` — l'exigence porte sur l'existence et la rejouabilité, pas sur le fichier) : `CA-V9.1-001 — wave sans référence : 201 PENDING + WAVE-AUTO-[0-9A-F]{8}` ; `CA-V9.1-002 — OM/virement sans référence : 400 PAYMENT_REFERENCE_REQUIRED` ; `CA-V9.1-003 — webhook seul active : retour/success_url/référence restent PENDING` ; `CA-V9.1-004 — web : champ masqué Wave, requis OM/virement, bouton actif` ; `CA-V9.1-005 — audit verrous et 0 diff Gmail/Whapi/REDIS_URL` ; `CA-V9.1-006 — grille de recette 6/6 🟢`.

## 5. Risque assumé — liens Wave hébergés de repli

⚠️ **Important — risque identifié et ACCEPTÉ en connaissance de cause.** Si le vendeur sélectionne « Wave » mais règle depuis l'un des **3 liens hébergés de repli** (`https://pay.wave.com/m/…`, sans session `cos-…`), aucune session API n'existe : le webhook ne peut corréler l'événement, et comme aucune référence n'a été saisie, **l'admin n'aura aucune référence pour retrouver manuellement la transaction**. Le chemin prioritaire reste le bouton **« Payer avec Wave »** (session API + webhook signé), qui ne nécessite aucune référence. **Plan B** : l'admin active manuellement depuis le back-office (`/admin/abonnements`) **après avoir vérifié le paiement dans le portail Wave** ; la souscription reste `PENDING` jusque-là, conformément à `CA-V9-003`. Ce risque est consigné comme **accepté** pour V9.1 : il doit être rappelé dans la grille de recette (`CA-V9.1-006`) et au chef de projet avant la bascule éventuelle de `WAVE_ENABLED`. Aucune mesure compensatoire supplémentaire (champ de référence réintroduit pour Wave, activation sur retour navigateur) n'est autorisée par le présent avenant.

## 6. État de recette V9.1

| Critères | État au 20/11/2026 |
|---|---|
| `CA-V9.1-001` → `CA-V9.1-006` | **6 🟢 / 0 ⚪ au 20/11/2026** — conformité prouvée par la grille `docs/recette-v9.1-reference-wave.md` (§1 outputs réels, §2 grille des 6 critères). **VERDICT : CONFORME**. Aucun déploiement, aucune clé, aucune migration et aucune bascule `WAVE_ENABLED` par cette recette. |

Règle de verdict : **6 🟢 → CONFORME** ; **≥ 1 ⚪ → NON CONFORME**, sans déploiement (`CA-V9.1-006`).

---

> **Auto-revue effectuée :** relecture intégrale de l'avenant — unicité des identifiants `CA-V9.1-001`→`006`, cohérence des références `fichier:ligne` avec le code réellement lu, absence d'exigence hors périmètre (bascule, clés, webhook, paiement test, migration), périmètre confirmé « documentation uniquement », risque des liens hébergés explicitement accepté avec plan B, et aucune affirmation de conformité sur un livrable non encore écrit.
