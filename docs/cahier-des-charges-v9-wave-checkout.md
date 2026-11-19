# CAHIER DES CHARGES V9 — « Wave Checkout + webhooks pour abonnements boutique »

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Sénégal) |
| **Version document** | **1.0 — 19/11/2026** |
| **Auteur** | Agent `@cahier-des-charges`, sur instruction du chef de projet et de l'utilisateur |
| **Statut** | **Rédigé — en attente d'approbation du chef de projet** — spécification seule, **aucune ligne de code écrite, aucun commit créé, aucun secret posé** |
| **Nature** | **Cahier additif** : il s'ajoute à V1→V8 **sans les amender**. Aucun verrou existant n'est modifié. Aucune route existante ne change de contrat ; V9 n'ajoute que de **nouvelles routes / nouveaux champs / une nouvelle table** sur le **seul périmètre abonnement**. |
| **Cible** | Web (React + Vite, `revends/web`) + API (Node + Express + Postgres, `revends/server`). Aucune cible mobile native. |
| **Contexte de production** | `https://revends.vercel.app` — branche `fix/v6-on-799a7ab` — **V8.5 déployé** (commit `f62c858`, hash prod `assets/index-C3zlpP1U.js`). Migrations `001`→`022` appliquées (`022_refusal_pair.sql`, contrainte `chk_activation_pair`) ; **prochaine migration disponible : `023`**. Migrations **manuelles** (`RUN_MIGRATIONS=false`, `RUN_MIGRATIONS=true MIGRATIONS_DIR=$(pwd)/migrations npx tsx src/db/migrate.ts` avec `~/.revends-secrets/revends.env.local`), déploiement `bash scripts/deploy-vercel.sh`. **Aucune clé Wave n'existe dans le coffre** : `WAVE_ENABLED=false` en production, mode **« prêt mais désactivé »**. |
| **Références amont** | `docs/cahier-des-charges-v8-hebergement-boutique.md:15` (convention) · `:17` (avertissement 3 verrous) · `:38` (V8-D8 référence de paiement) · `:119` (F5, pas de checkout en V8) · `:404-413` (CA-V8-050..057) · `docs/api.md:5` (contrat **v2.8**) · `:2176-2234` (§3.10 V8, R1/R1b/R2/R3) · `:2225` (E1 `POST /api/subscriptions`) · `:2227` (E4 `GET /api/subscriptions/me`) · `:2093` (§3.8 parrainage « Le Cercle des 10 ») · `docs/architecture-v8-hebergement-boutique.md:513` (§7 boutique brandable) · `:1026` (§14 arbitrages) · `docs/journal.md:4836` (cadrage V9) · `:4874` (complément — liens hébergés) · `:4879` (« remplace le 1000 par 2000 ») · `docs/recette-v8-hebergement-boutique.md:11` (verdict) · `:24` (suites) · `:91` (grille 14 scénarios) |
| **Références de non-régression** | `docs/cahier-des-charges-v8-hebergement-boutique.md:17` (gratuité « Vendre », commission 10 %, V6.4, parrainage) · `docs/api.md:130` (V6.4 — aucune sollicitation vendeur avant `PAID`) · `:142` et `:2080-2122` (parrainage) · `docs/cahier-des-charges-v5.md:620` et `:719` (CA-V5-150, commission 10 %) · `docs/journal.md:4836` (verrous rappelés) · preuves V8.5 : `storefront-v8.test.ts` **63/63**, web **273/273**, `npm audit --omit=dev` **0 vulnérabilité** (serveur et web) |
| **Sources officielles Wave** (vérifiées le 19/11/2026 par le chef de projet, skill `docs-officielles` — **non réinventées**) | `https://docs.wave.com/checkout` — `POST https://api.wave.com/v1/checkout/sessions`, `amount` (string), `currency: "XOF"`, `success_url`, `error_url`, `client_reference` ≤ 255, réponse `wave_launch_url` à ouvrir par le **navigateur**, auth Bearer, `GET /v1/checkout/sessions/:id`, `GET /v1/checkout/sessions/search?client_reference=…`, URL de session `pay.wave.com/c/cos-…`, **aucun décimal pour XOF**. · `https://docs.wave.com/webhook` — `checkout.session.completed` / `checkout.session.payment_failed`, en-tête `Wave-Signature: t=<unix>,v1=<hmac_sha256_hex>`, **payload signé = `timestamp + rawBody`** (concaténation directe, exemple JS officiel), HMAC-SHA256 hex, **plusieurs `v1` possibles** en rotation, rejet rejouer > 5 min, idempotence `event.id`, réponse 2xx < 5 s, retry jusqu'à 3 jours, secret webhook **distinct** de la clé API. Request signing et IP whitelisting **écartés** (Vercel sans IP fixes). |

> **Convention de lecture (identique à V8).** Chaque critère `CA-V9-xxx` est **binaire** : conforme ou non conforme. Modes de preuve : `[TEST]` = test automatisé nommé et rejouable · `[EXEC]` = requête SQL / curl / mesure exécutable · `[AUDIT]` = revue de code avec référence `fichier:ligne`. **Aucun critère ne peut être validé sur une intention annoncée : la preuve est obligatoire.**

> **Avertissement de périmètre (non négociable).** Les verrous V8 (`docs/cahier-des-charges-v8-hebergement-boutique.md:17`) traversent tout le document et **ne peuvent être levés sous aucun prétexte** : (1) bouton « Vendre un produit » **gratuit et illimité** ; (2) quota **boutique-only** (`storefront_listings`), jamais catalogue ; (3) annonces **jamais masquées du catalogue** à l'expiration. Commission vendeur **10 %**, V6.4 (**aucune notification vendeur avant confirmation du paiement**), parrainage « Le Cercle des 10 » inchangés. Aucune occurrence de « ranga » ; contact public unique `revendsen@gmail.com` ; numéros strictement `+221 7XXXXXXXX` ; ne jamais inventer ou déformer un chiffre. **Ne pas toucher à Gmail ni Whapi** (« ne touche pas à gmail ça marche déjà bien ») ; **ne pas modifier `REDIS_URL`** (« mettez url redis comme il était »). V9 ne modifie pas le flux manuel Wave / Orange Money / virement.

---

## 1. Contexte et objectifs

### 1.1 Pourquoi V9

Les abonnements boutique V7/V8 sont **déjà en production** : 3 plans (id 1 `Découverte` **2 000 FCFA/mois**, 10 annonces de boutique · id 2 `Boutique` **5 000**, 30 · id 3 `Atelier` **10 000**, 100), durée **30 jours glissants**, statut `PENDING → ACTIVE` validé **manuellement** par l'admin, boutique publique `/boutique/:slug`, espace vendeur `/mon-abonnement`, back-office `/admin/abonnements`. Le vendeur saisit aujourd'hui manuellement `paymentMethod` (`wave|orange_money|virement`) et `paymentReference` lors de la souscription (`server/src/routes/subscriptions.routes.ts:17-22`, `server/src/utils/storefront-validation.ts:25-39`, validation réelle obligatoire `validatePaymentFields()` `:102-128`) ; la création est toujours `PENDING`. La fonction d'activation réutilisable est `activateSubscription(adminId, targetId)` (`server/src/services/storefront.service.ts:653`) : elle pose `started_at`/`ends_at`, `activated_by` (FK `users.id`) et `activated_at`, auto-approuve les produits et déclenche l'e-mail vendeur. Le refus admin V8.2 (`rejectSubscription`, `server/src/services/storefront-admin-ctl.service.ts:137`, table `admin_actions`, e-mail `subscription_refused`) est **à ne pas modifier**.

V9 répond à une demande explicite : **automatiser la validation des abonnements payés via Wave**, sans dégrader le flux manuel existant et **sans dépendre d'un accès Wave inexistant à ce jour**.

### 1.2 Ce qui est automatisé / ce qui ne l'est pas

| Automatisé par V9 | Reste manuel / inchangé |
|---|---|
| Création d'une **session API Checkout Wave** depuis `/mon-abonnement` (montant figé serveur, `client_reference` rattaché à la souscription `PENDING`) | Saisie manuelle `paymentMethod` + `paymentReference` et activation admin pour **Orange Money** et **virement** |
| Ouverture de `wave_launch_url` par le **navigateur** | Activation admin de toute souscription `PENDING` non couverte par un webhook Wave valide |
| Réception du **webhook signé** et activation **immédiate** `PENDING → ACTIVE` sur `checkout.session.completed` valide (signature **et** montant **et** devise `XOF` **et** `client_reference` concordant) | Les **3 liens Wave hébergés** affichés en **repli manuel** : ils ne déclenchent **aucune** activation automatique |
| Dates 30 jours, `activated_by = 7` (`admin@revends.com`), badges, boutique publique, e-mail vendeur — via la fonction existante | Refus admin V8.2, pipeline de commandes V6.4, Gmail, Whapi, `REDIS_URL` |
| Traçabilité des événements Wave et accusé 2xx rapide (idempotent) | **Bascale production** (poser les clés + enregistrer le webhook + paiement test) : **hors V9** |

### 1.3 Sessions API vs liens hébergés — distinction fondamentale

| | **Sessions API Checkout** (mécanisme retenu) | **Liens hébergés** (repli manuel) |
|---|---|---|
| Format | `pay.wave.com/c/cos-…` | `https://pay.wave.com/m/M_sn_nLXzUBh809Au/c/sn/?amount=…` |
| Création | `POST https://api.wave.com/v1/checkout/sessions` (serveur, clé API Bearer) | Tableau de bord Wave (liens fournis par l'utilisateur) |
| Montant | **Figé côté serveur** depuis le plan (2 000 / 5 000 / 10 000) | **Modifiable dans l'URL** |
| Corrélation | `client_reference` unique rattaché à la souscription `PENDING` | **Aucun `client_reference`** |
| Effet | Webhook signé → activation **automatique** | **Aucune activation automatique** ; l'admin valide après vérification manuelle |

Le premier lien hébergé annonçait initialement `?amount=1000` ; l'utilisateur a confirmé **« remplace le 1000 par 2000 »** (`docs/journal.md:4879`). **Le plan Découverte reste à 2 000 FCFA** : aucun chiffre n'est modifié, l'erreur était dans le lien.

> **Le webhook signé est la seule preuve d'activation.** Le retour `success_url` ne suffit pas : « le paiement doit être bien envoyé pour que l'abonnement soit valide ». Un retour navigateur seul laisse la souscription `PENDING`.

### 1.4 Objectifs et KPI V9

| # | Objectif | Mesure binaire / cible |
|---|---|---|
| O1 | Payer un abonnement par Wave sans saisie de référence | 100 % des sessions API créées portent un `client_reference` unique (CA-V9-013) |
| O2 | Activer sans délai après paiement confirmé | `PENDING → ACTIVE` au 1er webhook valide, sans clic admin (CA-V9-040) |
| O3 | Aucune activation sur paiement non confirmé | `success_url` seul et `payment_failed` → 0 activation (CA-V9-021, CA-V9-037) |
| O4 | Webhook inviolable et idempotent | 100 % des webhooks non signés/rejoués/incohérents rejetés, 0 double activation (CA-V9-030..038) |
| O5 | Zéro secret exposé | 0 clé Wave dans le bundle front, les logs ou le dépôt (CA-V9-005, CA-V9-070) |
| O6 | Zéro régression V8.5 | 63/63 storefront, 273/273 web, audits npm 0 (CA-V9-073) |
| O7 | Mode « prêt mais désactivé » vérifiable | `WAVE_ENABLED=false` en prod, bouton Wave auto absent, repli manuel visible (CA-V9-001..003) |

### 1.5 Parties prenantes et personas

| Rôle | Intérêt | Attente |
|---|---|---|
| Vendeur « Awa » (Découverte) | Payer et être activée vite | Bouton Wave (dès bascule), suivi « Wave en attente », activation auto au paiement |
| Vendeur « Moussa » (Orange Money) | Continuité | Formulaire manuel inchangé, activation admin comme avant |
| Admin « Chef » (id 7) | Contrôle et traçabilité | Vue des paiements Wave, `activated_by = 7`, refus V8.2 inchangé |
| Acheteur / visiteur | Confiance | Boutique et badges visibles seulement après activation validée |
| `@architecte` / `@backend` / `@frontend` | Implémentation | Nouvelles routes/table uniquement ; contrat `docs/api.md` amendé en v2.9 (CA-V9-071) |
| `@tester` | Recette | 55 critères binaires (§4), 12 scénarios mocks (§5) |
| `@cahier-des-charges` | Conformité | Non-régression démontrée, verdict (§7) |

### 1.6 Décisions utilisateur V9 (déjà prises, non renégociables)

| # | Décision | Conséquence dans ce cahier |
|---|---|---|
| V9-D1 | **Pas d'accès Wave** — mode « prêt mais désactivé », `WAVE_ENABLED=false` en prod, aucun `WAVE_*` dans le coffre | F1 ; §2.2 ; CA-V9-001..003, CA-V9-074 ; bascule hors périmètre |
| V9-D2 | **Activation immédiate** sur `checkout.session.completed` valide (signature + montant + devise + référence), sans clic admin | F5 ; CA-V9-033..045 ; OM/virement restent manuels |
| V9-D3 | **Identité admin** : `admin@revends.com` **id 7**, via `WAVE_SYSTEM_ADMIN_ID=7`, aucune migration `users` | CA-V9-004, CA-V9-040, CA-V9-050 |
| V9-D4 | **Découverte = 2 000 FCFA** (« remplace le 1000 par 2000 ») — aucun chiffre ne change | §1.3 ; CA-V9-011 ; CA-V9-064 |
| V9-D5 | **API Checkout sessions retenues** ; montant figé serveur + `client_reference` ; 3 liens hébergés = repli manuel sans auto | F2/F6 ; CA-V9-010..013, CA-V9-060, CA-V9-065 |
| V9-D6 | **Webhook signé = seule preuve** ; `success_url` ne suffit pas | F3/F4 ; CA-V9-021, CA-V9-031, CA-V9-040 |

---

## 2. Périmètre

### 2.1 Dans le périmètre — F1 à F7, avec « Fais / Ne fais pas »

**F1 — Configuration « prêt mais désactivé » et fail-closed**
- **Fais :** variable `WAVE_ENABLED` (`false` en prod), `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET`, `WAVE_SYSTEM_ADMIN_ID=7` ; si `WAVE_ENABLED=false`, toute tentative d'appel Wave côté serveur renvoie une erreur explicite et le bouton Wave automatique n'apparaît pas côté front ; le formulaire manuel et les 3 liens hébergés restent disponibles.
- **Ne fais pas :** ne pas poser de clé Wave dans le coffre ni en prod ; ne pas activer le flux ; ne pas exposer de secret au front ni dans les logs ; ne pas confondre clé API et secret webhook.

**F2 — Création de session Checkout depuis `/mon-abonnement`**
- **Fais :** nouvelle route serveur qui crée une session via `POST https://api.wave.com/v1/checkout/sessions` (Bearer) pour une souscription `PENDING` du vendeur authentifié : `amount` **chaîne** dérivée du plan (2 000 / 5 000 / 10 000, **aucun décimal**), `currency: "XOF"`, `success_url`, `error_url`, `client_reference` unique ≤ 255 lié à la souscription ; réponse `wave_launch_url`.
- **Ne fais pas :** ne pas lire le montant depuis le corps client ; ne pas créer de session sans souscription `PENDING` ; ne pas stocker de secret ; ne pas modifier `POST /api/subscriptions` existant.

**F3 — Redirection navigateur et pages retour**
- **Fais :** ouvrir `wave_launch_url` par le navigateur ; page `success_url` affichant « Wave en attente de confirmation de paiement » (statut `PENDING`, **aucune activation**) ; page `error_url` affichant l'échec et proposant le repli manuel.
- **Ne fais pas :** aucune webview, aucun iframe, aucun « in-app browser » ; la page succès ne déclenche aucune écriture d'activation.

**F4 — Webhook sécurisé**
- **Fais :** nouvelle route HTTP montée **avant `csrfProtection`** (pattern `app.ts:106-112` pour `/api/cron`) ; body **brut** capturé avant parsing JSON ; vérification HMAC-SHA256 hex sur `t + rawBody` avec le secret webhook, **toutes valeurs `v1`** acceptées si l'une correspond ; tolérance 5 min ; idempotence par `event.id` ; vérification montant/devise/`client_reference` contre la souscription `PENDING` ; réponse 2xx en < 5 s (y compris déjà traité ou non pertinent).
- **Ne fais pas :** ne pas exiger de token CSRF (Wave ne peut pas en envoyer) ; ne pas journaliser secret/signature/rawBody ; ne pas faire confiance au corps re-sérialisé ; ne pas activer sur `payment_failed`.

**F5 — Activation immédiate et traçabilité**
- **Fais :** sur événement valide, réutiliser `activateSubscription(WAVE_SYSTEM_ADMIN_ID, targetId)` → `PENDING → ACTIVE` unique, `started_at`/`ends_at`/`activated_by = 7`/`activated_at`, auto-approbation produits, badges, boutique publique, e-mail vendeur **une seule fois** ; table de traçabilité des événements (migration `023`), vue admin des paiements Wave.
- **Ne fais pas :** ne pas réactiver un `ACTIVE`/`EXPIRED`/`CANCELLED` ; ne pas écraser un `activated_by` existant ; ne pas modifier `rejectSubscription` ni la table `users` ; ne pas envoyer de notification vendeur avant le webhook validé (V6.4).

**F6 — Repli manuel et liens hébergés**
- **Fais :** conserver le formulaire `paymentMethod`/`paymentReference` et afficher les 3 liens hébergés (2 000 / 5 000 / 10 000) comme **repli manuel** ; validation admin inchangée.
- **Ne fais pas :** ne pas brancher les liens hébergés sur le webhook (montant modifiable, pas de `client_reference`) ; ne pas automatiser Orange Money / virement.

**F7 — Documentation et recette**
- **Fais :** amendement du contrat `docs/api.md` (v2.9) par `@backend`, tests mock (aucune clé réelle), non-régression V8.5 prouvée, bascule documentée **hors V9**.
- **Ne fais pas :** ne pas déployer la bascule, ne pas écrire ce cahier dans le code, ne pas committer.

### 2.2 Hors-périmètre explicite et non négociable

| Sujet intouché | Raison / verrou |
|---|---|
| **Clés Wave en production** | Aucun accès au portail Wave Business ; `WAVE_API_KEY` / `WAVE_WEBHOOK_SECRET` absents du coffre. **Bascale hors V9** (décision utilisateur 1) |
| **Activation automatique effective en prod** | `WAVE_ENABLED=false` ; le livrable est « prêt mais désactivé ». Le flux manuel Wave/OM/virement reste **strictement inchangé** |
| **Orange Money / virement automatisés** | Décision utilisateur 2 : **restent manuels** |
| **Remboursement / annulation de paiement Wave** | Non demandé ; aucun appel à une API de remboursement |
| **Webview / application mobile native** | `wave_launch_url` doit être ouverte par le navigateur ; cible Web+API uniquement |
| **Pipeline de commandes V6.4** | Aucune sollicitation vendeur avant `PAID` ; 0 écriture dans orders/payments/checkout/payouts |
| **Gmail / Whapi / `REDIS_URL`** | « ne touche pas à gmail ça marche déjà bien » ; « mettez url redis comme il était » — 0 modification |
| **Bascule des 3 liens hébergés en automatique** | Montant modifiable dans l'URL + aucun `client_reference` → corrélation non sûre ; **repli manuel uniquement** |
| **Rotation de clé Wave effective** | Gestion des multiples `v1` côté vérification seulement ; aucune rotation réelle organisée en V9 |
| **Modification de `rejectSubscription` / de la table `users`** | Refus V8.2 intact ; `activated_by = 7` configurable, **aucune migration sur `users`** |
| **Changement de prix / de plan** | Découverte **2 000 FCFA** (« remplace le 1000 par 2000 »), Boutique 5 000, Atelier 10 000 — aucun chiffre ne change |
| **Commission, gratuité, parrainage, quota catalogue** | Verrous V8 inchangés (`docs/cahier-des-charges-v8-hebergement-boutique.md:17`) |

### 2.3 Interprétations consignées (tranchées sans question)

1. **Identité admin** : `WAVE_SYSTEM_ADMIN_ID=7` (`admin@revends.com`) est passé à `activateSubscription` comme `adminId` ; valeur par défaut `7` ; aucun `INSERT`/`UPDATE` sur `users` (admins existants id 7 et 23 inchangés).
2. **Migration** : `023` crée la table de traçabilité des événements Wave ; aucune migration `001`→`022` n'est modifiée, aucune colonne ajoutée à `users`, `products`, `orders`, `payments`.
3. **Type de la trace** : table dédiée (idempotence `event.id` en clé unique) plutôt qu'un réemploi de `admin_actions` — cohérent avec le refus V8.2 laissé intact.
4. **Noms exacts des nouvelles routes et du champ d'indicateur front** : laissés au choix de `@architecte` (spécification fonctionnelle, pas imposée). Seules les **obligations** sont contraignantes : route serveur de création de session, route webhook montée avant CSRF, indicateur explicite permettant au front de distinguer une souscription Wave d'une souscription OM/virement en `PENDING`.
5. **Aucune clé réelle en recette** : tous les appels Wave sont simulés (mock HTTP) ; `WAVE_ENABLED=false` reste la valeur de référence des tests « désactivé ».

---

## 3. User stories

**US-V9-01 — Souscrire et payer avec Wave** *(vendeur)*
*En tant que vendeur, je veux payer mon abonnement par Wave depuis `/mon-abonnement`, afin d'être activé sans attendre une validation manuelle.*
Exigences : session API créée côté serveur avec montant figé du plan et `client_reference` unique ; `wave_launch_url` ouverte par le navigateur. Contraintes : `WAVE_ENABLED=true` requis ; aucun décimal XOF ; aucune webview ; V6.4 respecté (aucun e-mail avant paiement confirmé). Preuve : CA-V9-010..020.

**US-V9-02 — Voir « Wave en attente »** *(vendeur)*
*En tant que vendeur, je veux voir l'état « Wave en attente de confirmation de paiement » après le retour Wave, afin de comprendre que l'activation viendra du paiement et non du retour navigateur.*
Exigences : statut affiché explicitement ; l'API expose un indicateur explicite car `GET /api/subscriptions/me` ne sérialise pas `paymentMethod`/`paymentReference` (le statut `PENDING` seul ne suffit pas, voir R-V9-09). Contraintes : aucun badge/boutique avant webhook valide. Preuve : CA-V9-019, CA-V9-021, CA-V9-022.

**US-V9-03 — Être activé automatiquement** *(vendeur)*
*En tant que vendeur, je veux que mon abonnement passe `ACTIVE` dès que Wave confirme le paiement, afin d'accéder immédiatement à ma boutique et à mes badges.*
Exigences : webhook valide (signature + montant + devise + référence) → `activateSubscription(7, id)` ; dates 30 jours, `activated_by=7`, e-mail une fois. Contraintes : pas de réactivation `ACTIVE`/`EXPIRED`/`CANCELLED`. Preuve : CA-V9-033..045.

**US-V9-04 — Cas échec de paiement** *(vendeur)*
*En tant que vendeur, je veux être informé d'un échec de paiement Wave et pouvoir retenter, afin de ne pas rester bloqué.*
Exigences : `payment_failed` → 2xx, aucune activation, souscription `PENDING`, page `error_url` claire, liens de repli visibles. Preuve : CA-V9-023, CA-V9-037.

**US-V9-05 — Repli manuel** *(vendeur)*
*En tant que vendeur sans paiement Wave automatisé, je veux utiliser le formulaire manuel et les 3 liens Wave hébergés, afin de souscrire comme aujourd'hui.*
Exigences : formulaire `paymentMethod`/`paymentReference` inchangé ; liens 2 000 / 5 000 / 10 000 visibles en `WAVE_ENABLED=false` **et** `true` ; aucun ne déclenche d'activation auto. Preuve : CA-V9-002, CA-V9-003, CA-V9-060, CA-V9-065.

**US-V9-06 — Vue des paiements Wave** *(admin)*
*En tant qu'admin, je veux voir les paiements Wave (en attente / confirmé / échoué) dans le back-office, afin de garder la main sur les cas litigieux.*
Exigences : vue dédiée dans `/admin/abonnements` ; `activated_by = 7` tracé ; Orange Money et virement **inchangés** ; refus V8.2 intact. Preuve : CA-V9-004, CA-V9-050, CA-V9-051, CA-V9-054.

**US-V9-07 — Webhook fiable** *(système)*
*En tant que système, je veux accepter uniquement des webhooks signés, récents et idempotents, afin de ne jamais activer un abonnement sur un événement forgé ou rejoué.*
Exigences : HMAC `t + rawBody`, multi-`v1`, 5 min, `event.id`, 2xx < 5 s. Preuve : CA-V9-030..038.

**US-V9-08 — Cohérence des effets d'activation** *(système)*
*En tant que système, je veux que l'activation automatique produise exactement les mêmes effets que l'activation admin, afin de ne pas créer un comportement divergente.*
Exigences : réutilisation de `activateSubscription` ; e-mail unique ; auto-approbation et badges identiques. Preuve : CA-V9-042..044.

**US-V9-09 — Fail-closed** *(système)*
*En tant que système, je veux refuser tout appel Wave si la fonctionnalité est désactivée, afin de ne jamais tenter un paiement avec une clé absente.*
Exigences : `WAVE_ENABLED=false` → erreur explicite serveur, bouton Wave auto absent, formulaire manuel disponible. Preuve : CA-V9-001..003.

**US-V9-10 — Non-régression** *(chef de projet)*
*En tant que chef de projet, je veux que V9 ne casse aucun verrou V8.5, afin de livrer sans repasser la recette complète à l'identique.*
Exigences : 63/63 storefront, 273/273 web, audits npm 0, 0 ligne sur le pipeline de commandes et sur Gmail/Whapi/`REDIS_URL`. Preuve : CA-V9-063, CA-V9-064, CA-V9-073, CA-V9-074.

---

## 4. Critères d'acceptation (55 critères, binaires)

> Chaque critère indique sa **donnée mesurable** et la **preuve à produire par `@tester`**. Un critère non prouvé est non conforme. Aucun critère n'est validé sur une intention annoncée.

### 4.1 Configuration et mode « prêt mais désactivé » (CA-V9-001 → 006)

- **CA-V9-001** `[AUDIT]` + `[TEST]` **Fail-closed `WAVE_ENABLED=false`.** Valeur par défaut `false` côté serveur ; avec `WAVE_ENABLED=false` (ou variable absente), toute tentative d'appel Wave (création de session, vérification, réconciliation) renvoie une erreur explicite `WAVE_DISABLED` sans aucun appel HTTP sortant (mock : compteur d'appels = 0). Test de la borne `true` également rejoué avec mock.
- **CA-V9-002** `[TEST]` **Bouton Wave automatique absent en mode désactivé.** Avec `WAVE_ENABLED=false`, aucun bouton déclenchant la création de session n'est rendu dans `/mon-abonnement` (`grep` DOM + screenshot) ; le formulaire manuel `paymentMethod`/`paymentReference` et les 3 liens hébergés sont présents et utilisables. Contrôle positif (présent si `true`) et négatif (absent si `false`).
- **CA-V9-003** `[TEST]` **Liens hébergés visibles en repli, sans effet automatique.** Les 3 liens `pay.wave.com/m/M_sn_nLXzUBh809Au/c/sn/?amount=2000|5000|10000` sont affichés ; un clic n'appelle **aucune** route de création de session, **aucun** webhook, **aucune** activation (`COUNT(ACTIVE)` inchangé, `activated_by` inchangé).
- **CA-V9-004** `[EXEC]` **Identité admin configurée.** `WAVE_SYSTEM_ADMIN_ID=7` ; vérification SQL `SELECT id,email FROM users WHERE id=7` → `admin@revends.com` ; l'activation automatique pose `activated_by = 7` (CA-V9-040) ; `SELECT COUNT(*) FROM users` inchangé avant/après (aucune migration `users`) ; id 23 inchangé.
- **CA-V9-005** `[AUDIT]` **Deux secrets distincts, absents du dépôt.** `WAVE_API_KEY` et `WAVE_WEBHOOK_SECRET` sont deux variables distinctes ; `grep -rni 'WAVE_API_KEY\|WAVE_WEBHOOK_SECRET' ~/.revends-secrets/revends.env.local` → **0 occurrence** en prod ; 0 valeur littérale de clé dans le dépôt, le bundle front et les logs (CA-V9-070).
- **CA-V9-006** `[AUDIT]` **Webhook monté avant la barrière CSRF.** Revue `server/src/app.ts` : le routeur webhook est enregistré **avant** `app.use('/api', csrfProtection)` (ligne 112), sur le modèle `app.use('/api/cron', cronRouter)` (`:111`, commentaire `:106-110`) ; aucune exigence de cookie/token CSRF sur la route webhook (test : POST sans cookie ni en-tête CSRF accepté — CA-V9-036).

### 4.2 Création de session Checkout (CA-V9-010 → 019)

- **CA-V9-010** `[TEST]` **Session créée via l'API Wave (mock).** Nouvelle route serveur, vendeur authentifié disposant d'une souscription `PENDING` : `POST` → appel simulé à `https://api.wave.com/v1/checkout/sessions` avec en-tête `Authorization: Bearer <clé>` ; **1 appel** enregistré par le mock ; aucune clé réelle utilisée.
- **CA-V9-011** `[TEST]` **Montant exact par plan, chaîne, XOF sans décimal.** Plans id 1/2/3 → `amount` = `"2000"` / `"5000"` / `"10000"` (type `string`, **aucun point, aucune virgule**) et `currency = "XOF"` ; la valeur `amount` envoyée par le client est **ignorée** (test : client envoie `1` → serveur envoie `"2000"` pour le plan id 1) ; aucun prix de plan codé en dur comme **logique de tarification** dans le front ; les 3 liens de repli hébergés (CA-V9-003) sont une **configuration statique fournie par l'utilisateur** et peuvent contenir `?amount=2000|5000|10000` dans leur URL, sans jamais servir à calculer ou valider le montant d'une session API (CA-V7-010).
- **CA-V9-012** `[TEST]` **URLs de retour et référence présentes.** Corps de session contient `success_url` et `error_url` (pages retour dédiées, CA-V9-022/023) et `client_reference` non vide, **≤ 255 caractères** ; champ absent ou trop long → 0 session créée.
- **CA-V9-013** `[TEST]` **Référence unique et rattachée à la souscription.** Deux souscriptions `PENDING` distinctes → deux `client_reference` **différents** ; la même souscription → référence **stable** ; la référence permet de retrouver la souscription par `GET /v1/checkout/sessions/search?client_reference=…` (mock) et par requête SQL de la table de suivi.
- **CA-V9-014** `[TEST]` **`wave_launch_url` renvoyée au front.** Réponse contient `wave_launch_url` ; en production le format est `pay.wave.com/c/cos-…` (mock en test : URL factice) ; **aucun secret, aucun `client_reference` d'un autre vendeur** dans la réponse.
- **CA-V9-015** `[TEST]` **Pas de session sans souscription éligible.** Vendeur sans abonnement / avec abonnement `ACTIVE` / `EXPIRED` / `CANCELLED` : erreur explicite (401/403/404/409 au choix de l'architecte, §2.3.4), **0 appel Wave** (compteur mock = 0), **0 écriture** en base.
- **CA-V9-016** `[TEST]` **Échec appel Wave non destructif.** Mock renvoie 500 / timeout : erreur explicite au front, **0 écriture** en base, souscription reste `PENDING`, `activated_by` inchangé, aucune notification vendeur.
- **CA-V9-017** `[AUDIT]` **Montant calculé côté serveur uniquement.** `grep -rn 'amount' server/src` (module Wave) → montant issu de `subscription_plans` (via la souscription), jamais de `req.body` ; `grep -rn '2000\|5000\|10000' web/src` → seules les occurrences des 3 URL de repli hébergées sont tolérées ; **0 occurrence utilisée pour calculer, afficher ou valider un prix de plan ou un montant de session** (cohérent CA-V8-026).
- **CA-V9-018** `[TEST]` **Vérification / réconciliation disponibles (mock).** Le serveur sait appeler `GET /v1/checkout/sessions/:id` et `GET /v1/checkout/sessions/search?client_reference=…` ; ces appels sont **uniquement diagnostiques** : ils ne remplacent jamais le webhook comme preuve d'activation (test : session `COMPLETED` retrouvée par GET sans webhook → souscription reste `PENDING`).
- **CA-V9-019** `[TEST]` **Indicateur front explicite « wave en attente ».** `GET /api/subscriptions/me` (ou route de lecture dédiée) expose un indicateur explicite permettant au front de distinguer une souscription Wave `PENDING` d'une souscription OM/virement `PENDING` ; le front **ne déduit rien du seul statut `PENDING`** ; valeur absente/fausse pour OM, virement et legacy. Nom du champ laissé à `@architecte` (§2.3.4).

### 4.3 Redirection navigateur et pages retour (CA-V9-020 → 024)

- **CA-V9-020** `[TEST]` **Ouverture par le navigateur.** `wave_launch_url` déclenche une navigation navigateur (`window.location` ou lien `<a href>`), jamais une webview / un iframe (CA-V9-024) ; test E2E : l'URL factice du mock est bien l'adresse de navigation finale.
- **CA-V9-021** `[TEST]` **Le retour `success_url` seul n'active pas.** Visite de la page succès sans aucun webhook → `status = 'PENDING'`, `started_at`/`ends_at`/`activated_by`/`activated_at` **NULL**, 0 e-mail d'activation, 0 badge, boutique publique `404` ; **0 écriture d'activation**.
- **CA-V9-022** `[TEST]` **Message « Wave en attente ».** La page succès affiche explicitement l'attente de confirmation du paiement (et non « activé ») ; l'indicateur de CA-V9-019 est utilisé ; aucun « Paiement reçu » / statut `ACTIVE` n'est affiché avant le webhook.
- **CA-V9-023** `[TEST]` **Page d'erreur claire et sans activation.** `error_url` : message d'échec lisible, accès au repli manuel (formulaire + 3 liens), souscription reste `PENDING`, 0 activation, 0 e-mail.
- **CA-V9-024** `[AUDIT]` **Aucune webview.** `grep -rniE 'webview|inappbrowser|iframe' web/src` → 0 occurrence introduite par V9 pour le parcours Wave ; les pages retour ne divulguent aucune donnée d'un autre vendeur (isolation par session).

### 4.4 Sécurité du webhook (CA-V9-030 → 038)

- **CA-V9-030** `[TEST]` **Idempotence par `event.id`.** Le même événement (même `event.id`) est envoyé **2 fois** (et 3 fois en variante) : **2xx à chaque fois**, **1 seule** activation, **1 seule** ligne de traçabilité, **1 seul** e-mail, `activated_by` inchangé ; le 2e passage est détecté comme « déjà traité » (CA-V9-036).
- **CA-V9-031** `[TEST]` **Signature HMAC multi-`v1` sur `t + rawBody`.** HMAC-SHA256 hex calculé sur la concaténation directe `timestamp + rawBody` avec `WAVE_WEBHOOK_SECRET` ; (a) signature valide → accepté ; (b) corps JSON re-sérialisé (espaces/clé d'ordre différents) → **rejet 4xx**, 0 activation ; (c) en-tête avec **deux valeurs `v1`** dont une valide (rotation) → **accepté** ; (d) secret erroné → rejet.
- **CA-V9-032** `[TEST]` **Replay > 5 min rejeté.** Horloge serveur de référence : `t` datant de 6 min → **rejet 4xx**, 0 activation ; `t` datant de 4 min → accepté ; `t` absent / non numérique / dans le futur au-delà de la tolérance → rejet. Mesure basée sur l'horloge serveur (pas sur `Date` du client).
- **CA-V9-033** `[TEST]` **Montant vérifié.** `checkout.session.completed` avec `amount = 2000` pour un plan Découverte `PENDING` → accepté ; `amount = 1000` (ancien lien erroné), `2000.5`, `"2000"` avec décimal, ou montant d'un autre plan → **rejet sans activation**, souscription reste `PENDING`.
- **CA-V9-034** `[TEST]` **Devise vérifiée.** `currency = "XOF"` → accepté ; `EUR`/`USD`/champ absent → **rejet sans activation**.
- **CA-V9-035** `[TEST]` **Référence vérifiée.** `client_reference` correspondant à une souscription `PENDING` → accepté ; référence inconnue, référence d'un autre vendeur, référence d'une souscription déjà `ACTIVE`/`EXPIRED`/`CANCELLED` → **rejet sans activation**, 0 écriture.
- **CA-V9-036** `[TEST]` **2xx rapide dans tous les cas.** `Wave-Signature` valide et événement traité / non pertinent (autre `event.type`) → **2xx** en **< 5 s** (chronomètre mesuré, seuil 5 s) ; signature invalide → 4xx rapide ; Wave retry jusqu'à 3 jours : un nouvel envoi d'un événement connu reste 2xx sans double effet.
- **CA-V9-037** `[TEST]` **`payment_failed` sans activation.** Événement `checkout.session.payment_failed` signé et cohérent → **2xx accusé réception**, **0 activation**, souscription `PENDING`, `started_at`/`activated_by` NULL, **0 e-mail d'activation**, 0 écriture de dates.
- **CA-V9-038** `[AUDIT]` **Body brut et secrets absents des logs.** Revue : le body **brut** est capturé **avant** `express.json()` (ou middleware dédié équivalent) et c'est ce buffer qui sert au HMAC ; `grep -rniE 'WAVE_WEBHOOK_SECRET|Wave-Signature|rawBody' server/src` → secret/signature/rawBody **absents** de tout `logger.*` ; 0 secret dans le bundle front (CA-V9-070) ; request signing et IP whitelisting **écartés et documentés** (Vercel sans IP fixes — tableau des sources officielles en en-tête et §6 R-V9-05).

### 4.5 Activation immédiate (CA-V9-040 → 047)

- **CA-V9-040** `[TEST]` **`PENDING → ACTIVE` unique, sans clic admin.** Événement complet valide (signature + montant + devise + référence) → `status = 'ACTIVE'`, `started_at`/`ends_at` posés (intervalle **30 jours**), `ends_at − started_at = 30 jours`, `activated_by = 7`, `activated_at` posé ; **0 appel à la route admin** ; boutique publique `/boutique/:slug` répond `200`, badges visibles.
- **CA-V9-041** `[TEST]` **Aucune réactivation, `activated_by` préservé.** Souscription `ACTIVE` / `EXPIRED` / `CANCELLED` recevant un webhook valide : **0 UPDATE**, `activated_by` existant **non écrasé**, dates inchangées, 0 e-mail ; le webhook reçoit tout de même **2xx** (CA-V9-036).
- **CA-V9-042** `[AUDIT]` **Une seule implémentation d'activation.** `grep -rn 'activateSubscription' server/src` → la logique d'activation est **réutilisée** : le chemin webhook appelle la même fonction que la route admin (`activateSubscription`, `storefront.service.ts:653`) ; aucun second bloc `UPDATE seller_subscriptions SET status='ACTIVE'` introduit par V9 (hors fonction existante).
- **CA-V9-043** `[TEST]` **E-mail vendeur une seule fois.** Un webhook valide → **1 e-mail d'activation** (mock Mailer) ; doublon `event.id` → **0 second e-mail** (compteur = 1) ; clé anti-doublon existante de `activateSubscription` préservée.
- **CA-V9-044** `[TEST]` **Parité des effets avec l'activation admin.** Même fixture activée (a) par webhook, (b) par `POST /api/admin/subscriptions/:id/activate` : statuts de produits auto-approuvés, badges, boost, visibilité boutique et contenu de l'e-mail **strictement identiques** (diff des réponses et de la base = 0 écart, hors `activated_by` qui vaut 7 dans les deux cas).
- **CA-V9-045** `[TEST]` **Référence de paiement conservée.** L'activation automatique ne modifie **ni** `payment_method` **ni** `payment_reference` (la valeur `'wave'` saisie à la souscription reste lisible en back-office) ; `UPDATE` limité aux champs d'activation de `activateSubscription`.
- **CA-V9-046** `[TEST]` **OM / virement non activables par webhook.** Webhook signé dont la référence correspond à une souscription `payment_method = 'orange_money'` ou `'virement'` → **rejet sans activation** ; ces souscriptions restent `PENDING` jusqu'à validation admin (CA-V9-060/061).
- **CA-V9-047** `[TEST]` **Concurrence : un seul gagnant.** Deux webhooks valides **simultanés** pour la même souscription → **1 seule** activation (verrou de transaction / contrainte d'unicité), `COUNT(ACTIVE)` = 1, 1 seul e-mail, 2xx pour les deux requêtes.

### 4.6 Traçabilité, vue admin et non-régression V8.2 (CA-V9-050 → 054)

- **CA-V9-050** `[EXEC]` **Migration `023` additive et idempotente.** Nouvelle table de traçabilité des événements Wave (au minimum `event_id` **unique**, session id, montant, devise, `client_reference`, statut de traitement, horodatage) ; migration rejouée **2 fois** sans erreur ; `git diff --stat server/migrations/` : `001`→`022` **byte-identiques**, seul `023` ajouté ; **0 colonne** sur `users`, `products`, `orders`, `payments` ; `chk_activation_pair` (migration `022`) inchangée.
- **CA-V9-051** `[TEST]` **Vue admin des paiements Wave.** `/admin/abonnements` affiche l'état des paiements Wave (en attente / confirmé / échoué) et l'identité d'activation (`activated_by = 7`) ; les lignes Orange Money / virement conservent leur affichage V8 ; aucune donnée Wave n'est exposée publiquement.
- **CA-V9-052** `[AUDIT]` **Aucune fuite de secret ni de référence en clair.** `grep -rniE 'sk_|api_key|WAVE_WEBHOOK_SECRET|Wave-Signature' server/src web/src` → 0 secret littéral ; référence Wave non journalisée en clair (cohérent `CA-V8-055`, `cahier-des-charges-v8-hebergement-boutique.md:411`) ; erreurs simulées : les logs ne contiennent ni secret ni signature.
- **CA-V9-053** `[TEST]` **V6.4 préservée.** Création de session et visite de `success_url` → **0 notification/e-mail vendeur** ; seul le webhook `completed` **validé** déclenche l'e-mail d'activation (après confirmations) ; aucun nouveau `notification_type` n'est créé (`enum_range(NULL::notification_type)` inchangé).
- **CA-V9-054** `[AUDIT]` **Refus V8.2 intact.** `git diff` sur `server/src/services/storefront-admin-ctl.service.ts` = **0 ligne** ; `rejectSubscription`, table `admin_actions` et e-mail `subscription_refused` inchangés ; un refus admin reste manuel et non automatisé par V9.

### 4.7 Repli manuel et flux inchangés (CA-V9-060 → 065)

- **CA-V9-060** `[TEST]` **Flux manuel Wave inchangé.** `POST /api/subscriptions` avec `paymentMethod = 'wave'` + `paymentReference` valide → **201 `PENDING`** (CA-V8-050/051 rejoués) ; activation admin → `200 ACTIVE` ; aucun appel Wave automatique n'interfère.
- **CA-V9-061** `[TEST]` **Flux OM / virement inchangés.** `paymentMethod = 'orange_money'` puis `'virement'` avec référence → **201 `PENDING`**, mêmes codes et corps qu'en V8.5 ; activation **manuelle** uniquement ; aucun webhook ne les active (CA-V9-046).
- **CA-V9-062** `[TEST]` **Contrat des routes existantes préservé.** `POST /api/subscriptions` (`subscriptions.routes.ts:17-22`) et `GET /api/subscriptions/me` (`:24-27`) conservent méthode, chemin, codes de succès et d'erreur ; V9 n'ajoute que de nouvelles routes ; aucune route renommée.
- **CA-V9-063** `[TEST]` **Verrous V8 non régressés.** Bouton « Vendre » gratuit/illimité, commission **10 %**, quota boutique-only, annonces jamais masquées du catalogue, parrainage « Le Cercle des 10 » : suites dédiées rejouées vertes, **0 écart** (`docs/cahier-des-charges-v8-hebergement-boutique.md:17`).
- **CA-V9-064** `[AUDIT]` **Conventions de contenu.** `grep -rni 'ranga' docs web server | grep -v 'Aucune occurrence' | grep -v 'grep -rni'` → **0 occurrence** (seules les **mentions normatives d'interdiction** dans les cahiers sont tolérées, jamais un usage dans le produit ou la documentation fonctionnelle) ; contact public unique `revendsen@gmail.com` ; numéros strictement `+221 7XXXXXXXX` ; Découverte **2 000** / Boutique **5 000** / Atelier **10 000** (aucun « 1000 » comme prix) ; `git diff` sur Gmail, Whapi et `REDIS_URL` = **0 ligne**.
- **CA-V9-065** `[TEST]` **Hors-périmètre non implémenté.** Aucun remboursement, aucune webview, aucun mobile natif, aucune automation des liens hébergés, aucune rotation de clé réelle (`grep` ciblé + revue) → 0 occurrence dans le livrable V9.

### 4.8 Documentation, tests et déploiement (CA-V9-070 → 075)

- **CA-V9-070** `[AUDIT]` **0 secret dans le bundle et les logs.** Build web : `grep -rniE 'WAVE_API_KEY|WAVE_WEBHOOK_SECRET|sk_' web/dist/assets/` → **0 occurrence** ; logs serveur : 0 secret (CA-V9-038/052) ; variables documentées dans la configuration sans valeurs littérales.
- **CA-V9-071** `[AUDIT]` **Documentation amendée.** `docs/api.md` passe en **v2.9** (livrable `@backend`, hors ce cahier) : nouvelles routes de création de session et webhook, `client_reference`, erreurs `WAVE_DISABLED` / signature invalide / replay ; `docs/architecture-v8-hebergement-boutique.md` ou document d'architecture V9 décrit le flux ; `docs/journal.md:4836` et `:4874` conservent le cadrage ; **ce cahier ne modifie ni `api.md` ni le journal**.
- **CA-V9-072** `[TEST]` **Tests mock verts, aucune clé réelle.** Suite V9 dédiée, nommée et rejouable : **0 appel réseau Wave réel** (interception HTTP/mock), **0 clé réelle** dans les fixtures ; `npm test` (serveur) → **0 échec** ; les 12 scénarios du §5 sont couverts par au moins un test nommé.
- **CA-V9-073** `[EXEC]` **Non-régression V8.5 mesurée.** `storefront-v8.test.ts` → **63/63** ; web `npm test` → **273/273** ; `npx tsc --noEmit` (serveur) et `npx tsc -b` (web) → **0 erreur** ; `npm run build` web → OK ; `npm audit --omit=dev` → **0 vulnérabilité critique** côté serveur **et** côté web.
- **CA-V9-074** `[EXEC]` **Production en mode « prêt mais désactivé ».** Après déploiement V9 : `WAVE_ENABLED=false` effectif (endpoint de santé/config ou revue de la config Vercel), aucune variable `WAVE_API_KEY`/`WAVE_WEBHOOK_SECRET` posée, aucun webhook enregistré chez Wave, aucun paiement test réel ; basculation documentée **hors V9**.
- **CA-V9-075** `[EXEC]` **Procédure de déploiement documentée (non exécutée).** Backup avant changement ; migration `023` **avant** le code (`RUN_MIGRATIONS=true MIGRATIONS_DIR=$(pwd)/migrations npx tsx src/db/migrate.ts` avec `~/.revends-secrets/revends.env.local`, `RUN_MIGRATIONS=false` en config) ; `bash scripts/deploy-vercel.sh` ; tests/build/recette avant déploiement. **Aucune de ces étapes n'est exécutée dans V9** (documentation seule).

### 4.9 Récapitulatif des critères

| Groupe | Plage | Nombre |
|---|---|---|
| 4.1 Configuration et mode désactivé | CA-V9-001 → 006 | 6 |
| 4.2 Création de session Checkout | CA-V9-010 → 019 | 10 |
| 4.3 Redirection et pages retour | CA-V9-020 → 024 | 5 |
| 4.4 Sécurité du webhook | CA-V9-030 → 038 | 9 |
| 4.5 Activation immédiate | CA-V9-040 → 047 | 8 |
| 4.6 Traçabilité, admin, V8.2 | CA-V9-050 → 054 | 5 |
| 4.7 Repli manuel et flux inchangés | CA-V9-060 → 065 | 6 |
| 4.8 Documentation, tests, déploiement | CA-V9-070 → 075 | 6 |
| **TOTAL** | | **55** |

---

## 5. Recette / scénarios de test (mocks uniquement, aucune clé réelle)

> Format inspiré de `docs/recette-v8-hebergement-boutique.md:91`. Légende : 🟢 prouvé par le scénario · 🔵 couvert par une suite rejouée verte. Instance de test `NODE_ENV=test`, base jetable, tous les appels Wave interceptés. **Aucun appel réseau Wave, aucune clé, aucune production.**

| # | Scénario nommé | Procédure (mock) | Résultat attendu (binaire) | Critères |
|---|---|---|---|---|
| **SC-V9-01** | Nominal complet | Session API mockée → `wave_launch_url` → page succès → webhook `completed` signé (montant 2000, XOF, référence liée) | `PENDING → ACTIVE`, `activated_by=7`, dates 30 j, 1 e-mail, boutique 200, badges | CA-V9-010/011/012/013/014/020/021/022/031/033/034/035/040/043 |
| **SC-V9-02** | Doublon de webhook | Même `event.id` envoyé 2× et 3× | 2xx partout, 1 activation, 1 trace, 1 e-mail, `activated_by` inchangé | CA-V9-030/036/041/043 |
| **SC-V9-03** | Replay | `t` = maintenant − 6 min, puis − 4 min | 6 min → **4xx, 0 activation** ; 4 min → accepté | CA-V9-032 |
| **SC-V9-04** | Mauvais montant | `amount = 1000` (ex-lien erroné), `2000.5`, montant d'un autre plan | **Rejet sans activation**, `PENDING`, 0 e-mail | CA-V9-011/033 |
| **SC-V9-05** | Mauvaise devise | `currency = "EUR"`, puis champ absent | **Rejet sans activation** | CA-V9-034 |
| **SC-V9-06** | Mauvaise référence | `client_reference` inconnu / autre vendeur / souscription déjà `ACTIVE` | **Rejet sans activation**, 0 écriture, 0 e-mail | CA-V9-035/041 |
| **SC-V9-07** | Échec de paiement | Webhook `payment_failed` valide + visite `error_url` | **2xx**, `PENDING`, 0 activation, 0 e-mail, repli visible | CA-V9-023/037 |
| **SC-V9-08** | `WAVE_ENABLED=false` | Mode désactivé : tentative d'appel serveur + rendu `/mon-abonnement` | Erreur `WAVE_DISABLED`, 0 appel mock, bouton Wave absent, formulaire + 3 liens présents | CA-V9-001/002/003/074 |
| **SC-V9-09** | Lien hébergé = manuel | Clic sur les 3 liens `pay.wave.com/m/…` (2000/5000/10000) | 0 session API, 0 webhook, 0 activation ; validation admin requise | CA-V9-003/060/065 |
| **SC-V9-10** | Rotation de clé + corps resérialisé | Deux `v1` (une valide) ; corps JSON réordonné | Deux `v1` → accepté ; corps resérialisé → **4xx**, 0 activation | CA-V9-031/038 |
| **SC-V9-11** | Retour navigateur seul | Visite `success_url` sans webhook, puis réconciliation GET mock `COMPLETED` | **Toujours `PENDING`** — la seule preuve est le webhook signé | CA-V9-018/021/022 |
| **SC-V9-12** | Non-régression V8.5 | Rejeu suites + `git diff` pipeline/Gmail/Whapi/Redis | 63/63, 273/273, audits 0, 0 ligne sur zones interdites | CA-V9-052/053/054/062/063/064/073 |

**Grille de bout en bout à produire par `@tester`** : reprendre les 12 scénarios, colonnes `Scénario | Critères | État 🟢/🔵/⚪ | Commande/preuve`, et exiger **0 échec** sur les 55 critères. Un seul critère non prouvé → V9 **non conforme** (désactivation par `WAVE_ENABLED=false`, sans toucher aux cahiers antérieurs).

---

## 6. Risques et arbitrages (actionnable)

> Format : **ID — risque** · niveau · action (propriétaire) · plan B / attendu. Un risque sans action n'existe pas.

| ID | Risque | Niveau | Action (propriétaire) | Plan B / attendu |
|---|---|---|---|---|
| **R-V9-01** | **Clés Wave absentes** : aucun accès portail Wave Business, `WAVE_*` absents du coffre → flux inutilisable en prod | 🔴 **Bloquant** | Mode « prêt mais désactivé » : `WAVE_ENABLED=false`, code + tests mock + webhook sécurisé livrés ; flux manuel inchangé (décision D1). @chef-de-projet + @deploy-ops | **Hors V9** : dès réception des clés, poser `WAVE_API_KEY`, `WAVE_WEBHOOK_SECRET`, `WAVE_ENABLED=true`, `WAVE_SYSTEM_ADMIN_ID=7`, enregistrer le webhook, faire 1 paiement test |
| **R-V9-02** | **Rotation de clé** : plusieurs valeurs `v1` dans l'en-tête → signature valide rejetée à tort | ⚠️ Important | Vérifier **toutes** les valeurs `v1` (CA-V9-031) ; test dédié SC-V9-10. @backend + @tester | Accepter la valeur valide parmi la liste ; journaliser uniquement un compteur de rotation, jamais le secret |
| **R-V9-03** | **Horloge / rejouer** : `t` forgé ou trop ancien accepté → activation sur vieux paiement | ⚠️ Important | Tolérance **5 min** sur horloge **serveur**, rejet hors fenêtre (CA-V9-032, SC-V9-03). @backend + @securite | Durcir à 2 min si abus constaté ; corrélation supplémentaire via `GET /v1/checkout/sessions/:id` (diagnostic) |
| **R-V9-04** | **Idempotence** : doublon de webhook → double activation, double e-mail | 🔴 Critique | Clé unique `event.id` + `activateSubscription` non réactivant (CA-V9-030/041/043, SC-V9-02). @backend | Contrainte DB unique en filet ; 2xx sur déjà-traité (pas de 5xx qui déclencherait un retry Wave) |
| **R-V9-05** | **Vercel sans IP fixes** : whitelisting IP impossible, usurpation d'URL webhook | 🔴 Critique | **HMAC obligatoire** sur `t + rawBody`, request signing / IP whitelisting **écartés** et documentés (CA-V9-031/038, SC-V9-10). @securite | Rotation du secret webhook ; monitoring des 4xx sur la route webhook |
| **R-V9-06** | **Liens hébergés modifiables** : `?amount=` changeable, aucun `client_reference` → corrélation non sûre | 🔴 Critique | Liens **repli manuel uniquement**, aucune activation auto (CA-V9-003, SC-V9-09) ; montant figé côté serveur pour les sessions API (CA-V9-011). @cahier-des-charges + @frontend | Si un vendeur paie via un lien hébergé : validation admin after vérification manuelle, comme aujourd'hui |
| **R-V9-07** | **Migration `023` manuelle en prod** : `RUN_MIGRATIONS=false`, oubli → table de trace absente | ⚠️ Important | Backup puis migration **avant** le code (`RUN_MIGRATIONS=true … npx tsx src/db/migrate.ts`), procédure documentée (CA-V9-050/075, non exécutée). @deploy-ops | Rollback par restauration du backup ; `WAVE_ENABLED=false` rend l'absence de table inoffensive tant que la bascule n'a pas lieu |
| **R-V9-08** | **Dépendance `activateSubscription`** : modification involontaire du chemin admin / des effets d'activation | ⚠️ Important | Réutilisation stricte de la fonction existante (`storefront.service.ts:653`), aucun second `UPDATE ... SET status='ACTIVE'` (CA-V9-042/044). @backend + @reviewer | Test de parité webhook vs admin (SC-V9-01/CA-V9-044) ; revert ciblé du module Wave |
| **R-V9-09** | **Front ne peut pas déduire « wave » du seul statut `PENDING`** : `GET /api/subscriptions/me` ne sérialise pas `paymentMethod`/`paymentReference` (api.md:2227) | ⚠️ Important | **Hypothèse tranchée** : l'API expose un indicateur explicite (nom laissé à `@architecte`, §2.3.4) ; le front ne déduit rien du statut (CA-V9-019, CA-V9-022). @architecte + @frontend | À défaut, afficher un libellé neutre « Paiement en cours de vérification » valable pour Wave/OM/virement |
| **R-V9-10** | **`success_url` pris pour une preuve** : activation sur simple retour navigateur → abonnement activé sans paiement | 🔴 Critique | Webhook signé = **seule** preuve ; test explicite SC-V9-11 (CA-V9-018/021). @backend + @tester | Aucune activation alternative ; en cas de doute, reste `PENDING` + support revendsen@gmail.com |
| **R-V9-11** | **Secret exposé** dans bundle front ou logs | 🔴 Critique | Deux secrets distincts côté serveur seul, rawBody/signature non journalisés, grep build (CA-V9-005/038/052/070). @securite | Rotation immédiate du secret exposé ; retrait du champ de log |
| **R-V9-12** | **OM / virement activés par erreur** par un webhook Wave réutilisant une référence | ⚠️ Important | Vérification `payment_method = 'wave'` en plus de la référence (CA-V9-046, CA-V9-061). @backend | Rejet explicite, validation admin conservée |
| **R-V9-13** | **Noms de routes / format de `client_reference` non figés** dans ce cahier (choix de l'architecte) | INFO (mineur) | Hypothèse §2.3.4 : obligations fonctionnelles seules ; `@architecte` tranche avant implémentation et met `api.md` à jour (CA-V9-071). @architecte | Aucun impact recette : les critères testent le comportement, pas le nom exact |
| **R-V9-14** | **Bascale hors V9 mal interprétée** comme « livrable incomplet » | INFO (mineur) | Statut « prêt mais désactivé » explicite en en-tête, §2.2 et CA-V9-074 ; accord chef de projet attendu. @cahier-des-charges + @chef-de-projet | Rappel que c'est la décision D1 de l'utilisateur, pas un oubli |

---

## 7. Définition de Done du cahier lui-même

> Ce verdict porte sur **le cahier en tant que livrable documentaire**. Les 55 critères `CA-V9-xxx` décrivent le **livrable code futur** et ne sont **pas** validés ici : aucun code Wave n'a été écrit, aucun secret posé, aucune prod touchée. Preuve : `git status --short`.

| # | Point de la Définition de Done | O/N | Preuve |
|---|---|---|---|
| 1 | En-tête complet (projet, version 1.0 — 19/11/2026, auteur, statut, nature additive, cible, contexte prod, références amont/non-régression avec `fichier:ligne`, sources Wave) | ✅ O | Tableau d'en-tête, lignes 3-14 |
| 2 | Convention de lecture identique à V8 (binaire, `[TEST]`/`[EXEC]`/`[AUDIT]`, preuve obligatoire) | ✅ O | Encadré ligne 16 |
| 3 | Avertissement de périmètre et verrous repris | ✅ O | Encadré ligne 18 |
| 4 | §1 Contexte/objectifs, pourquoi Wave, automatisé vs manuel, sessions API vs liens hébergés, décisions V9 | ✅ O | §1.1→§1.6 |
| 5 | §2 Périmètre fonctionnel F1→F7 + hors-périmètre explicite | ✅ O | §2.1 et §2.2 (13 lignes) |
| 6 | §3 User stories au format *En tant que… je veux… afin de…* avec exigences/contraintes | ✅ O | US-V9-01→US-V9-10 |
| 7 | §4 Critères `CA-V9-001`→`CA-V9-075`, binaires, avec mode de preuve, couvrant tous les points imposés | ✅ O | 55 critères définis, 8 groupes, récapitulatif §4.9 |
| 8 | §5 Recette : 12 scénarios nommés rejouables avec mocks | ✅ O | SC-V9-01→SC-V9-12 |
| 9 | §6 Risques priorisés avec action et responsable | ✅ O | R-V9-01→R-V9-14 (1 bloquant, 5 critiques, 6 importants, 2 INFO mineurs) |
| 10 | Sources Wave officielles citées (URL), faits non réinventés | ✅ O | Ligne 14 du tableau d'en-tête (`docs.wave.com/checkout`, `docs.wave.com/webhook`) |
| 11 | Aucun chiffre déformé : Découverte 2 000 / Boutique 5 000 / Atelier 10 000 ; pas d'usage de « ranga » | ✅ O | §1.3, CA-V9-011, CA-V9-064 ; `grep -rni 'ranga'` → 3 mentions normatives d'interdiction dans ce cahier, **0 usage produit** |
| 12 | Aucun code, aucun commit, aucun autre document modifié par cet agent | ✅ O | `git status --short` : seul `docs/journal.md` est modifié (par le chef de projet, avant ce travail) + ce nouveau fichier |
| 13 | Auto-revue relue (unicité des IDs, numérotation, cohérence) | ✅ O | `US-V9-01..10`, `F1..F7`, `CA-V9-001..075` sans doublon, groupes 4.1→4.9 uniques |

**VERDICT : DONE** — le cahier V9 est complet, binaire, prouvable et livré en spécification seule. Il est **en attente d'approbation du chef de projet** ; aucun code Wave n'a été écrit et la production reste en `WAVE_ENABLED=false` (conformément à la décision V9-D1). La validation des 55 critères `CA-V9-xxx` reste à faire par `@tester` sur le livrable code, via la grille du §5.

> **Auto-revue effectuée :** relecture intégrale du document, vérification de l'unicité des identifiants (CA-V9, US-V9, F, SC-V9, R-V9), de la cohérence des plages de numérotation (4.1→4.9), du rattachement de chaque risque à un critère, et de l'absence d'usage de « ranga », de prix « 1000 » pour Découverte et d'intention non prouvée. Correction notable : la condition « 0 occurrence de ranga » a été précisée en « 0 usage hors mentions normatives » pour ne pas s'auto-contredire.
