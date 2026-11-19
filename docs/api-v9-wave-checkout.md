# CONTRAT D'API REST V9 — « Wave Checkout + webhooks pour abonnements boutique »

| | |
|---|---|
| **Version** | **v2.9 additif proposé — 19/11/2026**. Quatre nouvelles routes API (`POST /api/wave/checkout/sessions`, `POST /api/webhooks/wave`, `GET /api/wave/config`, `GET /api/wave/admin/events`), **1 extension additive** (`GET /api/subscriptions/me` + `wavePaymentPending`) et **2 pages SPA de retour** (`/paiement-wave/succes`, `/paiement-wave/echec`). |
| **Auteur** | `@api-designer` |
| **Statut** | **Proposé — à valider par le chef de projet**. Spécification seule : **aucun code écrit, aucun commit, aucun autre document modifié**. En particulier **`docs/api.md` reste en v2.8** : sa fusion en v2.9 est le livrable de `@backend` (CA-V9-071). |
| **Nature** | Contractuellement **additif** : aucune méthode, aucun chemin, aucun code de succès, aucun champ existant n'est modifié ni renommé. Le previous `docs/api.md` v2.8 (encarts V3→V8, §1 conventions, §2 schémas, §3.9/§3.10) reste la source de vérité pour tout ce que V9 ne décrit pas. |
| **Références amont** | `docs/cahier-des-charges-v9-wave-checkout.md` (v1.0, 361 lignes, **approuvé** — §1.3 sessions API vs liens hébergés, §2.2 hors-périmètre, §4 les 55 `CA-V9-xxx`, §5 les 12 `SC-V9-xx`, §6 `R-V9-01…14`) · `docs/architecture-v9-wave-checkout.md` (v1.0, 622 lignes, **approuvée** — §3 configuration, §4 arborescence, §5 séquences (a)/(b), **§6 contrat résumé N1–N6**, §7 sécurité, §8 décisions `D-ARCH-1…10`) · `docs/design-v9-wave-checkout.md` (485 lignes — §3.1…§3.5 libellés, états et données interdites à l'écran) · `docs/api.md` v2.8 (§1.1 format d'erreur, §1.4 non-divulgation, §1.5 pagination, §2.11/§2.12/§2.15 schémas, §3.9 V7, §3.10 V8 E1/E4, §4 matrice des champs). |
| **Références code réel inspecté** | `server/src/routes/subscriptions.routes.ts:18-27` · `server/src/utils/storefront-validation.ts:12-14,25-39,73-91,102-128` · `server/src/app.ts:102-114` (CSRF `:112`, `express.json()` `:114`, modèle `/api/cron` `:111`) · `server/src/services/storefront.service.ts:310-385` (`getMySubscription`) et `:653-749` (`activateSubscription`) · `server/src/config.ts:15-53,77,233-282,330-371`. |
| **Sources officielles Wave** (citées, non réinventées — vérifiées le 19/11/2026 par le chef de projet au skill `docs-officielles`, relues par `@architecte`, et reconsultées le 19/11/2026 par `@api-designer` : HTTP 200 sur les deux URL) | `https://docs.wave.com/checkout` — `POST https://api.wave.com/v1/checkout/sessions` (Bearer, `amount` **chaîne**, `currency: "XOF"` sans décimal, `success_url`/`error_url` **HTTPS qualifiés**, `client_reference` ≤ 255 cara.), réponse `wave_launch_url` à ouvrir par le **navigateur** (jamais webview), `GET /v1/checkout/sessions/:id` et `GET /v1/checkout/sessions/search?client_reference=…` (diagnostic), fenêtre de signature sortante 5 min passé / 30 s futur, session expirant 30 min après création. · `https://docs.wave.com/webhook` — `checkout.session.completed` / `checkout.session.payment_failed`, en-tête `Wave-Signature: t=<unix>,v1=<hmac_sha256_hex>` (plusieurs `v1` en rotation), **payload signé = `timestamp + rawBody`** (concaténation directe, exemple JS officiel), rejet rejouer > 5 min, idempotence par `event.id`, **2xx en < 5 s**, retry jusqu'à 3 jours, secret webhook **distinct** de la clé API. **Le payload officiel de `payment_failed` ne porte ni `amount`, ni `currency`, ni `client_reference`** : la corrélation s'y fait par `data.id`. *Request signing* sortant et IP whitelisting sont documentés par Wave mais **écartés en V9** (Vercel sans IP fixes, `R-V9-05`). |
| **Périmètre du document** | Les 4 routes API, l'extension de `/me`, les 2 pages retour, la simulation **succès / chaque 4xx / 500** pour chaque endpoint, la matrice `CA-V9`/`SC-V9`, la non-régression et la Définition de Done du livrable documentaire. Aucun secret réel : `<WAVE_API_KEY>` / `<WAVE_WEBHOOK_SECRET>` / `<CSRF_TOKEN>` sont des placeholders. |

> **Convention de lecture.** Les schémas JSON donnés sont **contractuels** ; les tableaux de contraintes et les exemples de réponses sont **opposables**. `error.message` est toujours en français, affichable tel quel dans un `Toast` (§1.1 de `api.md`), sans SQL, stack, hôte, signature ni secret. `error.code` sert aux branchements logiques, jamais à l'affichage. Les 55 `CA-V9-xxx` restent à prouver par `@tester` sur le livrable code — ce document ne les valide pas.

---

## 1. Règles transverses V9

### 1.1 Règle d'or — la seule preuve d'activation

> **Un webhook signé HMAC-valide est la seule preuve d'activation.** `success_url`, `error_url`, un `200` de création de session, un `GET /v1/checkout/sessions/:id` ou `GET /v1/checkout/sessions/search?client_reference=…` même `COMPLETED`, et le drapeau `waveEnabled` **ne sont jamais activateurs**. Aucun de ces chemins n'écrit `started_at`, `ends_at`, `activated_by`, `activated_at`, n'approuve de produit, n'ouvre de boutique et n'envoie d'e-mail (CA-V9-018/021/037/053, `D-ARCH-3/5/8`, `R-V9-10`).

Le retour navigateur et le webhook sont deux chemins **distincts qui ne se croisent jamais du côté écriture** (`design-v9-wave-checkout.md:119`). Toute souscription non couverte par un webhook `completed` valide reste `PENDING`, y compris après un retour « succès ».

### 1.2 Authentification, CSRF et montage — par route

| Route | Garde | CSRF | Montage (`server/src/app.ts`) | En-têtes requis |
|---|---|---|---|---|
| `POST /api/wave/checkout/sessions` | `requireAuth` (session `user` **ou** `admin`) | **Oui** — double soumission : cookie `csrf_token` + `X-CSRF-Token` | Routeur `/api/wave` **après** `csrfProtection` (`:112`) et `express.json()` (`:114`), près de `:267` | `Cookie`, `X-CSRF-Token`, `Content-Type: application/json` |
| `POST /api/webhooks/wave` | **Aucun** (appel machine) | **Non** — Wave ne peut joindre ni cookie ni jeton | **Avant** `app.use('/api/cron', cronRouter)` (`:111`), donc avant CSRF (`:112`), avant `express.json()` (`:114`), avant la session (`:133`) et avant le limiteur global (`:192`) ; `express.raw({ type: 'application/json', limit: '256kb' })` **dans le routeur** | `Content-Type: application/json`, `Wave-Signature` ; **aucun** `Authorization`, cookie ou `X-CSRF-Token` |
| `GET /api/wave/config` | `requireAuth` | Non (méthode non mutante) | `/api/wave`, après les middlewares navigateur | `Cookie` |
| `GET /api/wave/admin/events` | `requireAdmin` (un `user` → `403`) | Non (méthode non mutante) | `/api/wave`, après les middlewares navigateur | `Cookie` |
| `/paiement-wave/succes`, `/paiement-wave/echec` | SPA `RequireUser` | n/a | Route front après `App.tsx:129` | Cookie `SameSite=Lax` transmis sur navigation top-level depuis Wave |

Le webhook est volontairement monté **avant le limiteur global** : les retry Wave ne doivent jamais recevoir `429 RATE_LIMITED` (§7.6 architecture). Réponse `Cache-Control: private, no-store` héritée de la politique commune (`api.md §1.1`).

### 1.3 Identifiants, idempotence et horizons temporels

| Notion | Règle contractuelle |
|---|---|
| Identifiants | `subscriptionId` : entier ≥ 1 (BIGINT). `sessionId` : `cos-…` (≤ 64 en base). `event.id` : chaîne ≤ 255 (`EV_…`). `id` de trace : entier ≥ 1. Aucun id d'un autre vendeur n'est exposé. |
| Idempotence `event.id` | Contrainte DB `uq_wave_event_id UNIQUE(event_id)`. Un doublon reçoit **2xx immédiat** (`{ received: true, duplicate: true }`), **0 seconde activation, 0 trace supplémentaire, 0 second e-mail**. Les statuts `PROCESSING`/`FAILED` sont rejouables : la reprise revérifie la souscription et rappelle `activateSubscription`, dont le `UPDATE … WHERE status='PENDING'` départage les courses (CA-V9-030/041/043/047). |
| Idempotence intention | Index partiel unique `uq_wave_intent_per_subscription` : **1 intention `SESSION_CREATED` vivante par souscription**, `client_reference` stable ; un double clic du vendeur ne crée pas une seconde session locale (CA-V9-013). |
| Signature — fenêtre | `t` en secondes Unix, horloge **serveur** : rejet si `now − t > 300` (5 min) ou `t − now > 30` (30 s de skew), ou si `t` absent/non numérique (CA-V9-032). |
| Session Wave | Expire 30 min après création côté Wave (doc officielle) ; ce délai est **informatif**, aucun timer local n'active ou ne désactive quoi que ce soit. |
| Retry Wave | Jusqu'à 3 jours ; accusé 2xx rapide sur événement déjà traité (doublon), `503` uniquement sur erreur technique réellement rejouable (statut de trace `FAILED`). |
| Budget temps | Tout accusé webhook (y compris doublon, non pertinent et `WAVE_ENABLED=false`) en **< 5 s** mesurées (CA-V9-036). |
| Limite de corps | Webhook : `express.raw(..., limit: '256kb')` ; au-delà, réponse d'erreur uniforme sans activation. |

### 1.4 Nommage, pagination, filtrage et dimensions des champs

- **Nommage JSON** : `camelCase` partout ; statuts et enums en `UPPER_SNAKE_CASE`. Les noms Wave `wave_launch_url`/`amount`/`client_reference` désignent le **payload Wave interne** ; la réponse ReVendsen expose `waveLaunchUrl` (jamais d'alias snake_case).
- **Query** : convention `api.md §1.5` — `page` (≥ 1, défaut 1) et **`per_page`** (1..48, défaut 12) ; la réponse expose `perPage`. `perPage` est accepté en alias interne (normalisation `normalizePaginationParams`, `storefront-validation.ts:87-91`) mais `per_page` est la forme contractuelle. Un `page`/`per_page` hors bornes → `400 VALIDATION_ERROR`, jamais une correction silencieuse. Liste vide → `200` avec `items: []`.
- **Filtrage** : `subscriptionId` (entier ≥ 1) sur la file admin uniquement. Aucun filtre `status` supplémentaire n'est ajouté en V9 (la traduction « en attente / confirmé / échoué » est faite côté UI à partir du `status` renvoyé, §2.4).

| Champ | Type | Dimensions / contraintes |
|---|---|---|
| `subscriptionId` | number | Entier ≥ 1, BIGINT ; propriété du vendeur connecté exigée |
| `amount` (vers Wave) | string | `"2000"`, `"5000"` ou `"10000"` — **jamais** de point, de virgule, de décimale ; dérivé de `subscription_plans.price_fcfa`, jamais de `req.body` |
| `currency` | string | `"XOF"` exact (aucune autre devise) |
| `success_url` / `error_url` (vers Wave) | string | URL HTTPS **entièrement qualifiée**, dérivées de `SITE_URL` (garde de démarrage `WAVE_ENABLED=true ⇒ SITE_URL https`) ; **aucun query param** dans V9 |
| `client_reference` | string | `wave-sub-<subscriptionId>-<hmac8>`, ≤ 255 ; `hmac8` = 8 premiers hex de `HMAC-SHA256(SESSION_SECRET, 'wave-ref:' + subscriptionId)` ; exemple fictif `wave-sub-41-3f9a2c17` (21 car.) pour l'id 41 — stable et nondevinable, aucun prix ni donnée vendeur |
| `waveLaunchUrl` | string | URL absolue `https://pay.wave.com/c/cos-…` en production (URL factice en test) |
| `sessionId` | string | `cos-` + suffixe ; ≤ 64 en base |
| `Wave-Signature` | string | `t=<unix>,v1=<64 hex>[,v1=<64 hex>…]` ; au moins un `v1`, valeurs multiples acceptées en rotation |
| `event.id` | string | ≤ 255, forme `EV_…` ; clé d'idempotence |
| `waveEnabled` | boolean | Seul champ public de configuration ; ni clé, ni préfixe, ni URL d'API, ni id admin |

### 1.5 Convention d'erreurs uniforme (identique à `api.md §1.1`)

Format de base, pour **tous** les 4xx/5xx V9, y compris le webhook :

```json
{ "error": { "code": "CODE_STABLE", "message": "Message français affichable" } }
```

La validation ajoute `details` :

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Données invalides", "details": [ { "field": "subscriptionId", "message": "subscriptionId doit être un entier ≥ 1" } ] } }
```

| Code | HTTP | Quand | Corps (exemple) |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Corps ou query ne satisfait pas le schéma zod (bornes, type, enum) | `{ "error": { "code": "VALIDATION_ERROR", "message": "Données invalides", "details": [ { "field": "subscriptionId", "message": "subscriptionId doit être un entier ≥ 1" } ] } }` |
| `INVALID_SIGNATURE` | 400 | Webhook : en-tête absent/malformé, HMAC invalide pour **toutes** les valeurs `v1`, `t` hors fenêtre | `{ "error": { "code": "INVALID_SIGNATURE", "message": "Signature Wave invalide" } }` |
| `INVALID_PAYLOAD` | 400 | Webhook : `Content-Type` absent, corps brut non-JSON ou enveloppe `{id,type,data}` invalide | `{ "error": { "code": "INVALID_PAYLOAD", "message": "Charge utile Wave invalide" } }` |
| `UNAUTHENTICATED` | 401 | Aucune session valide sur `requireAuth` / `requireAdmin` | `{ "error": { "code": "UNAUTHENTICATED", "message": "Authentification requise" } }` |
| `FORBIDDEN` | 403 | Session `user` sur la route `requireAdmin` | `{ "error": { "code": "FORBIDDEN", "message": "Accès réservé aux administrateurs" } }` |
| `NOT_FOUND` | 404 | **Routes existantes uniquement** — politique de non-divulgation inchangée (`api.md §1.4`) | `{ "error": { "code": "NOT_FOUND", "message": "Ressource introuvable" } }` |
| `WAVE_SUBSCRIPTION_NOT_FOUND` | 404 | N1 : souscription introuvable **ou appartenant à autrui** — même message dans les deux cas (spécialisation Wave de la famille `NOT_FOUND`, aucun code existant modifié) | `{ "error": { "code": "WAVE_SUBSCRIPTION_NOT_FOUND", "message": "Abonnement introuvable" } }` |
| `WAVE_SUBSCRIPTION_NOT_PENDING` | 409 | N1 : souscription `ACTIVE`/`EXPIRED`/`CANCELLED` — 0 appel Wave, 0 écriture | `{ "error": { "code": "WAVE_SUBSCRIPTION_NOT_PENDING", "message": "Cette demande n'est pas en attente de paiement" } }` |
| `WAVE_PAYMENT_METHOD_MISMATCH` | 409 | N1 : `payment_method` ≠ `'wave'` (OM, virement, legacy `NULL`) | `{ "error": { "code": "WAVE_PAYMENT_METHOD_MISMATCH", "message": "Cette demande utilise un autre moyen de paiement" } }` |
| `INVALID_STATUS` / `SUBSCRIPTION_ALREADY_ACTIVE` / `SLUG_TAKEN` | 409 | **Routes existantes uniquement** ; sur le chemin webhook, `INVALID_STATUS`/`SUBSCRIPTION_ALREADY_ACTIVE` renvoyés par `activateSubscription` sont interprétés « déjà gagné » → **2xx**, jamais répercutés à Wave | `{ "error": { "code": "INVALID_STATUS", "message": "Cette demande n'est pas en attente d'activation" } }` |
| `WAVE_DISABLED` | 503 | Toute **tentative serveur** Wave quand `WAVE_ENABLED=false` (défaut prod) : 0 appel HTTP sortant, 0 écriture. **Exception : le webhook répond `200`** (§1.6) | `{ "error": { "code": "WAVE_DISABLED", "message": "Le paiement automatique Wave est désactivé. Le paiement manuel reste disponible." } }` |
| `WAVE_UPSTREAM_ERROR` | 502 | N1 : appel `POST /api.wave.com/v1/checkout/sessions` en échec ou timeout 5 s ; souscription reste `PENDING` | `{ "error": { "code": "WAVE_UPSTREAM_ERROR", "message": "Impossible d'ouvrir Wave pour le moment. Le paiement manuel reste disponible ci-dessous." } }` |
| `WAVE_MISCONFIGURED` | 503 | Webhook : `WAVE_ENABLED=true` mais secret webhook inutilisable (filet défensif ; la garde de démarrage refuse normalement le démarrage) | `{ "error": { "code": "WAVE_MISCONFIGURED", "message": "Configuration Wave incomplète" } }` |
| `INTERNAL_ERROR` | 500 (503 sur le webhook) | Erreur technique inattendue. **Sur le webhook uniquement**, le code `INTERNAL_ERROR` est renvoyé en **503** pour déclencher le retry Wave (statut de trace `FAILED`) ; corps générique, aucune fuite d'information | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

### 1.6 Réponses 2xx du webhook (accusés de réception)

| Statut de trace | Corps | Signification |
|---|---|---|
| `COMPLETED` | `{ "received": true }` | Événement `completed` valide, activation réussie (ou « déjà gagné ») |
| `PAYMENT_FAILED` | `{ "received": true }` | Échec de paiement accusé, aucune activation |
| doublon terminal | `{ "received": true, "duplicate": true }` | `event.id` déjà traité, aucun effet |
| `IGNORED` | `{ "received": true, "ignored": true }` | Événement signé mais non pertinent (autre `type`, référence inconnue, montant/devise/méthode/statut incohérents) |
| aucune écriture | `{ "received": true, "ignored": true, "reason": "WAVE_DISABLED" }` | **Exception documentée** : `WAVE_ENABLED=false` → 200 immédiat, **pas de 503**, afin d'éviter les retries Wave ; aucune vérification HMAC (aucun secret à utiliser), aucune ligne de trace |

### 1.7 Détails tranchés par `@api-designer` (non spécifiés en amont)

1. **Codes Wave supplémentaires** : le brief impose `WAVE_DISABLED`, `INVALID_SIGNATURE`, `INVALID_PAYLOAD` ; l'architecture approuvée §6 définit en plus `WAVE_SUBSCRIPTION_NOT_FOUND`, `WAVE_SUBSCRIPTION_NOT_PENDING`, `WAVE_PAYMENT_METHOD_MISMATCH`, `WAVE_UPSTREAM_ERROR`, `WAVE_MISCONFIGURED`. **Tous sont conservés** : les trois du brief sont obligatoires minimum, les cinq autres sont nécessaires pour ne pas contredire l'architecture.
2. **`WAVE_SUBSCRIPTION_NOT_FOUND`** est une spécialisation non divulgatrice de la famille `NOT_FOUND` (404) ; le code `NOT_FOUND` des routes existantes reste strictement inchangé.
3. **`per_page`** est le paramètre de query contractuel (`api.md §1.5`, `storefront-validation.ts:87-91`) ; `perPage` dans l'architecture §6 est lu comme le **champ de réponse**, avec alias interne toléré.
4. **`waveLaunchUrl` / `sessionId`** en camelCase dans la réponse N1 : projection API de `wave_launch_url` / `data.id` Wave ; aucun champ snake_case n'est exposé.
5. **`INVALID_SIGNATURE` = 400 en contrat**, sans alternative 401 : la doc Wave montre 401, le brief et l'architecture imposent 400 ; les consommateurs n'ont qu'un seul code à gérer.
6. **`INTERNAL_ERROR` = 500 ailleurs, 503 sur le webhook** uniquement (déclencheur de retry) ; c'est la seule dérogation de statut pour un code existant.
7. **`payment_failed` ne porte pas `amount`/`currency`/`client_reference`** (vérifié sur `docs.wave.com/webhook`) : les contrôles montant/devise ne s'appliquent qu'à `completed` ; sur `payment_failed`, la corrélation se fait par `data.id` (`session_id`) en priorité, complétée par `client_reference` si présent. Aucun contrôle montant/devise n'est exigé sur un événement qui n'active jamais.
8. **`Content-Type: application/json` requis** sur le webhook : `express.raw({type:'application/json'})` ne capture pas un corps sans ce type → `400 INVALID_PAYLOAD`.
9. **Messages d'erreur** : `Impossible d'ouvrir Wave pour le moment. Le paiement manuel reste disponible ci-dessous.` est repris mot pour mot du design (T05) pour `WAVE_UPSTREAM_ERROR` ; les autres messages sont rédigés en français affichable, sans détail technique.
10. **File admin N4** : l'API expose `eventId` et `sessionId` (traçabilité admin, `requireAdmin`) mais **le design interdit de les rendre à l'écran** (`design-v9-wave-checkout.md:286`) — obligation UI, pas retrait de champ API.
11. **Aucun filtre `status` sur N4** : l'architecture ne liste que `subscriptionId`, `page`, `per_page` ; le front mappe les statuts bruts vers « En attente / Confirmé / Échoué » (§2.4).
12. **`WAVE_ENABLED=false` court-circuite la vérification HMAC du webhook** : aucun secret présent en production, d'où le `200 {reason:'WAVE_DISABLED'}` et l'absence d'écriture.

---

## 2. Nouvelles routes

### 2.1 N1 — `POST /api/wave/checkout/sessions`

| | |
|---|---|
| **Méthode & chemin** | `POST /api/wave/checkout/sessions` (exact, sans slash final) |
| **Accès** | `requireAuth` + CSRF navigateur (`Cookie` + `X-CSRF-Token`) |
| **En-têtes** | `Content-Type: application/json` ; `Cookie: csrf_token=…; connect.sid=…` ; `X-CSRF-Token: <CSRF_TOKEN>` |
| **Succès** | `200` (pas de `201` : la ressource créée est distante et l'intention locale est un effet de bord) |

**Corps de requête** — schéma exact :

```json
{ "subscriptionId": 41 }
```

| Champ | Type | Constraint |
|---|---|---|
| `subscriptionId` | number | **Requis**, entier ≥ 1 ; doit désigner une souscription du vendeur connecté |
| `amount`, `currency`, `client_reference`, `success_url`, `error_url` | — | **Ne font pas partie du contrat client** ; tout champ `amount` envoyé est ignoré (zod `.object()` non strict) et le montant est calculé serveur (CA-V9-011/017) |

**Réponse 200** — schéma exact :

```json
{ "waveLaunchUrl": "https://pay.wave.com/c/cos-1b01sghpg100j", "sessionId": "cos-1b01sghpg100j" }
```

| Champ | Type | Contraintes |
|---|---|---|
| `waveLaunchUrl` | string | URL absolue HTTPS `pay.wave.com/c/cos-…` (factice en test) — à ouvrir par le navigateur |
| `sessionId` | string | Identifiant Wave `cos-…` (≤ 64 en base) ; permet la corrélation du webhook `payment_failed` |
| — | — | **Aucun secret, aucun `client_reference` d'autrui, aucun montant, aucune donnée d'un autre vendeur** (CA-V9-014) |

**Erreurs :**

| Code | HTTP | Quand | Corps |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | Pas de session | `{ "error": { "code": "UNAUTHENTICATED", "message": "Authentification requise" } }` |
| `VALIDATION_ERROR` | 400 | `subscriptionId` absent, non entier ou ≤ 0 | `{ "error": { "code": "VALIDATION_ERROR", "message": "Données invalides", "details": [ { "field": "subscriptionId", "message": "subscriptionId doit être un entier ≥ 1" } ] } }` |
| `WAVE_SUBSCRIPTION_NOT_FOUND` | 404 | Souscription inexistante **ou d'un autre vendeur** (message unique) | `{ "error": { "code": "WAVE_SUBSCRIPTION_NOT_FOUND", "message": "Abonnement introuvable" } }` |
| `WAVE_SUBSCRIPTION_NOT_PENDING` | 409 | Souscription `ACTIVE`/`EXPIRED`/`CANCELLED` | `{ "error": { "code": "WAVE_SUBSCRIPTION_NOT_PENDING", "message": "Cette demande n'est pas en attente de paiement" } }` |
| `WAVE_PAYMENT_METHOD_MISMATCH` | 409 | `payment_method` ≠ `'wave'` | `{ "error": { "code": "WAVE_PAYMENT_METHOD_MISMATCH", "message": "Cette demande utilise un autre moyen de paiement" } }` |
| `WAVE_DISABLED` | 503 | `WAVE_ENABLED=false` (prod actuelle), **avant tout appel HTTP** | `{ "error": { "code": "WAVE_DISABLED", "message": "Le paiement automatique Wave est désactivé. Le paiement manuel reste disponible." } }` |
| `WAVE_UPSTREAM_ERROR` | 502 | Wave renvoie 5xx ou ne répond pas sous 5 s | `{ "error": { "code": "WAVE_UPSTREAM_ERROR", "message": "Impossible d'ouvrir Wave pour le moment. Le paiement manuel reste disponible ci-dessous." } }` |
| `INTERNAL_ERROR` | 500 | Erreur serveur inattendue (aucun détail technique) | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Simulation des réponses (consommateur web et mobile) :**

| Scénario | Requête | Réponse attendue |
|---|---|---|
| Succès | `{ "subscriptionId": 41 }`, session `PENDING`/`wave` | `200` `{"waveLaunchUrl":"https://pay.wave.com/c/cos-1b01sghpg100j","sessionId":"cos-1b01sghpg100j"}` |
| Anonyme | idem sans cookie | `401` `{"error":{"code":"UNAUTHENTICATED","message":"Authentification requise"}}` |
| Validation | `{}` | `400` `{"error":{"code":"VALIDATION_ERROR","message":"Données invalides","details":[{"field":"subscriptionId","message":"subscriptionId doit être un entier ≥ 1"}]}}` |
| Introuvable / autrui | `{ "subscriptionId": 99999 }` | `404` `{"error":{"code":"WAVE_SUBSCRIPTION_NOT_FOUND","message":"Abonnement introuvable"}}` |
| Déjà actif | `{ "subscriptionId": 41 }`, statut `ACTIVE` | `409` `{"error":{"code":"WAVE_SUBSCRIPTION_NOT_PENDING","message":"Cette demande n'est pas en attente de paiement"}}` |
| Mauvais moyen | `{ "subscriptionId": 41 }`, `payment_method='orange_money'` | `409` `{"error":{"code":"WAVE_PAYMENT_METHOD_MISMATCH","message":"Cette demande utilise un autre moyen de paiement"}}` |
| Désactivé | `WAVE_ENABLED=false` | `503` `{"error":{"code":"WAVE_DISABLED","message":"Le paiement automatique Wave est désactivé. Le paiement manuel reste disponible."}}` |
| Wave en échec | mock HTTP 500 sur `POST /v1/checkout/sessions` | `502` `{"error":{"code":"WAVE_UPSTREAM_ERROR","message":"Impossible d'ouvrir Wave pour le moment. Le paiement manuel reste disponible ci-dessous."}}` |
| Erreur interne | DB indisponible | `500` `{"error":{"code":"INTERNAL_ERROR","message":"Erreur interne du serveur"}}` |

**Exemples curl :**

```bash
# Succès (clé de session et cookie CSRF fictifs — jamais de clé Wave ici)
curl -i -X POST 'https://revends.vercel.app/api/wave/checkout/sessions' \
  -b 'csrf_token=<CSRF_TOKEN>; connect.sid=<SESSION_COOKIE>' \
  -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: <CSRF_TOKEN>' \
  -d '{"subscriptionId":41}'

# Mode désactivé (prod actuelle) — 0 appel Wave sortant
curl -i -X POST 'https://revends.vercel.app/api/wave/checkout/sessions' \
  -b 'csrf_token=<CSRF_TOKEN>; connect.sid=<SESSION_COOKIE>' \
  -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: <CSRF_TOKEN>' \
  -d '{"subscriptionId":41}'
# → 503 {"error":{"code":"WAVE_DISABLED", ... }}
```

**Effets de bord (succès uniquement) :** exactement **1 appel** `POST https://api.wave.com/v1/checkout/sessions` avec `Authorization: Bearer <WAVE_API_KEY>`, `{ amount: "2000"|"5000"|"10000", currency: "XOF", success_url: "<SITE_URL>/paiement-wave/succes", error_url: "<SITE_URL>/paiement-wave/echec", client_reference: "wave-sub-<id>-<hmac8>" }` ; upsert d'une intention `SESSION_CREATED` puis pose de `session_id` ; **0 activation, 0 e-mail, 0 écriture sur `seller_subscriptions`**. En erreur Wave : intention conservée, souscription `PENDING` (CA-V9-010/011/012/013/014/015/016/053).

**Critères couverts :** `CA-V9-001`, `010`, `011`, `012`, `013`, `014`, `015`, `016`, `017`, `053` · scénarios `SC-V9-01`, `SC-V9-08`, `SC-V9-11`.

### 2.2 N2 — `POST /api/webhooks/wave`

| | |
|---|---|
| **Méthode & chemin** | `POST /api/webhooks/wave` (exact, pluriel `webhooks`, sans slash final) |
| **Accès** | **Aucun** : ni session, ni cookie, ni token CSRF, ni `Authorization` |
| **En-têtes** | `Content-Type: application/json` (**obligatoire** pour `express.raw`), `Wave-Signature: t=<unix>,v1=<hmac_hex>[,v1=<hmac_hex>…]` |
| **Succès** | `200` (quatre variantes de corps, §1.6) — toujours **< 5 s** |

**Corps de requête** — enveloppe JSON signée (octets bruts, jamais re-sérialisés) :

```json
{
  "id": "EV_QvEZuDSQbLdI",
  "type": "checkout.session.completed",
  "data": {
    "id": "cos-1b01sghpg100j",
    "amount": "2000",
    "currency": "XOF",
    "client_reference": "wave-sub-41-3f9a2c17"
  }
}
```

| Champ | Type | Contraintes |
|---|---|---|
| `id` | string | ≤ 255, non vide — clé d'idempotence |
| `type` | string | Enum traité : `checkout.session.completed`, `checkout.session.payment_failed` ; tout autre type → `IGNORED` + 2xx |
| `data.id` | string | `cos-…`, ≤ 64 — session Wave ; **corrélation prioritaire sur `payment_failed`** |
| `data.amount` | string | Chaîne de chiffres entiers ; comparée à `String(plan.price_fcfa)` sur `completed` uniquement |
| `data.currency` | string | `"XOF"` sur `completed` uniquement |
| `data.client_reference` | string \| null | ≤ 255 ; corrélation secondaire ; **absent du payload officiel `payment_failed`** |

**Réponses 2xx — schémas exacts :**

```json
{ "received": true }
{ "received": true, "duplicate": true }
{ "received": true, "ignored": true }
{ "received": true, "ignored": true, "reason": "WAVE_DISABLED" }
```

**Erreurs :**

| Code | HTTP | Quand | Corps |
|---|---|---|---|
| `INVALID_SIGNATURE` | 400 | En-tête `Wave-Signature` absent/malformé, HMAC invalide pour toutes les `v1`, `t` absent/non numérique/hors fenêtre (300 s passé / 30 s futur), corps réordonné ou réespacé | `{ "error": { "code": "INVALID_SIGNATURE", "message": "Signature Wave invalide" } }` |
| `INVALID_PAYLOAD` | 400 | `Content-Type` absent, JSON invalide ou enveloppe `{id,type,data}` invalide | `{ "error": { "code": "INVALID_PAYLOAD", "message": "Charge utile Wave invalide" } }` |
| `WAVE_MISCONFIGURED` | 503 | `WAVE_ENABLED=true` mais secret webhook inutilisable | `{ "error": { "code": "WAVE_MISCONFIGURED", "message": "Configuration Wave incomplète" } }` |
| `INTERNAL_ERROR` | **503** | Erreur technique pendant l'activation (trace `FAILED`) — **déclenche volontairement le retry Wave** ; jamais de doublon à la reprise | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

> **Pas de `401`, `403` ou `404` sur cette route** : elle est machine, non divulgatrice, et accuse systématiquement 2xx pour tout événement signé non pertinent. Le `WAVE_DISABLED` est un **200**, pas un 503 (§1.6).

**Simulation des réponses :**

| Scénario | Requête | Réponse attendue |
|---|---|---|
| Succès `completed` | Signature valide, montant 2000/XOF/référence liée | `200` `{"received":true}` — `ACTIVE`, `activated_by:7`, 1 e-mail |
| Doublon | Même `event.id`, 2ᵉ et 3ᵉ envois | `200` `{"received":true,"duplicate":true}` — 0 activation supplémentaire |
| Non pertinent | `type` inconnu, signature valide | `200` `{"received":true,"ignored":true}` |
| Désactivé | `WAVE_ENABLED=false`, sans signature | `200` `{"received":true,"ignored":true,"reason":"WAVE_DISABLED"}` |
| Signature absente | pas d'en-tête `Wave-Signature` | `400` `{"error":{"code":"INVALID_SIGNATURE","message":"Signature Wave invalide"}}` |
| Mauvais secret | `v1` calculé avec un autre secret | `400` `{"error":{"code":"INVALID_SIGNATURE","message":"Signature Wave invalide"}}` |
| Rejoué (6 min) | `t = now − 360` | `400` `{"error":{"code":"INVALID_SIGNATURE","message":"Signature Wave invalide"}}` |
| Rotation | `v1=<mauvais>,v1=<bon>` | `200` `{"received":true}` |
| Corps resérialisé | HMAC calculé sur le corps d'origine, espaces retirés | `400` `{"error":{"code":"INVALID_SIGNATURE","message":"Signature Wave invalide"}}` |
| JSON invalide | Signature valide sur `{ oui` | `400` `{"error":{"code":"INVALID_PAYLOAD","message":"Charge utile Wave invalide"}}` |
| Config inutilisable | `WAVE_ENABLED=true`, secret absent | `503` `{"error":{"code":"WAVE_MISCONFIGURED","message":"Configuration Wave incomplète"}}` |
| Erreur interne | DB indisponible pendant l'activation | `503` `{"error":{"code":"INTERNAL_ERROR","message":"Erreur interne du serveur"}}` |

**Exemple curl (aucun secret littéral, aucun cookie) :**

```bash
BODY='{"id":"EV_QvEZuDSQbLdI","type":"checkout.session.completed","data":{"id":"cos-1b01sghpg100j","amount":"2000","currency":"XOF","client_reference":"wave-sub-41-3f9a2c17"}}'
T=$(date +%s)
SIG=$(printf '%s%s' "$T" "$BODY" | openssl dgst -sha256 -hmac "$WAVE_WEBHOOK_SECRET" | sed 's/^.* //')
curl -i -X POST 'https://revends.vercel.app/api/webhooks/wave' \
  -H 'Content-Type: application/json' \
  -H "Wave-Signature: t=$T,v1=$SIG" \
  --data-binary "$BODY"
# → 200 {"received":true}
```

**Effets de bord :** écriture dans `wave_checkout_events` unique (claim `event_id`, statut terminal) ; sur `completed` valide, **appel unique** à `activateSubscription(config.wave.systemAdminId /* 7 */, targetId)` — dates 30 jours, `activated_by=7`, auto-approbation, badges, 1 e-mail post-commit ; sur `payment_failed`/`IGNORED`/doublon, **0 activation et 0 e-mail** ; ni `payment_method` ni `payment_reference` ne sont modifiés (CA-V9-037/040/041/043/045/046/047).

**Critères couverts :** `CA-V9-006`, `018`, `030`, `031`, `032`, `033`, `034`, `035`, `036`, `037`, `038`, `040`, `041`, `042`, `043`, `044`, `045`, `046`, `047`, `050`, `051`, `052`, `053` · scénarios `SC-V9-01`→`07`, `SC-V9-10`, `SC-V9-11`.

### 2.3 N3 — `GET /api/wave/config`

| | |
|---|---|
| **Méthode & chemin** | `GET /api/wave/config` (exact) |
| **Accès** | `requireAuth` ; aucun token CSRF (GET) |
| **En-têtes** | `Cookie` |
| **Succès** | `200` |

**Réponse 200 — schéma exact (un seul champ) :**

```json
{ "waveEnabled": true }
```

| Champ | Type | Contraintes |
|---|---|---|
| `waveEnabled` | boolean | `config.wave.enabled` ; **aucun autre champ** : ni clé, ni préfixe de clé, ni URL d'API, ni secret webhook, ni identifiant admin, ni prix. `false` ⇒ le front ne rend aucun bouton de création de session (CA-V9-002) ; ce booléen n'autorise aucune écriture (CA-V9-021). |

**Erreurs :**

| Code | HTTP | Quand | Corps |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | Pas de session | `{ "error": { "code": "UNAUTHENTICATED", "message": "Authentification requise" } }` |
| `INTERNAL_ERROR` | 500 | Erreur serveur inattendue | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Simulation des réponses :**

| Scénario | Requête | Réponse attendue |
|---|---|---|
| Succès activé | Session valide, `WAVE_ENABLED=true` | `200` `{"waveEnabled":true}` |
| Succès désactivé (prod) | Session valide, `WAVE_ENABLED=false` ou absent | `200` `{"waveEnabled":false}` |
| Anonyme | sans cookie | `401` `{"error":{"code":"UNAUTHENTICATED","message":"Authentification requise"}}` |
| Erreur interne | failure inattendue | `500` `{"error":{"code":"INTERNAL_ERROR","message":"Erreur interne du serveur"}}` |

**Exemple curl :**

```bash
curl -i 'https://revends.vercel.app/api/wave/config' \
  -H 'Cookie: connect.sid=<SESSION_COOKIE>'
# → 200 {"waveEnabled":false}
```

**Effets de bord :** **aucun** (lecture pure, aucune table lue). **Critères couverts :** `CA-V9-001`, `002`, `004`, `005`, `070`, `074` · scénarios `SC-V9-08` (+ `T01`, `T02` du design).

### 2.4 N4 — `GET /api/wave/admin/events`

| | |
|---|---|
| **Méthode & chemin** | `GET /api/wave/admin/events` (exact) |
| **Accès** | `requireAdmin` (un `user` → `403 FORBIDDEN`) ; aucun token CSRF (GET) |
| **Query** | `subscriptionId?` (entier ≥ 1), `page` (≥ 1, défaut 1), `per_page` (1..48, défaut 12) |
| **Succès** | `200` enveloppe paginée `api.md §1.5` |

**Corps de requête :** aucun. **Query params :**

| Paramètre | Type | Contraintes |
|---|---|---|
| `subscriptionId` | number | Optionnel, entier ≥ 1 ; restreint la file à une souscription |
| `page` | number | ≥ 1, défaut `1` |
| `per_page` | number | 1..48, défaut `12` (`perPage` accepté en alias interne) ; hors bornes → `400 VALIDATION_ERROR` |

**Réponse 200 — schéma exact :**

```json
{
  "items": [
    {
      "id": 17,
      "subscriptionId": 41,
      "sellerId": 12,
      "eventId": "EV_QvEZuDSQbLdI",
      "sessionId": "cos-1b01sghpg100j",
      "eventType": "checkout.session.completed",
      "amountFcfa": 2000,
      "currency": "XOF",
      "status": "COMPLETED",
      "activated": true,
      "receivedAt": "2026-11-19T10:15:45.000Z",
      "processedAt": "2026-11-19T10:15:46.000Z",
      "createdAt": "2026-11-19T10:15:44.000Z"
    }
  ],
  "page": 1,
  "perPage": 12,
  "total": 1,
  "totalPages": 1
}
```

| Champ | Type | Contraintes |
|---|---|---|
| `items[]` | array | Tri `created_at DESC` ; `[]` si aucun événement (`200`, jamais `404`) |
| `id`, `subscriptionId`, `sellerId` | number | Entiers ≥ 1 |
| `eventId` | string \| null | `EV_…` ; `null` sur une intention `SESSION_CREATED` |
| `sessionId` | string \| null | `cos-…` ; corrèle `payment_failed` |
| `eventType` | string \| null | Type Wave reçu ; `null` sur une intention |
| `amountFcfa` | number | Entier FCFA > 0, sans décimale |
| `currency` | string | `"XOF"` |
| `status` | enum | `SESSION_CREATED` · `PROCESSING` · `COMPLETED` · `PAYMENT_FAILED` · `IGNORED` · `FAILED`. Mapping UI : `SESSION_CREATED`/`PROCESSING` → « En attente », `COMPLETED` → « Confirmé », `PAYMENT_FAILED`/`FAILED` → « Échoué », `IGNORED` → case grise « — », absence → « — » |
| `activated` | boolean | `true` uniquement si `activateSubscription` a réussi |
| `receivedAt`, `processedAt` | string \| null | ISO 8601 UTC |
| `createdAt` | string | ISO 8601 UTC |
| `totalPages` | number | `ceil(total / perPage)` |

**Erreurs :**

| Code | HTTP | Quand | Corps |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | Pas de session | `{ "error": { "code": "UNAUTHENTICATED", "message": "Authentification requise" } }` |
| `FORBIDDEN` | 403 | Session `user` (rôle insuffisant) | `{ "error": { "code": "FORBIDDEN", "message": "Accès réservé aux administrateurs" } }` |
| `VALIDATION_ERROR` | 400 | `subscriptionId` ≤ 0, `page` < 1 ou `per_page` hors 1..48 | `{ "error": { "code": "VALIDATION_ERROR", "message": "Données invalides", "details": [ { "field": "per_page", "message": "per_page doit être compris entre 1 et 48" } ] } }` |
| `INTERNAL_ERROR` | 500 | Erreur serveur inattendue (table `023` absente, par exemple) | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Simulation des réponses :**

| Scénario | Requête | Réponse attendue |
|---|---|---|
| Succès | Admin, `?page=1&per_page=12` | `200` enveloppe ci-dessus (ou `items: []`, `total: 0`, `totalPages: 0`) |
| Filtre | Admin, `?subscriptionId=41` | `200` avec uniquement les événements de la souscription 41 |
| Anonyme | sans cookie | `401` `{"error":{"code":"UNAUTHENTICATED","message":"Authentification requise"}}` |
| Non-admin | session `user` | `403` `{"error":{"code":"FORBIDDEN","message":"Accès réservé aux administrateurs"}}` |
| Validation | `?per_page=49` | `400` `{"error":{"code":"VALIDATION_ERROR","message":"Données invalides","details":[{"field":"per_page","message":"per_page doit être compris entre 1 et 48"}]}}` |
| Erreur interne | table absente | `500` `{"error":{"code":"INTERNAL_ERROR","message":"Erreur interne du serveur"}}` |

**Exemple curl :**

```bash
curl -i 'https://revends.vercel.app/api/wave/admin/events?subscriptionId=41&page=1&per_page=12' \
  -H 'Cookie: connect.sid=<ADMIN_SESSION_COOKIE>'
```

**Effets de bord :** **aucun** (lecture paginée de `wave_checkout_events`). Aucune donnée Wave n'est exposée publiquement ; l'UI n'affiche ni `eventId`, ni `sessionId`, ni `client_reference` (design §3.5). **Critères couverts :** `CA-V9-004`, `050`, `051`, `052` · scénarios `SC-V9-05` (consultation), `SC-V9-12`.

---

## 3. Extension additive de `GET /api/subscriptions/me`

**Méthode, chemin, garde, codes et champs existants : strictement inchangés.** Aucune query ajoutée. L'extension n'est qu'un champ optionnel de l'objet `subscription` (`D-ARCH-3`, option (a)), calculé sans lire la table `023` — donc sans risque si la migration manuelle n'a pas encore été appliquée en prod.

**Avant (contrat v2.8, `api.md §2.12` + extension E4) :**

```json
{
  "subscription": {
    "id": 41, "status": "PENDING", "slug": "mode-dakar",
    "plan": { "id": 1, "name": "Découverte", "priceFcfa": 2000, "quota": 10, "durationDays": 30 },
    "supersedesId": null, "startedAt": null, "endsAt": null, "daysRemaining": 0,
    "activatedBy": null, "activatedAt": null,
    "createdAt": "2026-11-19T09:00:00.000Z"
  },
  "usage": null, "listings": [], "plans": [ "…3 paliers inchangés…" ],
  "profile": { "logoUrl": null, "bannerUrl": null, "publicDescription": null, "collecteAddressSet": false }
}
```

**Après (v2.9 proposé — seul ajout, noté `+`) :**

```json
{
  "subscription": {
    "id": 41, "status": "PENDING", "slug": "mode-dakar",
    "plan": { "id": 1, "name": "Découverte", "priceFcfa": 2000, "quota": 10, "durationDays": 30 },
    "supersedesId": null, "startedAt": null, "endsAt": null, "daysRemaining": 0,
    "activatedBy": null, "activatedAt": null,
    "createdAt": "2026-11-19T09:00:00.000Z",
    "wavePaymentPending": true
  },
  "usage": null, "listings": [], "plans": [ "…3 paliers inchangés…" ],
  "profile": { "logoUrl": null, "bannerUrl": null, "publicDescription": null, "collecteAddressSet": false }
}
```

| Propriété | Type | Règle de calcul |
|---|---|---|
| `wavePaymentPending` | boolean | `sub.status === 'PENDING' && sub.payment_method === 'wave'`. `true` pour une souscription Wave en attente (session API **ou** lien hébergé — distinction non exigée par CA-V9-019) ; `false` pour `orange_money`, `virement` et legacy `NULL`. **Champ absent si `subscription === null`** (aucun `false` fantôme). Aucune valeur de `paymentReference` n'est exposée. |

**Compatibilité V8.5 :** champ optionnel côté client (`Subscription.wavePaymentPending?: boolean`), même précédent que l'extension E4 de v2.8 ; un client V8.5 l'ignore, un client V9 qui ne le reçoit pas retombe sur le libellé neutre inchangé (`design-v9-wave-checkout.md:211`). Codes `200`/`401`/`500` et enveloppe `{subscription, usage, listings, plans, profile}` identiques. Aucun appel HTTP supplémentaire sur la page (CA-V9-019/022/062).

**Simulation des réponses (inchangées hors champ ajouté) :**

| Scénario | Réponse attendue |
|---|---|
| Succès Wave `PENDING` | `200` avec `subscription.status:"PENDING"` et `"wavePaymentPending":true` |
| Succès OM/virement `PENDING` | `200` avec `"wavePaymentPending":false` — libellé UI inchangé |
| Succès sans abonnement | `200` `"subscription":null` — **aucun champ `wavePaymentPending`**, `"usage":null`, `"listings":[]` |
| Anonyme | `401` `{"error":{"code":"UNAUTHENTICATED","message":"Authentification requise"}}` |
| Erreur interne | `500` `{"error":{"code":"INTERNAL_ERROR","message":"Erreur interne du serveur"}}` |

**Critères couverts :** `CA-V9-019`, `021`, `022`, `062` · scénarios `SC-V9-01`, `SC-V9-11`, `SC-V9-12`.

---

## 4. Webhook — spécification détaillée

### 4.1 Signature et payload signé

En-tête exact :

```
Wave-Signature: t=1667920421,v1=53c971695230e9c51b1030d673eee76e70bbcdf8a7c5b8c1d44e0b8b1329647b
```

- Parser en **exigeant exactement un `t=` numérique** et **au moins un `v1=`** (64 hexadécimaux attendus). Plusieurs `v1` sont acceptés : la signature est valide si **l'une quelconque** correspond (rotation de secret, `R-V9-02`).
- Payload signé = **concaténation directe** de la chaîne du timestamp et du **buffer brut** :

```
payload = Buffer.concat([ Buffer.from(String(t)), rawBody ])
expected = createHmac('sha256', WAVE_WEBHOOK_SECRET).update(payload).digest('hex')
valide  = timingSafeEqual(Buffer.from(expected), Buffer.from(v1))   // pour au moins un v1
```

- **Jamais** `req.body` re-sérialisé : un JSON réordonné ou réespacé change les octets et doit échouer (exemples 1 vs 2 de `docs.wave.com/webhook`). `rawBody` vient de `express.raw({ type: 'application/json', limit: '256kb' })`, monté **avant** `express.json()` (`app.ts:114`) et avant CSRF (`:112`).
- Le timestamp est comparé à l'**horloge serveur** : passé > 300 s ou futur > 30 s → `400 INVALID_SIGNATURE`. `t` est injectable dans `verifyWaveSignature(..., nowSec?)` pour des tests déterministes.
- `rawBody`, en-tête `Wave-Signature` et secret sont **absents de tout log** (CA-V9-038/052). Comparaison en temps constant sur les hexadécimaux.

### 4.2 Exemples de signatures

| Cas | En-tête | Payload signé | Résultat |
|---|---|---|---|
| **Valide** | `t=1763553600,v1=<HMAC_CORRECT>` | `"1763553600"` + octets bruts du corps | `200 {received:true}` |
| **Invalide — secret erroné** | `t=1763553600,v1=<HMAC_ERRONE>` | id. | `400 INVALID_SIGNATURE`, 0 activation |
| **Invalide — corps resérialisé** | `t=1763553600,v1=<HMAC_CORRECT>` | le HMAC a été calculé sur le corps original (avec espaces) ; le serveur reçoit le même corps compacté → octets différents | `400 INVALID_SIGNATURE`, 0 activation |
| **Rejoué** | `t=<maintenant−360>,v1=<HMAC_CALCULE_SUR_CE_T>` | concaténation avec l'ancien `t` | `400 INVALID_SIGNATURE` (hors fenêtre) ; si `t` est valide mais `event.id` déjà traité → `200 {received:true,duplicate:true}` |
| **Rotation multi-`v1`** | `t=1763553600,v1=<HMAC_ERRONE>,v1=<HMAC_CORRECT>` | id. | `200 {received:true}` — une valeur valide suffit |
| **Futur toléré / rejeté** | `t=<maintenant+20>` / `t=<maintenant+40>` | id. | accepté / `400 INVALID_SIGNATURE` |

`<HMAC_*>` sont des placeholders : **aucune valeur de secret réelle** n'apparaît dans ce document. La valeur illustrative de la documentation Wave (`53c97169…`) correspond au secret public d'exemple de leur site et ne doit jamais être utilisée en production.

### 4.3 Formes d'événements et champs utilisés

**`checkout.session.completed`** (forme officielle, montant conforme à un plan Découverte) :

```json
{
  "id": "EV_QvEZuDSQbLdI",
  "type": "checkout.session.completed",
  "data": {
    "id": "cos-1b01sghpg100j",
    "amount": "2000",
    "currency": "XOF",
    "checkout_status": "complete",
    "payment_status": "succeeded",
    "client_reference": "wave-sub-41-3f9a2c17",
    "transaction_id": "TCN4Y4ZC3FM"
  }
}
```

**`checkout.session.payment_failed`** (forme officielle — **ni `amount`, ni `currency`, ni `client_reference`**) :

```json
{
  "id": "EV_8bO0d7TwW6Eq",
  "type": "checkout.session.payment_failed",
  "data": {
    "id": "cos-18qq25rgr100a",
    "payment_status": "failed",
    "checkout_status": "failed",
    "last_payment_error": { "code": "insufficient-funds", "message": "Insufficient balance" }
  }
}
```

| Champ | `completed` | `payment_failed` | Usage contractuel |
|---|---|---|---|
| `id` (event) | requis | requis | Idempotence (`uq_wave_event_id`) et trace |
| `type` | requis | requis | Choix du chemin métier ; tout autre type → `IGNORED` |
| `data.id` (session) | requis | **requis (corrélation primaire)** | Retrouve l'intention `SESSION_CREATED` par `session_id`, même sans `client_reference` (`R-ARCH-01`) |
| `data.amount` | requis, chaîne entière | **absent** | Comparé à `String(plan.price_fcfa)` sur `completed` ; `1000`, `2000.5`, montant d'un autre plan → `IGNORED` (CA-V9-033) |
| `data.currency` | requis, `"XOF"` | **absent** | Contrôle sur `completed` ; `EUR`/`USD`/absent → `IGNORED` (CA-V9-034) |
| `data.client_reference` | présent (sinon repli sur `data.id`) | **absent selon la doc officielle** | Corrélation secondaire ; référence inconnue/d'autrui → `IGNORED` (CA-V9-035) |
| `data.checkout_status` / `data.payment_status` | informatif | informatif | **Jamais déclencheur** : seul le type d'événement + les contrôles métier décident (P3) |
| `data.last_payment_error` | — | informatif | Motif Wave non journalisé, non affiché ; la page échec ne prétend jamais qu'aucun montant n'a été débité |

### 4.4 Contrôles opposables avant activation (sur `completed`)

Tous les contrôles doivent passer ; sinon `IGNORED` + 2xx + **0 activation** (CA-V9-033/034/035/041/046) :

1. rattachement par `client_reference` (intention) **et/ou** `data.id` (session) à une intention existante ;
2. souscription cible `status === 'PENDING'` ;
3. `payment_method === 'wave'` (OM/virement/legacy rejetés) ;
4. `amount === String(plan.price_fcfa)` ;
5. `currency === 'XOF'` ;
6. identifiant admin `WAVE_SYSTEM_ADMIN_ID` (défaut 7) existant et `role='admin'` au premier appel valide (sinon `FAILED` + 503, sans activation).

L'activation passe **uniquement** par `activateSubscription(7, targetId)` (`storefront.service.ts:653`) : `UPDATE … WHERE id=$1 AND status='PENDING'`, `ends_at − started_at = 30 jours`, `activated_by=7`, e-mail unique post-commit, `payment_method`/`payment_reference` préservés. Aucun `FOR UPDATE` externe ne doit traverser cet appel (piège de deadlock documenté §5.2 architecture).

### 4.5 Table de décision

| Condition | Action | Statut trace | Réponse |
|---|---|---|---|
| `WAVE_ENABLED=false` | Court-circuit avant HMAC, aucune écriture | — (aucune ligne) | `200 {received:true,ignored:true,reason:'WAVE_DISABLED'}` |
| `Wave-Signature` absent / malformé / `t` non numérique | Rejet immédiat | — | `400 INVALID_SIGNATURE` |
| HMAC invalide pour **toutes** les `v1` | Rejet immédiat | — | `400 INVALID_SIGNATURE` |
| `t` hors fenêtre (passé > 300 s, futur > 30 s) | Rejet immédiat | — | `400 INVALID_SIGNATURE` |
| Corps brut non-JSON ou enveloppe invalide | Rejet immédiat | — | `400 INVALID_PAYLOAD` |
| `event.id` déjà `COMPLETED`/`PAYMENT_FAILED`/`IGNORED` | Aucune seconde activation | statut existant inchangé | `200 {received:true,duplicate:true}` |
| `event.id` en `PROCESSING`/`FAILED` (concurrent ou retry) | Reprise : revérification puis `activateSubscription` si éligible | `PROCESSING` puis terminal | `200 {received:true}` |
| `type` non reconnu | Accusé sans effet | `IGNORED` | `200 {received:true,ignored:true}` |
| `completed` sans rattachement (référence et session inconnues) | Accusé sans effet | `IGNORED` | `200 {received:true,ignored:true}` |
| `completed` avec `payment_method` ≠ `wave` | Accusé sans effet, validation admin conservée | `IGNORED` | `200 {received:true,ignored:true}` |
| `completed` avec montant erroné (`1000`, décimal, autre plan) | Accusé sans effet | `IGNORED` | `200 {received:true,ignored:true}` |
| `completed` avec devise ≠ `XOF` | Accusé sans effet | `IGNORED` | `200 {received:true,ignored:true}` |
| `completed` sur souscription déjà `ACTIVE`/`EXPIRED`/`CANCELLED` | Contrôle `PENDING` échoue, ou `activateSubscription` répond « déjà gagné » | `IGNORED` ou `COMPLETED` (sans écrasure) | `200 {received:true[,ignored:true]}` |
| `completed` valide | `activateSubscription(7, targetId)` — **appel unique** | `COMPLETED`, `activated=true` | `200 {received:true}` |
| `payment_failed` rattaché (par `data.id` d'abord) | Aucune activation, souscription `PENDING`, dates NULL | `PAYMENT_FAILED` | `200 {received:true}` |
| `payment_failed` non rattaché | Accusé sans effet | `IGNORED` | `200 {received:true,ignored:true}` |
| Erreur technique inattendue pendant l'activation | Ligne conservée, rejouée au retry Wave | `FAILED` | `503 INTERNAL_ERROR` |
| `WAVE_ENABLED=true` mais secret inutilisable | Rejet configuration | — | `503 WAVE_MISCONFIGURED` |

**Durée cible : < 5 s pour chaque réponse 2xx**, y compris doublon, non pertinent et `WAVE_ENABLED=false` (CA-V9-036). Le e-mail part de l'`afterCommit` de `activateSubscription`, hors du budget de latence de l'accusé.

---

## 5. Pages retour (hors API, documentées pour les consommateurs)

| Page | URL exacte | Statut affiché | Écriture | Repli | Query params |
|---|---|---|---|---|---|
| Succès | `GET /paiement-wave/succes` | Eyebrow `Paiement Wave`, h1 `Retour de Wave`, badge **« Wave — en attente de confirmation du paiement »**, message `Votre paiement est en attente de confirmation de la part de Wave. Votre abonnement reste en attente : il sera activé automatiquement dès que le paiement sera confirmé.` | **Aucune** : 0 activation, 0 e-mail, 0 badge, 0 écriture DB ; état réel relu via `GET /api/subscriptions/me` | visible | **Aucun** — ni `id`, ni `reference`, ni `session`, ni `amount` |
| Échec | `GET /paiement-wave/echec` | h1 `Le paiement Wave n'a pas abouti`, notice `Wave n'a pas confirmé ce paiement. Votre abonnement reste en attente et aucune activation n'a été effectuée.` (ne jamais affirmer qu'aucun montant n'a été débité) | **Aucune** : souscription `PENDING`, `started_at`/`activated_by` NULL, 0 e-mail | Formulaire manuel + 3 liens hébergés, contact `revendsen@gmail.com` | **Aucun** |

Ces URLs sont exactement les `success_url` et `error_url` envoyées à Wave (`${SITE_URL}/paiement-wave/succes`, `${SITE_URL}/paiement-wave/echec`, HTTPS qualifié, sans query). Le garde-fou `RequireUser` est appliqué ; aucune page ne lit de paramètre et aucune ne déclenche d'activation (CA-V9-020…024, `D-ARCH-8`).

---

## 6. Matrice de conformité `CA-V9` / `SC-V9`

| Route / champ | Mécanisme contractuel | Critères `CA-V9` | Scénarios `SC-V9` |
|---|---|---|---|
| `WAVE_ENABLED`, gardes, `WAVE_DISABLED` | §1.5, N1 503, N2 200 exception, N3 booléen | 001, 002, 004, 005, 070, 074 | 08 |
| Montage avant CSRF / `express.json()` | §1.2, §4.1 | 006, 031, 036, 038 | 03, 10 |
| `POST /api/wave/checkout/sessions` | §2.1 | 010, 011, 012, 013, 014, 015, 016, 017, 053 | 01, 08, 11 |
| `client_reference` `wave-sub-<id>-<hmac8>` | §1.4, §2.1 effets | 012, 013, 014, 033, 035 | 01, 06 |
| `success_url`/`error_url` sans query | §2.1, §5 | 012, 020, 021, 022, 023, 024 | 01, 11 |
| `GET /api/wave/config` | §2.3 | 001, 002, 004, 005, 070, 074 | 08 |
| `GET /api/wave/admin/events` | §2.4 | 004, 050, 051, 052 | 12 |
| `subscription.wavePaymentPending` | §3 | 019, 021, 022, 062 | 01, 11 |
| Webhook HMAC `t + rawBody`, multi-`v1` | §4.1/§4.2 | 031, 038 | 10 |
| Fenêtre 300 s / 30 s, replay | §4.1, §4.5 | 032 | 03 |
| Idempotence `event.id`, doublon 2xx | §1.3, §4.5 | 030, 036, 041, 043 | 02 |
| Contrôles montant / devise / référence / statut / méthode | §4.4, §4.5 | 033, 034, 035, 041, 046 | 04, 05, 06 |
| Corrélation `payment_failed` par `data.id` | §4.3, §4.5 | 037 | 07 |
| Accusé < 5 s, 2xx non pertinent | §1.6, §4.5 | 036 | 02, 07 |
| Activation unique via `activateSubscription(7, …)` | §4.4, N2 effets | 040, 042, 043, 044, 045, 047 | 01, 02 |
| Aucune activation par `success_url` / GET diagnostic | §1.1, §5 | 018, 021, 037, 053 | 11 |
| Traçabilité `wave_checkout_events` | N2/N4, §4.5 | 030, 046, 050, 051 | 02, 12 |
| Non-régression routes existantes | §7 | 060, 061, 062, 063, 064, 065 | 12 |
| Documentation / secret / tests | en-tête, §1.4, §7 | 052, 070, 071, 072, 073, 074, 075 | 12 |

**Points NON couverts par le contrat (à couvrir par `@tester`, explicitement transférés) :** la preuve d'exécution des 55 critères reste externe à ce document. En particulier `CA-V9-002`/`003` (DOM du bouton et clic sur les 3 liens), `004` (SQL `users` id 7 / email / `COUNT`), `005`/`052`/`070` (greps secrets, logs, bundle), `017` (grep montants front), `020`/`024` (navigation navigateur, absence de webview), `038` (absence de `rawBody`/signature dans les logs), `042`/`044` (unicité et parité d'implémentation), `045` (DB `payment_method`/`payment_reference` inchangés), `047` (concurrence 2–3 webhooks simultanés), `050`/`075` (migration `023` rejouée et procédure), `054` (`git diff` sur `rejectSubscription`), `060`…`065` (flux manuels et verrous V8), `071` (fusion `api.md` v2.9 par `@backend`), `072`/`073` (suites mockées, 63/63, 273/273, audits) et `074`/`075` (bascule/procédure **hors V9**). La grille des 12 scénarios et les commandes de preuve sont définies au §5 du cahier.

---

## 7. Non-régression

### 7.1 Routes existantes dont le contrat est inchangé

- `POST /api/subscriptions` (E1 v2.8 incluse — `paymentMethod`/`paymentReference`, `201`) — `subscriptions.routes.ts:18-22` : **0 ligne modifiée**.
- `GET /api/subscriptions/me` — **seul le champ optionnel `wavePaymentPending` est ajouté** (§3), avec le précédent E4 (`profile`).
- `GET /api/subscriptions/me/stats`, `GET /api/subscriptions/me/report?period=YYYY-MM`.
- `GET /api/admin/subscriptions` — **aucun champ ajouté** : la file Wave passe exclusivement par N4 (`D-ARCH-9`).
- `POST /api/admin/subscriptions/:id/activate`, `POST /api/admin/subscriptions/:id/reject` (refus V8.2 intact).
- Tout `/api/storefront/*` (listings, profil R1/R1b/R1c, boutique publique, contact), tout `/api/cron/*`, tout `/api/auth/*`, `/api/products/*`, `/api/orders/*`, `/api/me/*`, `/api/referrals/me`, `/api/admin/*` hors N4.
- Conventions inchangées : cookie HTTP-only `SameSite=Lax`, CSRF double soumission, `403` vs `404` (§1.4 de `api.md`), enveloppe paginée, `Cache-Control: private, no-store`, format d'erreur, mapping `23505` dans le service (`middleware/errors.ts` non modifié).

### 7.2 Routes V9 qui n'existent pas (hors-périmètre non négociable)

| Route absente | Raison |
|---|---|
| `POST /api/wave/refund`, toute API de remboursement/annulation Wave | Non demandé (cahier §2.2) |
| Toute webview / route d'ouverture in-app / mobile native | `wave_launch_url` doit être ouverte par le navigateur ; cible Web + API uniquement |
| Route d'automatisation Orange Money ou virement | Restent manuels (décision utilisateur) |
| Route d'activation par `GET` (`GET /v1/checkout/sessions/:id`, `search?client_reference=…`) | Diagnostics uniquement, **jamais activateurs** (règle d'or §1.1) |
| Route d'activation publique, `POST /api/admin/subscriptions/:id/activate-wave` ou second `UPDATE … SET status='ACTIVE'` | Un seul chemin d'activation : `activateSubscription` |
| Bascule de configuration en API (écriture de `WAVE_*`, enregistrement du webhook) | Variables d'environnement + portail Wave, **hors V9** |
| Exposition publique de `eventId`, `sessionId`, `client_reference`, signature ou secret | Traçabilité admin `requireAdmin` uniquement |

---

## 8. Définition de Done — livrable documentaire

> Portée : **ce fichier uniquement**. Les 55 `CA-V9-xxx` et 12 `SC-V9-xx` décrivent le livrable **code** futur et restent à prouver par `@tester` ; ils ne sont pas validés ici (aucun code Wave écrit, aucun secret posé, aucune production touchée).

| # | Exigence de la mission | O/N | Preuve |
|---|---|---|---|
| 1 | Un seul fichier créé (`docs/api-v9-wave-checkout.md`) ; aucun code, aucun commit, aucun autre document modifié (notamment `docs/api.md` intact) | ✅ O | `git status --short` en fin de tâche (§8.1) : seuls les états **préexistants** du chef de projet + ce nouveau fichier |
| 2 | En-tête : v2.9 additif proposé, 19/11/2026, `@api-designer`, statut « proposé — à valider », références cahier/architecture/design/api.md v2.8, sources Wave avec URL | ✅ O | Tableau d'en-tête |
| 3 | §1 Règles transverses : auth/CSRF par route, identifiants, idempotence `event.id`, horizons, convention d'erreurs `code \| HTTP \| quand \| corps`, règle d'or | ✅ O | §1.1 → §1.7 |
| 4 | §2 : 4 routes documentées avec méthode+path, auth, en-têtes, schémas request/response, tableau d'erreurs, curl sans secret, effets de bord, CA couverts | ✅ O | §2.1 → §2.4 |
| 5 | Simulation **succès / chaque 4xx / 500** pour chaque endpoint | ✅ O | Tableaux « Simulation des réponses » de §2.1 (9 lignes), §2.2 (12), §2.3 (4), §2.4 (6), §3 (5) |
| 6 | §3 Extension additive de `/me` : avant/après, compatibilité V8.5, explication du champ, CA | ✅ O | §3 |
| 7 | §4 Webhook détaillé : forme `Wave-Signature`, `t + rawBody`, exemples valide/invalide/rejoué/multi-`v1`, formes d'événements, table de décision, < 5 s | ✅ O | §4.1 → §4.5 |
| 8 | §5 Pages retour (statut, 0 écriture, repli, 0 query) | ✅ O | §5 |
| 9 | §6 Matrice de conformité avec **points non couverts signalés** | ✅ O | §6 + paragraphe « Points NON couverts… » |
| 10 | §7 Non-régression : routes inchangées + routes V9 inexistantes | ✅ O | §7.1, §7.2 |
| 11 | Cohérence architecture/cahier/design/api.md v2.8 : 0 contradiction, faits Wave sourcés, chiffres 2 000 / 5 000 / 10 000, pas d'usage de « ranga », contact `revendsen@gmail.com` | ✅ O | §1.4, §2.1, §4.3, §7 ; montant 1000 uniquement cité comme **valeur rejetée** (CA-V9-033) |
| 12 | Aucun secret réel : placeholders `<WAVE_API_KEY>` / `<WAVE_WEBHOOK_SECRET>` / `<CSRF_TOKEN>` ; ni clé, ni signature, ni `rawBody` dans le document | ✅ O | §1.7 point 5, §2.1/§2.2 curl, §4.2 |
| 13 | Auto-revue effectuée (unicité des identifiants N1–N4, cohérence des codes/HTTP, exemples relus) | ✅ O | §8.2 |
| 14 | Skills obligatoires appliqués et prouvés | ✅ O | `plan-le-first` (plan en 5 étapes avant écriture) · `docs-officielles` (2 URL relues, HTTP 200, §en-tête) · `gestion-risques` (§1.7, §6 points non couverts, §7.2) · `auto-revue` (§8.2) · `definition-done` (ce tableau) |

### 8.1 Mesures finales

- Fichier livré : `docs/api-v9-wave-checkout.md`.
- Longueur mesurée : **735 lignes** (`wc -l docs/api-v9-wave-checkout.md`).
- Routes API documentées : **4** ; extension additive : **1** ; pages SPA : **2**.
- Codes d'erreur documentés : **14** (9 réutilisés/spécialisés + 5 nouveaux Wave, dont `INVALID_SIGNATURE`, `INVALID_PAYLOAD`, `WAVE_DISABLED`).
- Aucun code applicatif, aucune migration, aucun secret, aucun commit.

### 8.2 Preuves d'exécution (commandes réellement lancées)

```
git branch --show-current                          → fix/v6-on-799a7ab
wc -l docs/api-v9-wave-checkout.md                 → 735
wc -l docs/api.md                                  → 2546  (non modifié)
webfetch https://docs.wave.com/checkout            → 200, paramètres confirmés
webfetch https://docs.wave.com/webhook             → 200, t+rawBody / multi-v1 / payment_failed sans référence confirmés
git status --short                                 → 5 entrées (4 préexistantes + 1 nouvelle)
```

Sortie exacte de `git status --short` (au 19/11/2026) :

```
 M docs/journal.md
?? docs/api-v9-wave-checkout.md
?? docs/architecture-v9-wave-checkout.md
?? docs/cahier-des-charges-v9-wave-checkout.md
?? docs/design-v9-wave-checkout.md
```

### 8.3 Auto-revue (une ligne)

> Auto-revue effectuée : relecture intégrale du document et des quatre sources amont ; cohérence vérifiée entre les codes §1.5 et les tableaux d'erreurs de chaque endpoint, entre `per_page` (query) et `perPage` (réponse), entre l'exception webhook `WAVE_DISABLED`=200 et le `503` des appels serveur, et entre la liste des champs N4 et l'interdiction d'affichage du design. Aucun identifiant dupliqué (`N1`–`N4`, `T1`–`T12`), aucune contradiction avec `V9-D1…D6` ni avec les décisions `D-ARCH-1…10`.

---

**VERDICT : DONE** — le contrat d'API V9 est complet, additif, sourcé et consommable sans ambiguïté par `@backend`, `@frontend` et `@mobile`. **Passage à `@backend` pour fusion en `docs/api.md` v2.9 ACCORDÉ sous réserve de validation du chef de projet** (statut « proposé »). La production reste en `WAVE_ENABLED=false` ; aucune bascule n'est incluse dans V9. Les 55 critères `CA-V9-xxx` restent à prouver par `@tester` sur le livrable code.
