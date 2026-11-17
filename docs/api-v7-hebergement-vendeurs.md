# CONTRAT D'API REST — ReVends (V7 — Hébergement des vendeurs)

| | |
|---|---|
| **Version** | **2.7 — V7 Hébergement vendeurs (2026-11-17)** — 8 nouvelles routes : souscription, espace abonné, boutique publique, annonces de boutique, contact interne boutique, gouvernance admin des abonnements. **Aucune route existante n'est modifiée.** Les encarts v2.4 (V5), v2.5 (V6) et v2.6 (V6 — Parrainage) restent applicables et ne sont pas répétés ici. |
| **Auteur** | Agent `@api-designer`, pour l'équipe projet ReVends |
| **Statut** | Contrat **additif** — `docs/api.md` v2.6 reste inchangé ; sa mise à jour en **v2.7** par `@backend` est un livrable de la fusion (CA-V7-063), avec la checklist §13 du présent document. |
| **Nature** | **Document additif.** Aucun route, schéma, code d'erreur ou comportement existant n'est modifié, renommé, déplacé ou retiré. Zéro écriture dans le pipeline de commande/paiement. |
| **Sources** | `docs/cahier-des-charges-v7-hebergement-vendeurs.md` (45 critères, validé le 17/11/2026) · `docs/architecture-v7-hebergement-vendeurs.md` v1.1 (3 tables, machine à états, routes, arbitrages du chef de projet §2.2/§3.3/§4.2/§8) · `docs/api.md` **v2.6** (§1.1, §1.2, §1.4, §1.5, §1.6, §2.2–2.6, §3.2 quater, §5, §6, §8) · migrations `001→018` (V7 = `019_storefront.sql`) |

---

> ## ⚠️ AVERTISSEMENT — ADDITIF ONLY (non négociable)
>
> **Ce contrat n'ajoute que du neuf. Rien d'existant n'est amendé.**
>
> 1. **Zéro route existante modifiée** — méthode, chemin, corps, statuts rendus, schémas de réponse et codes d'erreur de toutes les routes documentées en `docs/api.md` v2.6 restent **strictement identiques**. Aucune route n'est renommée, déplacée, supprimée ni versionnée.
> 2. **Zéro schéma existant modifié** — aucune colonne ajoutée aux tables existantes ; les 3 nouvelles tables (`subscription_plans`, `seller_subscriptions`, `storefront_listings`) et le nouvel enum `subscription_status` sont les seuls objets nouveaux côté données. `notification_type` **n'est pas modifié** (valeur existante `product.contact` réutilisée — décision chef de projet, R-V7-A3 clos).
> 3. **Zéro code d'erreur existant modifié** — les codes v2.6 gardent leur sens et leur HTTP. `SLUG_TAKEN` et `CONTACT_SELF` sont **réutilisés** (sémantique identique) ; les codes strictement nouveaux sont listés en §11.
> 4. **Zéro écriture dans le pipeline de commande/paiement** — `storefront_listings` n'est écrit que par `POST /api/storefront/listings` et `DELETE /api/storefront/listings/:id` (+ réattach admin, §7.8). Aucun handler de `POST /api/products`, `/api/orders`, checkout, paiement, payout, catalogue, fiche produit, commandes ou notifications existantes n'est modifié. Aucun trigger sur `products`. Zéro occurrence attendue de `storefront_listings|subscription_id|STOREFRONT_QUOTA|withdrawn_at` dans les handlers de commande/paiement/checkout (CA-V7-037/038).
> 5. **Commission 10 % inchangée** — la commission vendeur reste `COMMISSION_RATE` (source de vérité, CA-V5-150). **Aucun tarif d'abonnement, aucun frais, aucun prélèvement n'entre dans le calcul de commande** (§9). La souscription n'est pas un paiement : V7 n'expose aucune route de paiement, aucun webhook, aucun champ bancaire (CA-V7-014).
> 6. **Zéro écriture dans le parrainage** — `referred_by`, `ambassador_until`, `vitrine_until`, `referral_qualifications` ne sont ni lus ni écrits par V7 (CA-V7-054).
> 7. **`docs/api.md` v2.6 n'est PAS modifié par ce document.** La fusion — ajout des sections v2.7 dans `docs/api.md` (ou son successeur) — est le livrable de `@backend` (CA-V7-063), cadrée par la checklist §13.
>
> Tout écart à ces 7 points rend la V7 **non conforme** et impose le feature flag `FEATURE_STOREFRONT=false` (rollback sans toucher à l'existant).

---

## 1. Objet et périmètre

V7 ajoute un **service d'hébergement des vendeurs** : un vendeur choisit un forfait (Découverte 2 000 FCFA/mois, 10 annonces de boutique · Boutique 5 000, 30 · Atelier 10 000, 100 — validés par l'utilisateur le 17/11/2026, PO-V7-01/02), l'admin l'active manuellement, et le vendeur dispose d'une **boutique publique** `/boutique/:slug` et d'un **espace abonné privé** `/mon-abonnement`.

Le quota porte **uniquement sur les annonces actives affichées dans la boutique dédiée** — jamais sur le catalogue principal. Le contrôle n'intervient **qu'à l'ajout** via `POST /api/storefront/listings` (§7.3). Un article refusé par la boutique reste **normalement visible et vendable** dans le catalogue (CA-V7-033).

| Dans le périmètre V7 (API) | Hors périmètre (explicite) |
|---|---|
| 8 routes listées §4 (souscription, consultation, listings boutique, boutique publique, contact boutique, file admin, activation admin) | `POST /api/products`, `/vendre`, `/mes-articles`, catalogue, fiche produit, recherche, catégories : **inchangés** |
| 3 nouvelles tables + 1 enum (`subscription_status`) | `users`, `products`, `orders`, `notifications`, `referral_qualifications` : **0 colonne ajoutée** |
| Notification de contact boutique (type existant `product.contact` réutilisé) | Aucune notification existante supprimée/déplacée/modifiée |
| Activation manuelle `PENDING → ACTIVE` par un `admin` | Paiement en ligne d'abonnement, webhook, cron, récurrent : **interdits** (CA-V7-014) |
| Feature flag `FEATURE_STOREFRONT` (déploiement) | Application mobile native : hors périmètre (cohérent V1→V6) ; ces endpoints REST restent consommables par une future app (cookie HTTP-only same-origin) |
| — | CRUD admin des forfaits : les paliers sont seedés en base, **aucun endpoint de création/édition de forfait en V7** (CA-V7-053) |

---

## 2. Conventions héritées de `docs/api.md` v2.6 (rappel minimal, applicable tel quel)

- **Base URL** : chemins **relatifs à l'origine** (`/api/...`), same-origin Vercel ; Vite proxy `/api` vers `http://localhost:4000` en dev.
- **Format** : JSON `application/json` partout (V7 n'ajoute **aucun** multipart).
- **Auth** : session serveur identifiée par **cookie HTTP-only** (`SameSite=Lax`, 7 jours, `Secure` en prod). Aucun token dans un header ou un body ; le client laisse le navigateur joindre les cookies (`credentials: 'include'`).
- **CSRF** : double soumission existante, **automatique** sur toute méthode mutante (POST/DELETE) sous `/api` — le client envoie le token `X-CSRF-Token` comme pour l'existant. V7 ne contourne pas ce mécanisme.
- **Casse** : `camelCase` dans les JSON ; statuts et enums en `UPPER_SNAKE_CASE`.
- **Montants** : entiers **FCFA**, jamais de `float`. `priceFcfa`, `price` sont des entiers.
- **Dates** : ISO 8601 UTC (`2026-11-17T10:15:00.000Z`).
- **Identifiants** : `id` numériques (BIGINT → nombre JSON). Les **slugs** identifient les ressources publiques en lecture ; les `id` identifient les mutations.
- **Format d'erreur uniforme** (tous les 4xx et 5xx) :

```json
{ "error": { "code": "NOT_FOUND", "message": "Boutique introuvable" } }
```

- `VALIDATION_ERROR` ajoute `details` (§1.1 v2.6) :

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Données invalides",
    "details": [
      { "field": "message", "message": "Le message doit contenir entre 10 et 2000 caractères" }
    ]
  }
}
```

- Erreur 500 générique (aucune fuite d'information — jamais de SQL, contrainte, stack, hôte ou port) :

```json
{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }
```

- **`error.message` est rédigé en français, affichable tel quel dans un Toast** (le front n'a pas de table `code → message`). Les détails techniques vont dans les logs serveur.
- **Pagination** (§1.5 v2.6) : `page` (≥ 1, défaut `1`), `per_page` (1..48, défaut `12`) ; enveloppe `{ items, page, perPage, total, totalPages }` ; filtre sans résultat → `200` + `items: []` ; `per_page`/`page` hors bornes → `400 VALIDATION_ERROR`.
- **RG 7.7** (§1.6 v2.6) : V7 n'expose côté public que `displayName` + `memberSince` (année). **Jamais** `name`, `email`, `phone`, `whatsapp` dans la boutique publique (§8.3, §6).
- **Rate limiting** (§8 v2.6) : global `300 req / IP / 1 min` ; admin `/api/admin/*` déjà limité à `60 req / min` (`skipAdmin`) ; **nouveau scope `storefront-contact` : `10 req / IP / 10 min`** sur la route de contact uniquement (§10.4, clé Redis `rl:storefront-contact:<ip>`). Dépassement → `429 RATE_LIMITED` + header `Retry-After` (secondes). En `NODE_ENV=test`, le limiteur est bypassé. Une instance ≥ 2 exige un compteur partagé (dette déjà tracée PO-V5-17).
- **`Cache-Control`** : V7 n'ajoute **aucune** route au cache public de v2.6 (réservé à `/api/categories` et `/api/banners`). **Toute réponse V7 est `private, no-store`** — y compris la boutique publique `GET /api/storefront/:slug` (décision explicite §10.3, §8.3).
- **Lecture publique non divulgatrice** : les réponses `404` de boutique sont **strictement identiques** quel que soit le motif (§5).

---

## 3. Codes de statut HTTP utilisés par V7

| Statut | Sens | Routes |
|---|---|---|
| `200` | Succès (lecture, action sans création) | (2) `GET /api/subscriptions/me` · (4) `DELETE …/listings/:id` · (5) `GET /api/storefront/:slug` · (7) `GET /api/admin/subscriptions` · (8) `POST …/activate` |
| `201` | Ressource créée | (1) `POST /api/subscriptions` · (3) `POST /api/storefront/listings` · (6) `POST /api/storefront/:slug/contact` |
| `400` | Entrée invalide | (1) slug/`planId`/`supersedesId` · (3) `productId` · (5) pagination · (6) `message`/`email` · (7) `status`/pagination · (8) `:id` |
| `401` | Non authentifié | (1)(2)(3)(4)(6)(7)(8) |
| `403` | Authentifié, rôle/droit insuffisant | (3) `SUBSCRIPTION_REQUIRED` / `NOT_PRODUCT_OWNER` · (7)(8) `FORBIDDEN` (non-admin) |
| `404` | Ressource inexistante **ou masquée** | (1) `PLAN_NOT_FOUND`, `NOT_FOUND` (supersedesId d'autrui/inexistant) · (3) `PRODUCT_NOT_FOUND` · (4) `NOT_FOUND` · (5) `NOT_FOUND` (unique, §5.1) · (6) `NOT_FOUND` · (8) `NOT_FOUND` |
| `409` | Conflit d'état métier | (1) `SLUG_TAKEN` · (3) `STOREFRONT_QUOTA_EXCEEDED`, `STOREFRONT_ALREADY_LISTED` · (8) `INVALID_STATUS`, `SUBSCRIPTION_ALREADY_ACTIVE` |
| `429` | Trop de requêtes | (6) `RATE_LIMITED` (scope `storefront-contact`) |
| `500` | Erreur interne | toutes (§11, payload unique) |

Aucun `204`, `410` ni `currentStatus` n'est introduit par V7 (le `currentStatus` reste réservé aux transitions de commandes V3).

---

## 4. Carte des 8 nouvelles routes

> Convention d'ordre de déclaration (architecture §4.1) : dans `storefront.routes.ts`, `POST /listings` et `DELETE /listings/:id` sont déclarées **AVANT** `GET /:slug` et `POST /:slug/contact` — le chemin littéral prime, même réflexe que `products.routes.ts` (`/locations`, `/suggestions` avant `/:identifier`). Les verbes diffèrent déjà, l'ordre explicite évite toute capture future. Les routeurs V7 sont montés additivement dans `app.ts` **uniquement si `FEATURE_STOREFRONT=true`** (sinon `404 NOT_FOUND` via le `notFoundHandler` existant — aucun comportement existant touché).

| # | Méthode & chemin | Accès | Corps / Query | Succès | Description |
|---|---|---|---|---|---|
| 1 | `POST /api/subscriptions` | **user authentifié** (`requireAuth` — un admin a un profil et peut souscrire, décision architecture §4.2(1)) | JSON `{ planId, slug, supersedesId? }` | `201` | Souscription / changement de forfait → abonnement `PENDING` — `supersedesId` : d'autrui / inexistant / d'autrui non supersédable → `404 NOT_FOUND` ; propre non-`ACTIVE` → `400 INVALID_SUPERSEDES` ; propre `ACTIVE` → changement valide (ancien `CANCELLED` à l'activation) — **arbitrage définitif 17/11/2026** |
| 2 | `GET /api/subscriptions/me` | **user authentifié** (`requireAuth`) | — | `200` | État de mon abonnement, forfait, quota consommé, mes listings, les 3 paliers |
| 3 | `POST /api/storefront/listings` | **user authentifié + abonnement `ACTIVE`** (`requireAuth` + résolution d'abonnement) | JSON `{ productId }` | `201` | Ajout d'une annonce à la boutique — **seul point de contrôle du quota** |
| 4 | `DELETE /api/storefront/listings/:id` | **user authentifié, propriétaire du listing** | — | `200` | Retrait boutique-scopé (`withdrawn_at = now()`), idempotent |
| 5 | `GET /api/storefront/:slug` | **public** (aucune session) | query `page`, `per_page` | `200` / `404` | Boutique publique — annonces actives uniquement, `Cache-Control: private, no-store` |
| 6 | `POST /api/storefront/:slug/contact` | **user authentifié** (`requireAuth`) | JSON `{ message, email? }` | `201` | Formulaire interne boutique-scopé → notification interne `product.contact` |
| 7 | `GET /api/admin/subscriptions` | **admin** (`requireAdmin`) | query `status` (défaut `PENDING`), `page`, `per_page` | `200` | File des demandes + historique (paginé) |
| 8 | `POST /api/admin/subscriptions/:id/activate` | **admin** (`requireAdmin`) | JSON `{}` | `200` | Activation manuelle `PENDING → ACTIVE` (transaction, traçabilité) |

**Aucun autre endpoint n'est ajouté.** `POST /api/products/:id/contact` (documenté v2.6 §3.2 quater) **n'est ni modifié ni réactivé** par V7 — le contact V7 est une route dédiée, strictement boutique-scopée (risque R-V7-A4 / CA-V7-047).

### 4.1 Authentification et autorisation — synthèse

| Route | `public` | `requireAuth` (user **ou** admin) | `requireAdmin` | Sécurité d'ownership |
|---|---|---|---|---|
| 1 `POST /api/subscriptions` | — | ✅ | — | Abonnement créé pour `session.userId` ; `supersedesId` vérifié : d'autrui/inexistant/d'autrui non supersédable → `404 NOT_FOUND` ; propre non-`ACTIVE` → `400 INVALID_SUPERSEDES` |
| 2 `GET /api/subscriptions/me` | — | ✅ | — | Lecture strictement limitée à `session.userId` |
| 3 `POST /api/storefront/listings` | — | ✅ + `ACTIVE` | — | `products.owner_id = session.userId` sinon `403 NOT_PRODUCT_OWNER` |
| 4 `DELETE /api/storefront/listings/:id` | — | ✅ | — | Listing rattaché à un abonnement **du connecté**, sinon `404` |
| 5 `GET /api/storefront/:slug` | ✅ | — | — | Aucune donnée personnelle exposée (§8.3) |
| 6 `POST /api/storefront/:slug/contact` | — | ✅ | — | Notification insérée chez le **vendeur propriétaire de la boutique** ; auto-contact refusé |
| 7 `GET /api/admin/subscriptions` | — | — | ✅ (`user` → `403 FORBIDDEN`) | Lecture seule de gouvernance |
| 8 `POST /api/admin/subscriptions/:id/activate` | — | — | ✅ (`user` → `403 FORBIDDEN`) | `activated_by = session.userId` ; un `user` ne peut jamais activer |

Aucun nouveau rôle, aucune écriture de `users.role`, aucune élévation de privilège (CA-V7-002/052). Le RBAC existant (`requireAuth`/`requireAdmin`) est réutilisé tel quel.

---

## 5. Règles de non-divulgation (§1.4 v2.6 étendu à V7)

### 5.1 La règle : **404 unique pour la boutique**

`GET /api/storefront/:slug` et `POST /api/storefront/:slug/contact` appliquent **une seule requête, un seul `notFound`** (architecture §3.6) :

```sql
SELECT s.id, s.slug, u.display_name
  FROM seller_subscriptions s
  JOIN users u ON u.id = s.seller_id
 WHERE s.slug = $1
   AND s.status = 'ACTIVE'
   AND s.ends_at > now();
```

**Aucune ligne → `404 NOT_FOUND` — payload strictement identique dans tous les cas :**

| Cas réel | Réponse | Indice laissé |
|---|---|---|
| Slug inconnu de toute base | `404 { "error": { "code": "NOT_FOUND", "message": "Boutique introuvable" } }` | aucun |
| Abonnement `PENDING` (jamais activé) | idem, **même corps, même statut** | aucun |
| Abonnement `EXPIRED` (30 j écoulés) | idem | aucun |
| Abonnement `CANCELLED` | idem | aucun |
| Vendeur non abonné | idem | aucun |

**Aucun message différencié, aucun `currentStatus`, aucun `hint`, aucune requête séparée « le slug existe-t-il ? ».** Le client ne peut pas distinguer « cette boutique n'existe pas » de « cette boutique existe mais n'est pas ouverte ». La route de contact réutilise **exactement le même garde-fou** (§7.6) — un visiteur ne peut pas sonder l'existence d'une demande d'abonnement en cours.

Conséquences :

- La matérialisation paresseuse de l'expiration (`ACTIVE → EXPIRED` à `ends_at ≤ now()`, sans cron) n'est **jamais une condition de la réponse** : une ligne expirée non encore matérialisée répond déjà `404` via le filtre `ends_at > now()`.
- La boutique d'un vendeur `PENDING` répond `404` **avant** comme **après** un quelconque cache/CDN : le `Cache-Control` de la route est `private, no-store` (§10.3).
- Le message `404` est identique pour un slug absent et pour un slug réservé par un autre vendeur — la souscription est le seul endroit où `SLUG_TAKEN` est observable (et uniquement par un vendeur authentifié).

### 5.2 Exception assumée — `403 NOT_PRODUCT_OWNER` (produit d'autrui)

Sur `POST /api/storefront/listings` (route 3), un produit appartenant à **un autre vendeur** renvoie :

```json
{ "error": { "code": "NOT_PRODUCT_OWNER", "message": "Ce produit ne vous appartient pas" } }
```

**C'est un écart assumé et documenté au §1.4 de `docs/api.md` v2.6**, qui imposerait `404 NOT_FOUND` pour une « ressource d'autrui ». Arbitrage définitif du chef de projet (17/11/2026, architecture §4.2(3), §4.3, §6 — R-V7-A2 clos ; cahier CA-V7-030 prévaut) :

> Le demandeur est **authentifié** et le produit lui est déjà **connu via le catalogue public** (titre, prix, vendeur affichés publiquement). Refuser en `404` n'apporterait aucune protection réelle au vendeur du produit et casserait le cas d'usage légitime « gérer mes annonces » (le client distingue « pas mon produit » d'une erreur réseau).

**Portée strictement limitée** : cette exception ne vaut que pour `POST /api/storefront/listings`. Partout ailleurs, la règle v2.6 s'applique intégralement :

- Listing d'autrui sur `DELETE /api/storefront/listings/:id` → `404 NOT_FOUND` (pas de `403`).
- Abonnement d'autrui (ou inexistant, ou d'autrui non supersédable) sur `POST /api/subscriptions` (`supersedesId`) → `404 NOT_FOUND` (arbitrage définitif 17/11/2026 ; son propre abonnement non-`ACTIVE` → `400 INVALID_SUPERSEDES`).
- Abonnement d'autrui sur `POST /api/admin/subscriptions/:id/activate` → réservé admin, `404 NOT_FOUND` si id inconnu.
- Boutique → **jamais** de `403` pour un non-propriétaire : le public anonyme reçoit le même `404` (§5.1).
- Notification / données d'un autre vendeur : jamais exposées (§1.6 v2.6).

### 5.3 Ressources privées V7 — récapitulatif

| Ressource | Inconnu | D'autrui | Statut `PENDING` | `EXPIRED` |
|---|---|---|---|---|
| Boutique `/api/storefront/:slug` (public) | `404 NOT_FOUND` | n/a | `404 NOT_FOUND` | `404 NOT_FOUND` |
| Contact `/api/storefront/:slug/contact` | `404 NOT_FOUND` | n/a | `404 NOT_FOUND` | `404 NOT_FOUND` |
| Listing boutique (`DELETE …/listings/:id`) | `404 NOT_FOUND` | `404 NOT_FOUND` | n/a | n/a |
| Abonnement (`supersedesId`) | `404 NOT_FOUND` | `404 NOT_FOUND` | n/a | n/a |
| Son propre abonnement non `ACTIVE` (`supersedesId`) | — | — | `400 INVALID_SUPERSEDES` | `400 INVALID_SUPERSEDES` |
| Produit d'un autre vendeur (`POST …/listings`) | `404 PRODUCT_NOT_FOUND` | **`403 NOT_PRODUCT_OWNER`** (exception assumée, §5.2) | n/a | n/a |
| Abonnement `PENDING` activé par un `user` | — | — | `403 FORBIDDEN` (route admin) | n/a |

### 5.4 Slugs réservés et unicité — rappel

- **Unicité à vie** (cross-sellers, tous statuts confondus, y compris `EXPIRED`/`CANCELLED`) vérifiée dans la fonction d'écriture unique : slug déjà pris par un **autre** vendeur → `409 SLUG_TAKEN` (CA-V7-020). Un même vendeur peut réutiliser **son** slug (changement de forfait / ré-abonnement, CA-V7-015).
- Filet DB : index partiel `uq_active_subscription_slug` (une seule boutique `ACTIVE` par slug) — violation `23505` → `409 SLUG_TAKEN` (mapping erreurs §11.3).
- **20 mots réservés** → `400 SLUG_RESERVED` (CA-V7-021) : `admin`, `api`, `boutique`, `catalogue`, `vendre`, `mes-articles`, `mon-abonnement`, `parrainage`, `panier`, `profil`, `login`, `register`, `search`, `static`, `assets`, `health`, `www`, `help`, `contact`, `legal`.
- **Format** : `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3 à 40 caractères. Normalisation **serveur** (autorité) : `NFD` → suppression diacritiques → minuscules → espaces/non-alphanumériques → `-` → trim des `-`. `Mode Dakar` ≡ `mode-dakar` (CA-V7-020/022).

---

## 6. Modèles de ressources V7 (schémas JSON réutilisés)

> Les montants sont des entiers FCFA. Les dates sont ISO 8601 UTC. Les `id` sont des nombres JSON. Ces modèles s'ajoutent à ceux de v2.6 §2 sans les modifier.

### 6.1 `SubscriptionPlan` (palier — lecture seule, issu de `subscription_plans`)

| Champ | Type | Contraintes |
|---|---|---|
| `id` | int ≥ 1 | PK, 1 = Découverte · 2 = Boutique · 3 = Atelier (IDs stables, seed migration `019`) |
| `name` | string (≤ 40) | `'Découverte'` \| `'Boutique'` \| `'Atelier'` |
| `priceFcfa` | int > 0 | Entier FCFA/mois. **Jamais codé en dur dans le front** — toujours servi par l'API (CA-V7-010) |
| `quota` | int > 0 | Annonces de **boutique** simultanées : 10 \| 30 \| 100 |
| `durationDays` | int = 30 | Figé en base (`CHECK (duration_days = 30)`, 30 j glissants, PO-V7-03) |

```json
{ "id": 1, "name": "Découverte", "priceFcfa": 2000, "quota": 10, "durationDays": 30 }
```

### 6.2 `Subscription` (vue propriétaire — `GET /api/subscriptions/me`, réponses de souscription et d'activation)

| Champ | Type | Présence | Sens |
|---|---|---|---|
| `id` | int ≥ 1 | toujours | PK `seller_subscriptions.id` |
| `status` | `'PENDING' \| 'ACTIVE' \| 'EXPIRED' \| 'CANCELLED'` | toujours | Enum `subscription_status` (nouveau, 4 valeurs) |
| `plan` | `SubscriptionPlan` | toujours | Palier souscrit (jointure) |
| `slug` | string (3–40) | toujours | Slug normalisé de la boutique |
| `supersedesId` | int \| null | toujours | Abonnement remplacé (changement de forfait, CA-V7-015) |
| `startedAt` | ISO 8601 \| null | `ACTIVE`/`EXPIRED`/`CANCELLED` | = `activated_at` |
| `endsAt` | ISO 8601 \| null | `ACTIVE`/`EXPIRED`/`CANCELLED` | `activated_at + 30 jours` |
| `daysRemaining` | int ≥ 0 | `ACTIVE` uniquement | `ceil((endsAt - now()) / 86400s)` ; `0` si expiré/absent |
| `activatedBy` | int \| null | après activation | `users.id` de l'admin ayant activé (**traçabilité**, CA-V7-013/051) |
| `activatedAt` | ISO 8601 \| null | après activation | Horodatage serveur de l'activation |
| `createdAt` | ISO 8601 | toujours | Création de la demande |
| `message` | string \| absent | `EXPIRED` | Message clair d'expiration affichable (CA-V7-016) — absent sinon |

Enum `subscription_status` — machine à états (architecture §3) : `PENDING → ACTIVE` (admin uniquement) · `ACTIVE → EXPIRED` (expiration paresseuse en lecture, **sans cron**) · `ACTIVE → CANCELLED` (admin, automatiquement lors de l'activation d'un changement de forfait) · `EXPIRED|CANCELLED → PENDING` (nouvelle souscription). **Aucune transition** `PENDING → ACTIVE` par un `user` ; aucun `status` n'est jamais lu depuis un payload client (§7).

### 6.3 `SubscriptionUsage` et `ListingView` (espace abonné)

```json
{
  "usage":  { "used": 3, "quota": 10, "remaining": 7 },
  "listings": [
    { "id": 12, "productId": 88, "title": "Veste en jean — taille M", "price": 12000,
      "effectiveStatus": "AVAILABLE", "createdAt": "2026-11-17T10:15:00.000Z" }
  ]
}
```

| Champ (`usage`) | Type | Sens |
|---|---|---|
| `used` | int ≥ 0 | Annonces de boutique actives, **dérivé en lecture** de `products.status` par jointure (`PENDING|AVAILABLE|RESERVED`, `p.deleted_at IS NULL`, `l.withdrawn_at IS NULL`) — jamais un compteur stocké (CA-V7-031/037) |
| `quota` | int > 0 | Quota du forfait **`ACTIVE`** (le forfait PENDING d'une demande de changement ne s'applique pas encore) |
| `remaining` | int ≥ 0 | `max(0, quota - used)` |

| Champ (`ListingView`) | Type | Sens |
|---|---|---|
| `id` | int ≥ 1 | PK `storefront_listings.id` — l'identifiant utilisé par `DELETE …/listings/:id` |
| `productId` | int ≥ 1 | FK `products.id` (lecture seule) |
| `title` | string | `products.title` au moment de la lecture |
| `price` | int ≥ 0 | `products.price`, FCFA entier |
| `effectiveStatus` | `'PENDING' \| 'AVAILABLE' \| 'RESERVED'` | **Dérivé** de `products.status` par jointure, jamais stocké sur la liaison. `SOLD`/`REJECTED` n'apparaissent pas (listing exclu, place libérée) |
| `createdAt` | ISO 8601 | Ajout à la boutique |

Sans abonnement : `subscription: null`, `usage: null`, `listings: []`, `plans: [ …3 paliers ]` (réponse `200`, pas de `404` — l'espace privé existe toujours, il affiche l'écran de choix).

### 6.4 `StorefrontPublic` (boutique publique — `GET /api/storefront/:slug`)

```json
{
  "storefront": { "slug": "mode-dakar", "displayName": "Aïcha M.", "memberSince": 2024 },
  "items": [
    { "id": 88, "name": "Veste en jean — taille M", "price": 12000,
      "primaryPhotoUrl": "/uploads/products/9f1c3d2a.jpg", "effectiveStatus": "AVAILABLE" }
  ],
  "page": 1, "perPage": 12, "total": 3, "totalPages": 1
}
```

| Champ (`storefront`) | Type | Règle |
|---|---|---|
| `slug` | string | Slug normalisé demandé |
| `displayName` | string | `users.display_name`. **Jamais** `name`, `email`, `phone`, `whatsapp`, `tel:`, `mailto:` (CA-V7-026) — le sérialiseur public V7 (`serializeStorefrontPublic`) ne lit que `display_name` et `created_at` |
| `memberSince` | int | Année d'inscription du vendeur (`users.created_at`, `getUTCFullYear()`) — exposition publique mono-parallèle ajoutée par le fix du 17/11/2026 ; aucune autre donnée personnelle n'est exposée |

| Champ (`items[]`) | Type | Règle |
|---|---|---|
| `id` | int ≥ 1 | **`products.id` — le même `id` que dans le catalogue** (CA-V7-035 : aucune duplication, une seule ligne `products`) |
| `name` | string | `products.title` |
| `price` | int ≥ 0 | FCFA entier |
| `primaryPhotoUrl` | string \| null | Photo primaire (convention photos produits v2.6), `null` si aucune |
| `effectiveStatus` | `'PENDING' \| 'AVAILABLE' \| 'RESERVED'` | Dérivé de `products.status` par jointure |

**Source unique des annonces : la table `products`.** La boutique ne duplique rien : `storefront_listings` ne porte que `(product_id, subscription_id, created_at, withdrawn_at)`. Les éléments affichés sont exactement les listings non retirés dont `products.status ∈ ('PENDING','AVAILABLE','RESERVED')` et `products.deleted_at IS NULL`. Liste vide → `200` avec `items: []` (jamais de `404` pour une boutique ouverte sans annonce).

**Aucune coordonnée privée, nulle part** : ni dans `storefront`, ni dans `items`, ni dans les headers, ni dans le HTML qui consommera ce JSON. Le vendeur est joignable **uniquement** via le formulaire interne (route 6).

### 6.5 `SubscriptionAdminItem` (file admin — `GET /api/admin/subscriptions`)

Enveloppe paginée `{ items, page, perPage, total, totalPages }` ; chaque élément :

| Champ | Type | Règle |
|---|---|---|
| `id` | int ≥ 1 | `seller_subscriptions.id` |
| `sellerId` | int ≥ 1 | `users.id` du demandeur |
| `sellerDisplayName` | string | `users.display_name` (vue interne admin — autorisé, ce n'est pas une vue publique) |
| `planName` | string | `'Découverte' \| 'Boutique' \| 'Atelier'` |
| `priceFcfa` | int > 0 | Prix du forfait (depuis la base) |
| `quota` | int > 0 | Quota du forfait |
| `slug` | string | Slug demandé (normalisé) |
| `status` | enum | `PENDING \| ACTIVE \| EXPIRED \| CANCELLED` |
| `createdAt` | ISO 8601 | Date de la demande |
| `activatedAt` | ISO 8601 \| null | Présent après activation |
| `activatedBy` | int \| null | `users.id` de l'admin ayant activé, sinon `null` |

### 6.6 `StorefrontContactNotification` (effet de la route 6)

La route 6 insère une ligne `notifications` **dans la même transaction** :

| Champ `notifications` | Valeur |
|---|---|
| `user_id` | `seller_id` de la boutique (le vendeur Abonné — **uniquement lui**) |
| `type` | **`product.contact`** — valeur d'enum **existante** (V4/N14), réutilisée telle quelle ; **aucun type créé, `notification_type` inchangé** (CA-V7-045/046, décision chef de projet R-V7-A3 clos) |
| `title` | `Nouveau message depuis la boutique « <slug> » — De : <displayName du demandeur>` |
| `message` | `De : <displayName>< — <email>>\n\n<message envoyé>` (l'email du demandeur n'est ajouté que s'il a été fourni) |

L'`email` du demandeur n'apparaît **que** dans la notification destinée au vendeur — jamais dans la réponse HTTP, jamais dans un autre endpoint, jamais dans les logs applicatifs (renforcé par §1.6 v2.6 / T22).

---

## 7. Détail des 8 routes

> Pour chaque route : corps, champs (types, bornes, dimensions), exemple de requête, réponse `2xx`, puis **tous les chemins d'erreur simulés** (succès, chaque 4xx, cas 500) avec le payload attendu. Le format est uniforme : `{ "error": { "code", "message", "details?" } }`.

### 7.1 `POST /api/subscriptions` — souscription / changement de forfait

**Rôle** : `requireAuth` (user **ou** admin — un admin a un profil, décision architecture §4.2(1) ; aucun RBAC nouveau). **Mutation** : oui → CSRF double soumission automatique.

> **Règle unique — `supersedesId` (arbitrage définitif du chef de projet, 17/11/2026)** : un `supersedesId` pointant vers un abonnement **d’un autre vendeur**, vers un abonnement **inexistant**, ou vers un abonnement **d’autrui non supersédable** renvoie `404 NOT_FOUND` — il n’est jamais confirmé qu’il existe quoi que ce soit (règle de non-divulgation, §5.1) ; un `supersedesId` pointant vers **son propre** abonnement de statut **différent de `ACTIVE`** (`PENDING`, `EXPIRED`, `CANCELLED`, ou déjà remplacé par une activation) renvoie `400 INVALID_SUPERSEDES` ; un `supersedesId` pointant vers **son propre** abonnement `ACTIVE` reste un changement de forfait valide (l’ancien est `CANCELLED` à l’activation, le nouveau devient `ACTIVE`).

**Corps (JSON) :**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `planId` | int ≥ 1 | ✅ | Doit référencer un `subscription_plans.id` avec `active = TRUE`, sinon `404 PLAN_NOT_FOUND` |
| `slug` | string | ✅ (ignoré si `supersedesId` fourni — voir règles) | 3–40 caractères ; normalisé **serveur** (§5.4) ; regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` ; 20 mots réservés refusés |
| `supersedesId` | int ≥ 1 \| null | ⬜ | Abonnement **`ACTIVE` du vendeur connecté** à remplacer (changement de forfait, CA-V7-015). Renseigné + propre `ACTIVE` ⇒ intention de changement (activation avec `CANCELLED` du prédécesseur + réattach des listings ; slug **copié depuis le prédécesseur**, le `slug` envoyé est ignoré). Absent ⇒ demande indépendante (`409 SUBSCRIPTION_ALREADY_ACTIVE` à l'activation si un `ACTIVE` existe, CA-V7-011). D'autrui / inexistant / d'autrui non supersédable ⇒ `404 NOT_FOUND` ; propre non-`ACTIVE` ⇒ `400 INVALID_SUPERSEDES` (**arbitrage définitif 17/11/2026**, voir règle unique ci-dessus) |

**Règles de `supersedesId`** (**arbitrage définitif du chef de projet, 17/11/2026** — C-V7-5 **CLOSE**, voir §14) :

| Cas | Résultat |
|---|---|
| **`ACTIVE` du connecté** | **Accepté** ; `supersedes_id` renseigné ; slug copié du prédécesseur ; l'ancien reste `ACTIVE` jusqu'à activation du nouveau, puis passe `CANCELLED` (le nouveau devient `ACTIVE`) |
| **D'un autre vendeur, inexistant, ou non supersédable d'autrui** | `404 NOT_FOUND` — **aucune confirmation d'existence** (règle de non-divulgation, arbitrage définitif 17/11/2026) |
| **Son propre abonnement, non `ACTIVE`** (`PENDING`, `EXPIRED`, `CANCELLED`, ou déjà remplacé par une activation) | `400 INVALID_SUPERSEDES` — l'abonnement du demandeur existe bien pour lui, mais seul un `ACTIVE` est remplaçable |
| Fourni, non entier ou ≤ 0 | `400 VALIDATION_ERROR` (details `field: "supersedesId"`) |

> **Frontière `400` vs `404`** — **CLOSE par arbitrage définitif du chef de projet, 17/11/2026** : `404 NOT_FOUND` = `supersedesId` pointant vers un abonnement d'un autre vendeur, inexistant, ou non supersédable d'autrui (jamais de confirmation d'existence, §5.1) ; `400 INVALID_SUPERSEDES` = `supersedesId` pointant vers **son propre** abonnement de statut ≠ `ACTIVE` ; `supersedesId` pointant vers son propre `ACTIVE` = changement de forfait valide (l'ancien est `CANCELLED` à l'activation, le nouveau devient `ACTIVE`). Cette route n'est pas couverte par l'exception `403 NOT_PRODUCT_OWNER` (§5.2).

**Exemple — requête :**

```json
{ "planId": 1, "slug": "Mode Dakar", "supersedesId": null }
```

**Réponse `201` :**

```json
{
  "subscription": {
    "id": 41, "planId": 1, "slug": "mode-dakar", "status": "PENDING",
    "supersedesId": null, "createdAt": "2026-11-17T10:15:00.000Z"
  }
}
```

> Le vendeur voit « En attente d'activation par l'administration » côté UI. **Aucun accès abonné** tant que l'admin n'a pas activé (CA-V7-012).

**Simulation des chemins (succès, 4xx, 500) :**

| # | Scénario | Résultat | Payload |
|---|---|---|---|
| a | Souscription valide (`planId=1`, `slug="Mode Dakar"`) | `201` | ci-dessus (`slug` normalisé `mode-dakar`) |
| b | Slug déjà pris par un **autre** vendeur (`Mode Dakar` puis `mode-dakar`) | `409 SLUG_TAKEN` | `{ "error": { "code": "SLUG_TAKEN", "message": "Cette adresse de boutique est déjà prise" } }` |
| c | Slug réservé (`admin`, `boutique`… — 20 mots, §5.4) | `400 SLUG_RESERVED` | `{ "error": { "code": "SLUG_RESERVED", "message": "Ce nom est réservé, choisissez-en un autre" } }` |
| d | Slug invalide (`a`, `ab`, `--x`, `x--y`, `mode_dakar`, `mode.dakar`, `république`, `a/b`, 41 car.) | `400 VALIDATION_ERROR` | `{ "error": { "code": "VALIDATION_ERROR", "message": "Données invalides", "details": [ { "field": "slug", "message": "Le slug doit faire 3 à 40 caractères, minuscules/chiffres séparés par des tirets" } ] } }` |
| e | `planId` absent / non entier / ≤ 0 | `400 VALIDATION_ERROR` | `details: [ { "field": "planId", "message": "planId doit être un entier ≥ 1" } ]` |
| f | `planId` inconnu ou plan `active = FALSE` | `404 PLAN_NOT_FOUND` | `{ "error": { "code": "PLAN_NOT_FOUND", "message": "Forfait introuvable" } }` |
| g | `supersedesId` d'autrui ou inexistant | `404 NOT_FOUND` | `{ "error": { "code": "NOT_FOUND", "message": "Abonnement introuvable" } }` |
| h | `supersedesId` = **son propre** abonnement non-`ACTIVE` (`PENDING`, `EXPIRED`, `CANCELLED`, déjà remplacé) | `400 INVALID_SUPERSEDES` | `{ "error": { "code": "INVALID_SUPERSEDES", "message": "Votre abonnement n'est pas actif : seul un abonnement actif peut être remplacé" } }` |
| i | Session absente | `401 UNAUTHENTICATED` | `{ "error": { "code": "UNAUTHENTICATED", "message": "Vous devez être connecté" } }` |
| j | Erreur interne (BDD, transaction) | `500 INTERNAL_ERROR` | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Erreurs — table récapitulative :**

| Statut | Code | Condition |
|---|---|---|
| `401` | `UNAUTHENTICATED` | session absente/invalide |
| `400` | `VALIDATION_ERROR` | `planId`/`slug`/`supersedesId` invalides (details par champ) |
| `400` | `SLUG_RESERVED` | slug ∈ 20 mots réservés |
| `400` | `INVALID_SUPERSEDES` | `supersedesId` = **son propre** abonnement de statut ≠ `ACTIVE` (arbitrage définitif 17/11/2026) |
| `404` | `PLAN_NOT_FOUND` | plan inexistant ou inactif |
| `404` | `NOT_FOUND` | `supersedesId` pointant vers un abonnement **d'un autre vendeur**, **inexistant** ou **non supersédable d'autrui** — aucune confirmation d'existence (non-divulgation, arbitrage définitif 17/11/2026) |
| `409` | `SLUG_TAKEN` | slug déjà réservé par un autre vendeur (tous statuts, à vie) ou conflit `uq_active_subscription_slug` (23505) |
| `500` | `INTERNAL_ERROR` | — |

> **`SUBSCRIPTION_ALREADY_ACTIVE` n'est PAS renvoyé ici** : la souscription crée toujours un `PENDING` ; le 409 de double activation est à l'étape d'activation (route 8, CA-V7-011). **Un `status` envoyé dans le corps est ignoré** (jamais lu par le service — CA-V7-014).

---

### 7.2 `GET /api/subscriptions/me` — mon abonnement (consultation)

**Rôle** : `requireAuth`. **Mutation** : non (mais matérialise paresseusement une expiration `ACTIVE → EXPIRED` si `ends_at ≤ now()` — lecture avec effet idempotent conditionnel, architecture §3.2/§3.4, **sans cron**).

**Requête** : aucun corps, aucun paramètre.

**Réponse `200` — avec abonnement `ACTIVE` :**

```json
{
  "subscription": {
    "id": 41, "status": "ACTIVE", "slug": "mode-dakar",
    "plan": { "id": 1, "name": "Découverte", "priceFcfa": 2000, "quota": 10, "durationDays": 30 },
    "supersedesId": null,
    "startedAt": "2026-11-17T10:15:00.000Z", "endsAt": "2026-12-17T10:15:00.000Z",
    "daysRemaining": 30, "activatedBy": 7, "activatedAt": "2026-11-17T10:15:00.000Z",
    "createdAt": "2026-11-16T18:02:00.000Z"
  },
  "usage": { "used": 3, "quota": 10, "remaining": 7 },
  "listings": [
    { "id": 12, "productId": 88, "title": "Veste en jean — taille M", "price": 12000,
      "effectiveStatus": "AVAILABLE", "createdAt": "2026-11-17T10:20:00.000Z" }
  ],
  "plans": [
    { "id": 1, "name": "Découverte", "priceFcfa": 2000, "quota": 10, "durationDays": 30 },
    { "id": 2, "name": "Boutique",   "priceFcfa": 5000, "quota": 30, "durationDays": 30 },
    { "id": 3, "name": "Atelier",    "priceFcfa": 10000, "quota": 100, "durationDays": 30 }
  ]
}
```

**Réponse `200` — variantes :**

- **Sans abonnement** (jamais souscrit) : `{ "subscription": null, "usage": null, "listings": [], "plans": [ …3 paliers ] }` — le front affiche l'écran de choix.
- **`PENDING`** : `subscription.status = "PENDING"`, `startedAt`/`endsAt`/`activatedBy`/`activatedAt`/`daysRemaining` à `null`/`0` ; `usage: null` ; `listings: []` ; plans présents. Le front affiche « En attente d'activation par l'administration ».
- **`EXPIRED`** : `status = "EXPIRED"` + `message` clair, affichable tel quel (CA-V7-016) :

```json
{
  "subscription": { "id": 41, "status": "EXPIRED", "slug": "mode-dakar",
    "plan": { "id": 1, "name": "Découverte", "priceFcfa": 2000, "quota": 10, "durationDays": 30 },
    "startedAt": "2026-10-18T09:00:00.000Z", "endsAt": "2026-11-17T09:00:00.000Z",
    "daysRemaining": 0, "activatedBy": 7, "activatedAt": "2026-10-18T09:00:00.000Z",
    "createdAt": "2026-10-17T12:00:00.000Z",
    "message": "Votre abonnement a expiré le 17 novembre 2026. Vos annonces de boutique sont conservées ; souscrivez à nouveau pour rouvrir votre vitrine." },
  "usage": { "used": 3, "quota": 10, "remaining": 7 },
  "listings": [
    { "id": 12, "productId": 88, "title": "Veste en jean — taille M", "price": 12000,
      "effectiveStatus": "AVAILABLE", "createdAt": "2026-11-17T10:20:00.000Z" }
  ],
  "plans": [
    { "id": 1, "name": "Découverte", "priceFcfa": 2000, "quota": 10, "durationDays": 30 },
    { "id": 2, "name": "Boutique",   "priceFcfa": 5000, "quota": 30, "durationDays": 30 },
    { "id": 3, "name": "Atelier",    "priceFcfa": 10000, "quota": 100, "durationDays": 30 }
  ]
}
```

> Les annonces de boutique sont **conservées, jamais supprimées**, à l'expiration ; le catalogue reste intact ; les produits restent visibles et vendables ; une **re-souscription** est possible via une nouvelle demande **sans `supersedesId`** (un `supersedesId` pointant vers un `EXPIRED`/`CANCELLED` du connecté est refusé `400 INVALID_SUPERSEDES` — arbitrage définitif 17/11/2026) ; le slug identique reste autorisé (unicité réservée aux `ACTIVE`, même vendeur).
- **`CANCELLED`** : même forme qu'`EXPIRED`, sans `message` d'expiration ; `daysRemaining: 0`.

`effectiveStatus` est **dérivé en lecture** de `products.status` par jointure — jamais stocké (§6.3). Les prix/quotas proviennent de `subscription_plans` (aucun tarif en dur, CA-V7-010).

**Simulation des chemins :**

| # | Scénario | Résultat | Payload |
|---|---|---|---|
| a | Abonnement `ACTIVE` | `200` | ci-dessus |
| b | Jamais souscrit | `200` | `subscription: null`, `usage: null`, `listings: []`, `plans: [ … ]` |
| c | `PENDING` | `200` | `status: "PENDING"`, `usage: null`, `listings: []` |
| d | `EXPIRED` (ou expiré paresseusement matérialisé à la lecture) | `200` | `status: "EXPIRED"` + `message` (ci-dessus) |
| e | `CANCELLED` | `200` | `status: "CANCELLED"`, `daysRemaining: 0` |
| f | Session absente | `401 UNAUTHENTICATED` | `{ "error": { "code": "UNAUTHENTICATED", "message": "Vous devez être connecté" } }` |
| g | Erreur interne | `500 INTERNAL_ERROR` | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Erreurs :** `401 UNAUTHENTICATED` · `500 INTERNAL_ERROR`. Aucun autre 4xx possible (pas de paramètre, pas de corps).

---

### 7.3 `POST /api/storefront/listings` — ajout d'une annonce à la boutique (seul point de contrôle du quota)

**Rôle** : `requireAuth` **+ abonnement `ACTIVE` non expiré** du vendeur connecté. **Mutation** : oui → CSRF automatique.

**Corps (JSON) :**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `productId` | int ≥ 1 | ✅ | `products.id` existant, **appartenant au vendeur connecté**, non supprimé logiquement (`deleted_at IS NULL`) |

**Exemple — requête :** `{ "productId": 88 }`

**Réponse `201` :**

```json
{ "listing": { "id": 12, "productId": 88, "createdAt": "2026-11-17T10:20:00.000Z" } }
```

**Gardes, dans l'ordre** (une transaction, architecture §4.2(3)) :

1. `requireAuth` → sinon `401 UNAUTHENTICATED`.
2. Résolution de l'abonnement `ACTIVE` non expiré du vendeur → sinon `403 SUBSCRIPTION_REQUIRED` (CA-V7-012/030/039). (Un `PENDING`/`EXPIRED`/`CANCELLED` ou l'absence d'abonnement répond `403`, jamais `404` : le vendeur sait qu'il n'est pas abonné.)
3. Lecture du produit : inexistant (ou `deleted_at NOT NULL`) → `404 PRODUCT_NOT_FOUND` ; `owner_id <> session.userId` → **`403 NOT_PRODUCT_OWNER`** (exception assumée §5.2).
4. Verrou `SELECT … FROM seller_subscriptions WHERE id = $1 FOR UPDATE` (sérialise les ajouts d'un même abonnement — R-V7-A5).
5. Comptage par jointure (§6.3) : si `used >= plan.quota` → `409 STOREFRONT_QUOTA_EXCEEDED`, message **affichable tel quel** (CA-V7-032) :
   `« Quota de votre forfait atteint (10/10). Retirez une annonce de votre boutique ou changez de forfait. »` — la paire `(used)/(quota)` est celle du forfait réel. **Aucune annonce créée, aucun produit modifié, aucune vente bloquée.**
6. `INSERT storefront_listings (product_id, subscription_id) VALUES ($1, $2)` — l'unicité active `(product_id) WHERE withdrawn_at IS NULL` (23505) → `409 STOREFRONT_ALREADY_LISTED`.

**Simulation des chemins :**

| # | Scénario | Résultat | Payload |
|---|---|---|---|
| a | Ajout valide, quota disponible (3/10) | `201` | `{ "listing": { "id": 12, "productId": 88, "createdAt": "2026-11-17T10:20:00.000Z" } }` |
| b | Sans abonnement, ou `PENDING`/`EXPIRED`/`CANCELLED` | `403 SUBSCRIPTION_REQUIRED` | `{ "error": { "code": "SUBSCRIPTION_REQUIRED", "message": "Un abonnement actif est nécessaire pour gérer votre boutique" } }` |
| c | `productId` inexistant / supprimé | `404 PRODUCT_NOT_FOUND` | `{ "error": { "code": "PRODUCT_NOT_FOUND", "message": "Article introuvable" } }` |
| d | Produit d'un **autre** vendeur | `403 NOT_PRODUCT_OWNER` | `{ "error": { "code": "NOT_PRODUCT_OWNER", "message": "Ce produit ne vous appartient pas" } }` |
| e | Quota atteint (10/10, `Découverte`) — ajouts 1→10 `201`, 11ᵉ refusé | `409 STOREFRONT_QUOTA_EXCEEDED` | `{ "error": { "code": "STOREFRONT_QUOTA_EXCEEDED", "message": "Quota de votre forfait atteint (10/10). Retirez une annonce de votre boutique ou changez de forfait." } }` |
| f | Produit déjà présent dans la boutique (actif) | `409 STOREFRONT_ALREADY_LISTED` | `{ "error": { "code": "STOREFRONT_ALREADY_LISTED", "message": "Cette annonce est déjà dans votre boutique" } }` |
| g | `productId` absent / non entier / ≤ 0 | `400 VALIDATION_ERROR` | `details: [ { "field": "productId", "message": "productId doit être un entier ≥ 1" } ]` |
| h | Session absente | `401 UNAUTHENTICATED` | `{ "error": { "code": "UNAUTHENTICATED", "message": "Vous devez être connecté" } }` |
| i | Erreur interne (transaction, verrou) | `500 INTERNAL_ERROR` | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Erreurs :** `401 UNAUTHENTICATED` · `400 VALIDATION_ERROR` · `403 SUBSCRIPTION_REQUIRED` · `403 NOT_PRODUCT_OWNER` · `404 PRODUCT_NOT_FOUND` · `409 STOREFRONT_QUOTA_EXCEEDED` · `409 STOREFRONT_ALREADY_LISTED` · `500 INTERNAL_ERROR`.

> **Le produit refusé par la boutique reste normalement visible et vendable dans le catalogue** : ce routeur n'est jamais appelé depuis `POST /api/products`, aucune logique de quota n'existe ailleurs (CA-V7-033/038). Une vente sur un produit listé passe `products.status = SOLD` via le **pipeline existant** — la place se libère **en lecture**, sans aucune écriture V7 (CA-V7-037). Aucun tarif d'abonnement n'entre dans ce calcul (§9).

---

### 7.4 `DELETE /api/storefront/listings/:id` — retrait boutique-scopé

**Rôle** : `requireAuth` + **propriétaire du listing**. **Mutation** : oui → CSRF automatique.

**Paramètre de chemin** : `:id` — `storefront_listings.id`, entier ≥ 1 (non entier → `400 VALIDATION_ERROR`, `details: [ { "field": "id", … } ]`).

**Effet** : `UPDATE storefront_listings SET withdrawn_at = now() WHERE id = $1 AND withdrawn_at IS NULL AND subscription_id IN (SELECT id FROM seller_subscriptions WHERE seller_id = $seller)`. **Idempotent** : un listing déjà retiré répond `200` (pas de `404`, pas d'erreur). **Aucune écriture sur `products`**, aucune annulation de commande, aucun statut écrit sur la liaison (CA-V7-034) — `withdrawn_at` est le seul marqueur.

**Réponse `200` :**

```json
{ "ok": true }
```

**Simulation des chemins :**

| # | Scénario | Résultat | Payload |
|---|---|---|---|
| a | Retrait d'un listing actif du connecté | `200` | `{ "ok": true }` |
| b | Retrait d'un listing déjà retiré (idempotent) | `200` | `{ "ok": true }` |
| c | Listing inexistant | `404 NOT_FOUND` | `{ "error": { "code": "NOT_FOUND", "message": "Annonce de boutique introuvable" } }` |
| d | Listing d'un **autre vendeur** | `404 NOT_FOUND` (**jamais** `403` — §1.4 v2.6 conservée ici) | idem |
| e | `:id` non entier ou ≤ 0 | `400 VALIDATION_ERROR` | `details: [ { "field": "id", "message": "id doit être un entier ≥ 1" } ]` |
| f | Session absente | `401 UNAUTHENTICATED` | `{ "error": { "code": "UNAUTHENTICATED", "message": "Vous devez être connecté" } }` |
| g | Erreur interne | `500 INTERNAL_ERROR` | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Erreurs :** `401 UNAUTHENTICATED` · `400 VALIDATION_ERROR` · `404 NOT_FOUND` · `500 INTERNAL_ERROR`.

> Après retrait : le listing disparaît de `/boutique/:slug`, une place de quota se libère, **le produit reste dans le catalogue**, sa fiche répond `200`, ses commandes en cours sont intactes (CA-V7-034).

---

### 7.5 `GET /api/storefront/:slug` — boutique publique

**Rôle** : **public** — aucune session requise (CA-V7-023). Un visiteur anonyme reçoit `200` exactement comme un utilisateur connecté.

**Paramètre de chemin** : `:slug` — 3–40 caractères, format §5.4 (un slug hors format n'est pas une erreur 4xx : il ne matche simplement aucune boutique → `404 NOT_FOUND`, non-divulgation §5.1).

**Query (optionnels) :**

| Paramètre | Type | Défaut | Contraintes |
|---|---|---|---|
| `page` | int ≥ 1 | `1` | Hors bornes → `400 VALIDATION_ERROR` |
| `per_page` | int 1..48 | `12` | Hors bornes → `400 VALIDATION_ERROR` |

**Réponse `200`** (§6.4) :

```json
{
  "storefront": { "slug": "mode-dakar", "displayName": "Aïcha M.", "memberSince": 2024 },
  "items": [
    { "id": 88, "name": "Veste en jean — taille M", "price": 12000,
      "primaryPhotoUrl": "/uploads/products/9f1c3d2a.jpg", "effectiveStatus": "AVAILABLE" },
    { "id": 91, "name": "Sandales cuir — pointure 42", "price": 8000,
      "primaryPhotoUrl": null, "effectiveStatus": "RESERVED" }
  ],
  "page": 1, "perPage": 12, "total": 3, "totalPages": 1
}
```

**Réponse `200` — boutique ouverte sans annonce :** `{ "storefront": { … }, "items": [], "page": 1, "perPage": 12, "total": 0, "totalPages": 0 }`.

**Règles :**

- Uniquement les listings non retirés (`withdrawn_at IS NULL`) dont `products.status ∈ ('PENDING','AVAILABLE','RESERVED')` et `products.deleted_at IS NULL`.
- **`Cache-Control: private, no-store`** (décision explicite V7 — §10.3) : même si la réponse est identique pour tous, elle reste hors du cache public v2.6 ; une réponse `404` ne doit jamais être cachée non plus.
- **Aucune donnée personnelle** : `storefront` = `displayName` + `memberSince` uniquement ; `items` = champs produit publics (même sérialiseur d'esprit que `ProductCard` v2.6 §2.2, sans les données de commande). **Zéro occurrence possible de `phone`, `whatsapp`, `email`, `tel:`, `mailto:`** dans le corps (CA-V7-026) — vérifiable par regex en test.
- Les ids renvoyés sont des **`products.id`** (CA-V7-035 — même id catalogue/boutique, une seule ligne `products`).

**Simulation des chemins :**

| # | Scénario | Résultat | Payload |
|---|---|---|---|
| a | Abonnement `ACTIVE`, 3 listings, anonyme | `200` | ci-dessus |
| b | Abonnement `ACTIVE`, 0 listing | `200` | `items: []`, `total: 0` |
| c | Slug inconnu | `404 NOT_FOUND` | `{ "error": { "code": "NOT_FOUND", "message": "Boutique introuvable" } }` |
| d | Abonnement `PENDING` | `404 NOT_FOUND` | idem — **payload strictement identique** (§5.1) |
| e | Abonnement `EXPIRED` | `404 NOT_FOUND` | idem |
| f | Abonnement `CANCELLED` / vendeur non abonné | `404 NOT_FOUND` | idem |
| g | `page=0` ou `per_page=49` ou non numériques | `400 VALIDATION_ERROR` | `details: [ { "field": "per_page", "message": "per_page doit être entre 1 et 48" } ]` |
| h | Erreur interne | `500 INTERNAL_ERROR` | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Erreurs :** `400 VALIDATION_ERROR` (pagination) · `404 NOT_FOUND` (tous motifs de non-divulgation, payload unique) · `500 INTERNAL_ERROR`. **Aucune session n'est requise ; aucun `401`/`403` possible.**

---

### 7.6 `POST /api/storefront/:slug/contact` — formulaire interne boutique-scopé

**Rôle** : `requireAuth` (user ou admin — même choix que route 1, cohérent v2.6 §3.2 quater : l'admin est un utilisateur authentifié ; aucun RBAC nouveau). **Mutation** : oui → CSRF automatique. **Rate limit dédié : `storefront-contact` — 10 requêtes / IP / 10 min** (au-delà : `429 RATE_LIMITED` + `Retry-After`).

**Corps (JSON) :**

| Champ | Type | Obligatoire | Contraintes |
|---|---|---|---|
| `message` | string | ✅ | **10 à 2000 caractères** (trimmé) — le contenu du message |
| `email` | string | ⬜ | Format e-mail, **≤ 254 caractères** (trimmé, stocké en minuscules) — **coordonnée d'échange du demandeur**, visible du **vendeur uniquement** ; préfillé côté front avec l'email du compte connecté |

**Exemple — requête :**

```json
{ "message": "Bonjour, ce meuble est-il toujours disponible ? Je peux passer samedi.", "email": "aicha@example.com" }
```

**Réponse `201` :**

```json
{ "ok": true, "notificationId": 401 }
```

**Gardes, dans l'ordre** (une transaction, architecture §4.2(6)) :

1. `requireAuth` → sinon `401 UNAUTHENTICATED`.
2. **Même requête de non-divulgation que la boutique** → `404 NOT_FOUND` identique si inconnu/`PENDING`/`EXPIRED`/`CANCELLED` (§5.1).
3. Si `seller_id = session.userId` → `400 CONTACT_SELF` (CA-V7-048) : « Vous ne pouvez pas contacter votre propre boutique ».
4. `INSERT notifications (user_id = seller_id, type = 'product.contact', title, message) RETURNING id` **dans la même transaction** :
   - `title` : `Nouveau message depuis la boutique « <slug> » — De : <displayName du demandeur>`
   - `message` : `De : <displayName>< — <email>>\n\n<message>` (email uniquement s'il a été fourni)
5. `COMMIT` → `201`.

**Notification interne uniquement** : type existant `product.contact` (**aucun nouveau type**, `notification_type` inchangé — CA-V7-045/046). **Jamais de canal privé** : cette route n'expose aucun `tel:`, `mailto:`, `whatsapp:` ni bouton d'appel ; elle n'en ajoute **aucun** sur `/catalogue/:slug` (CA-V7-047) ; la réponse ne contient jamais l'email du vendeur ; l'email du **demandeur** n'apparaît que dans la notification destinée au vendeur.

**Simulation des chemins :**

| # | Scénario | Résultat | Payload |
|---|---|---|---|
| a | Message 10–2000 car. + email optionnel | `201` | `{ "ok": true, "notificationId": 401 }` |
| b | Message 9 caractères / 2001 caractères | `400 VALIDATION_ERROR` | `details: [ { "field": "message", "message": "Le message doit contenir entre 10 et 2000 caractères" } ]` |
| c | `email` malformé ou > 254 | `400 VALIDATION_ERROR` | `details: [ { "field": "email", "message": "Adresse e-mail invalide (254 caractères max)" } ]` |
| d | Vendeur contactant **sa propre** boutique | `400 CONTACT_SELF` | `{ "error": { "code": "CONTACT_SELF", "message": "Vous ne pouvez pas contacter votre propre boutique" } }` |
| e | Boutique inconnue / `PENDING` / `EXPIRED` | `404 NOT_FOUND` | `{ "error": { "code": "NOT_FOUND", "message": "Boutique introuvable" } }` — **identique** (§5.1) |
| f | Session absente | `401 UNAUTHENTICATED` | `{ "error": { "code": "UNAUTHENTICATED", "message": "Vous devez être connecté" } }` |
| g | 11ᵉ message en 10 minutes (même IP) | `429 RATE_LIMITED` | `{ "error": { "code": "RATE_LIMITED", "message": "Trop de requêtes, réessayez dans 10 minute(s)" } }` + header `Retry-After: 600` |
| h | Erreur interne (transaction, insert notification) | `500 INTERNAL_ERROR` | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Erreurs :** `401 UNAUTHENTICATED` · `400 VALIDATION_ERROR` (details `message`/`email`) · `400 CONTACT_SELF` · `404 NOT_FOUND` (payload unique, §5.1) · `429 RATE_LIMITED` (scope `storefront-contact`) · `500 INTERNAL_ERROR`.

> Cette route est **strictement boutique-scopée** : le formulaire n'est rendu que sur `/boutique/:slug`. `/catalogue/:slug` ne gagne aucun libellé « Contacter », aucun `mailto:`/`tel:` (verrou CA-V5-101 / CA-V7-047).

### 7.7 `GET /api/admin/subscriptions` — file admin (demandes + historique)

**Rôle** : `requireAdmin`. Un `user` authentifié → `403 FORBIDDEN` (API) et redirection front sans page 403 (convention ARB-V5-02, CA-V7-050). **Mutation** : non.

**Query (optionnels) :**

| Paramètre | Type | Défaut | Contraintes |
|---|---|---|---|
| `status` | `'PENDING' \| 'ACTIVE' \| 'EXPIRED' \| 'CANCELLED'` | `PENDING` | Autre valeur → `400 VALIDATION_ERROR` (details `field: "status"`) |
| `page` | int ≥ 1 | `1` | Hors bornes → `400 VALIDATION_ERROR` |
| `per_page` | int 1..48 | `12` | Hors bornes → `400 VALIDATION_ERROR` |

**Réponse `200`** — enveloppe paginée (§1.5 v2.6), tri `created_at DESC` :

```json
{
  "items": [
    { "id": 41, "sellerId": 17, "sellerDisplayName": "Aïcha M.",
      "planName": "Boutique", "priceFcfa": 5000, "quota": 30,
      "slug": "mode-dakar", "status": "PENDING",
      "createdAt": "2026-11-17T09:30:00.000Z", "activatedAt": null, "activatedBy": null },
    { "id": 40, "sellerId": 23, "sellerDisplayName": "Moussa D.",
      "planName": "Découverte", "priceFcfa": 2000, "quota": 10,
      "slug": "atelier-moussa", "status": "ACTIVE",
      "createdAt": "2026-11-16T14:05:00.000Z", "activatedAt": "2026-11-16T15:10:00.000Z", "activatedBy": 7 }
  ],
  "page": 1, "perPage": 12, "total": 2, "totalPages": 1
}
```

**Simulation des chemins :**

| # | Scénario | Résultat | Payload |
|---|---|---|---|
| a | Admin, file `PENDING` (défaut) | `200` | enveloppe ci-dessus |
| b | `?status=ACTIVE&page=2&per_page=24` | `200` | enveloppe paginée (tri `created_at DESC`) |
| c | `?status=whatever` | `400 VALIDATION_ERROR` | `details: [ { "field": "status", "message": "status doit valoir PENDING, ACTIVE, EXPIRED ou CANCELLED" } ]` |
| d | `?page=0` / `per_page=49` / non numériques | `400 VALIDATION_ERROR` | `details: [ { "field": "per_page", "message": "per_page doit être entre 1 et 48" } ]` |
| e | `user` authentifié | `403 FORBIDDEN` | `{ "error": { "code": "FORBIDDEN", "message": "Accès réservé aux administrateurs" } }` |
| f | Session absente | `401 UNAUTHENTICATED` | `{ "error": { "code": "UNAUTHENTICATED", "message": "Vous devez être connecté" } }` |
| g | File vide (aucun `PENDING`) | `200` | `items: []`, `total: 0` — jamais `404` (§1.5 v2.6) |
| h | Erreur interne | `500 INTERNAL_ERROR` | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Erreurs :** `401 UNAUTHENTICATED` · `403 FORBIDDEN` · `400 VALIDATION_ERROR` · `500 INTERNAL_ERROR`.

> Route montée sous `/api/admin` → limiteur admin existant (`60 req / min / IP`, `skipAdmin` — §8 v2.6). Aucun écran ni endpoint de création/édition/suppression de forfait en V7 (CA-V7-053) — les paliers proviennent de la migration/seed.

---

### 7.8 `POST /api/admin/subscriptions/:id/activate` — activation manuelle (transaction)

**Rôle** : **`requireAdmin` uniquement** — jamais un `user` (`403 FORBIDDEN`, CA-V7-013), jamais un cron, un webhook, un paiement ni un payload client (CA-V7-014). **Mutation** : oui → CSRF automatique.

**Paramètre de chemin** : `:id` — `seller_subscriptions.id`, entier ≥ 1 (non entier → `400 VALIDATION_ERROR`).

**Corps (JSON) : `{}`** — aucun champ lu. **Un `status`, un `activated_by`, un `activated_at`, un `ends_at` envoyés par le client sont ignorés** (jamais lus par le service — CA-V7-014).

**Effets** — une seule transaction (architecture §3.2) :

1. **Matérialisation paresseuse** des `ACTIVE` expirés du vendeur (`UPDATE … SET status='EXPIRED' WHERE … AND ends_at <= now()`, idempotent, conditionnel).
2. Si `supersedes_id` est renseigné (changement de forfait, CA-V7-015) : `UPDATE … SET status='CANCELLED' WHERE id = supersedes_id AND seller_id = $seller AND status='ACTIVE'` + **réattach des listings actifs** (`UPDATE storefront_listings SET subscription_id = $new WHERE subscription_id = $old AND withdrawn_at IS NULL`).
   Sinon : garde `SUBSCRIPTION_ALREADY_ACTIVE` si un `ACTIVE` existe déjà pour ce vendeur (CA-V7-011 ; couvre aussi le 23505 de `uq_one_active_subscription_per_seller`).
3. `status = 'ACTIVE'`, `started_at = now()`, `ends_at = now() + 30 days`, **`activated_by = session.userId`**, **`activated_at = now()`** (traçabilité, CA-V7-013/051).
4. La boutique devient **publique immédiatement** (lecture suivante de `GET /api/storefront/:slug` → `200`).

**Réponse `200` :**

```json
{
  "subscription": {
    "id": 41, "status": "ACTIVE", "slug": "mode-dakar",
    "startedAt": "2026-11-17T11:00:00.000Z", "endsAt": "2026-12-17T11:00:00.000Z",
    "activatedBy": 7, "activatedAt": "2026-11-17T11:00:00.000Z"
  }
}
```

**Traçabilité (exigence §8.2) :** seuls `activated_by` (= `admin` connecté, `users.id`) et `activated_at` (= `now()` serveur) sont posés, et **uniquement ici**. Aucun autre chemin — ni la souscription, ni un webhook, ni un paiement, ni un client — ne peut écrire ces champs. Ils sont visibles ensuite dans l'historique admin (`GET /api/admin/subscriptions?status=ACTIVE`, §7.7) et dans `GET /api/subscriptions/me` (§7.2).

**Simulation des chemins :**

| # | Scénario | Résultat | Payload |
|---|---|---|---|
| a | Admin, cible `PENDING`, pas d'`ACTIVE` préalable | `200` | ci-dessus ; `activated_by` = id de l'admin, `activated_at` renseigné |
| b | Admin, changement de forfait (`supersedesId`) : ancien `Boutique` ACTIVE → `Atelier` | `200` | ci-dessus ; **COUNT(ACTIVE) = 1** (le nouveau), l'ancien passe `CANCELLED`, listings actifs réattachés |
| c | Admin, 2ᵉ abonnement **indépendant** du même vendeur (un `ACTIVE` existe) | `409 SUBSCRIPTION_ALREADY_ACTIVE` | `{ "error": { "code": "SUBSCRIPTION_ALREADY_ACTIVE", "message": "Ce vendeur a déjà un abonnement actif" } }` |
| d | Cible pas `PENDING` (déjà `ACTIVE`, `EXPIRED` ou `CANCELLED`) | `409 INVALID_STATUS` | `{ "error": { "code": "INVALID_STATUS", "message": "Cette demande n'est pas en attente d'activation" } }` |
| e | `:id` inexistant | `404 NOT_FOUND` | `{ "error": { "code": "NOT_FOUND", "message": "Abonnement introuvable" } }` |
| f | `:id` non entier ou ≤ 0 | `400 VALIDATION_ERROR` | `details: [ { "field": "id", "message": "id doit être un entier ≥ 1" } ]` |
| g | `user` authentifié (pas admin) | `403 FORBIDDEN` | `{ "error": { "code": "FORBIDDEN", "message": "Accès réservé aux administrateurs" } }` |
| h | Session absente | `401 UNAUTHENTICATED` | `{ "error": { "code": "UNAUTHENTICATED", "message": "Vous devez être connecté" } }` |
| i | Corps `{ "status": "ACTIVE" }` envoyé par le client | `200` — **champ ignoré**, pas de `4xx`, pas de chemin d'activation détourné | réponse identique au cas (a) |
| j | Erreur interne (transaction) | `500 INTERNAL_ERROR` | `{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }` |

**Erreurs :** `401 UNAUTHENTICATED` · `403 FORBIDDEN` · `400 VALIDATION_ERROR` · `404 NOT_FOUND` · `409 INVALID_STATUS` · `409 SUBSCRIPTION_ALREADY_ACTIVE` · `500 INTERNAL_ERROR`.

> **Jamais de double `ACTIVE`** : la contrainte partielle `uq_one_active_subscription_per_seller` est le filet DB ; le service applique la garde applicative avant l'`INSERT/UPDATE` (CA-V7-011/015). **Aucun trigger SQL** n'est ajouté sur `seller_subscriptions` — la matrice est portée par le service.

---

## 8. Synthèses opposables (contact boutique, activation admin, boutique publique)

### 8.1 Contact boutique — exigences contractuelles (route 6)

| Exigence | Contrat |
|---|---|
| Champs | `message` (**string, 10–2000 caractères**, trimmé) · `email` (**string optionnel**, format e-mail, **≤ 254**, minuscules) |
| Borne basse / haute | `message` : `min(10)` / `max(2000)` — hors bornes → `400 VALIDATION_ERROR` avec `details` (`field: "message"`) |
| Notification interne | Une seule notification `notifications` **dans la même transaction**, destinataire = **vendeur de la boutique uniquement**, `type = 'product.contact'` (**valeur existante, aucun type ajouté**) |
| Contenu de la notification | `title` = `Nouveau message depuis la boutique « <slug> » — De : <displayName>` ; `message` = `De : <displayName>< — <email>>\n\n<message>` |
| Canal privé | **Jamais** — aucun `tel:`, `mailto:`, `whatsapp:`, aucun bouton d'appel/lien WhatsApp rendu par V7 ; aucun numéro ni email du vendeur exposé dans la boutique, la réponse, la notification ou les logs |
| Portée | **Boutique-scopé uniquement** — rien n'est ajouté ni modifié sur la fiche produit `/catalogue/:slug` (verrou CA-V5-101 / CA-V7-047) |
| Anti-spam | Rate limit dédié **`storefront-contact` : 10 messages / IP / 10 min** ; dépassement → `429 RATE_LIMITED` + `Retry-After` (§2, §7.6) |
| Anti-abus | Auto-contact refusé → `400 CONTACT_SELF` ; boutique indisponible → `404 NOT_FOUND` identique (§5.1) ; message rendu comme texte (jamais `dangerouslySetInnerHTML`) |
| Interdit ailleurs | La route historique `POST /api/products/:id/contact` (v2.6 §3.2 quater) **n'est ni modifiée ni réactivée** |

### 8.2 Activation admin — exigences contractuelles (route 8)

| Exigence | Contrat |
|---|---|
| Qui peut activer | **`admin` uniquement** (`requireAdmin`) — un `user` reçoit `403 FORBIDDEN` ; aucun autre rôle n'existe (CA-V7-002/013/052) |
| Action | **Manuelle uniquement** : aucune tâche planifiée, webhook, cron, paiement ou automatisme ne peut passer `PENDING → ACTIVE` (CA-V7-014) |
| Traçabilité | `activated_by` = `users.id` de l'admin connecté · `activated_at` = `now()` serveur — posés **uniquement** dans cette transaction, jamais ailleurs, jamais depuis un client |
| Payload client | `{}` — **tout `status`/`activated_by`/`activated_at`/`ends_at` envoyé est ignoré** (lecture exclusive de `session.userId`) |
| Effets | `PENDING → ACTIVE` ; `started_at = now()`, `ends_at = now() + 30 jours` (30 j glissants) ; si `supersedes_id` : prédécesseur → `CANCELLED` + réattach de ses listings actifs ; sinon garde contre le double `ACTIVE` (`409 SUBSCRIPTION_ALREADY_ACTIVE`) |
| Visibilité | Immédiate : `GET /api/storefront/:slug` → `200` ; `GET /api/subscriptions/me` reflète le nouveau statut ; la file admin (route 7) perd la ligne `PENDING` |
| Historique | Les enregistrements `ACTIVE`/`CANCELLED`/`EXPIRED` sont **conservés** (jamais supprimés) ; `activated_by`/`activated_at` visibles dans l'historique (CA-V7-051) |

### 8.3 Boutique publique — exigences contractuelles (route 5)

| Exigence | Contrat |
|---|---|
| Source des annonces | **Table `products` uniquement** (jointure `storefront_listings → products`) — aucune copie, aucune dénormalisation, une seule ligne `products` par annonce |
| Contenu affiché | Listings non retirés, `products.status ∈ ('PENDING','AVAILABLE','RESERVED')`, `deleted_at IS NULL` — rien d'autre |
| Coordonnées vendeur | **Aucune** — ni dans le JSON, ni via un header, ni via un lien (`displayName` + `memberSince` uniquement, §6.4) |
| `Cache-Control` | **`private, no-store`** — décision explicite (§10.3) |
| Statut non-ouvert | `404 NOT_FOUND`, payload unique, indistinguable d'un slug inconnu (§5.1) |
| Cohérence catalogue | Même `products.id`, même titre, même prix dans les deux vues (CA-V7-035) |

---

## 9. Anti-confusion — économie V7 vs pipeline de commande (exigence §8 de la mission)

> **À relire par `@backend` avant toute implémentation, par `@tester` en recette, par tout consommateur avant d'afficher un prix.**

1. **La commission vendeur reste 10 %, inchangée.** Elle est calculée depuis `COMMISSION_RATE` (source de vérité, CA-V5-150) dans le pipeline de commande **existant, non modifié**. La V7 n'introduit **aucun** taux, aucun palier, aucun pourcentage.
2. **Aucun tarif d'abonnement n'entre dans le pipeline de commande.** Ni total de commande, ni commission, ni payout, ni frais, ni `storefront_listings`, ni `seller_subscriptions` n'apparaît dans le calcul d'une vente. **Zéro écriture V7 dans `orders`/`payments`/`payouts`/`order_events`.**
3. **L'abonnement n'est pas un paiement.** Aucune route V7 ne débite, n'encaisse ni ne référence de moyen de paiement. Les prix des paliers (`priceFcfa` : 2 000 / 5 000 / 10 000) sont des **étiquettes d'offre** stockées en base — affichées dans `/mon-abonnement`, jamais injectées dans une commande.
4. **Le quota n'est pas une limite de vente.** Atteindre 10/10 annonces de boutique ne bloque rien : `POST /api/products` continue de répondre `201`, la fiche reste vendable, le checkout et le paiement aboutissent selon le parcours existant, la commission reste 10 % (CA-V7-033).
5. **Aucune ligne de code V7 dans les handlers de commande/paiement/checkout** (CA-V7-038) :
   ```
   grep -rnE 'storefront_listings|subscription_id|STOREFRONT_QUOTA|withdrawn_at' \
     server/src --include='*order*' --include='*payment*' --include='*checkout*'
   → 0 occurrence
   ```
6. **Aucune écriture de statut par la liaison.** `storefront_listings` **n'a pas de colonne `status`** ; le statut affiché est dérivé de `products.status`. Une vente `SOLD` libère une place **en lecture** (CA-V7-037) — le pipeline existant n'a pas connaissance de V7.
7. **Parrainage indépendant.** Ambassadeur « Le Cercle des 10 » et Vitrine (`vitrine_until`) ne sont ni lus ni écrits par V7 ; la commission reste 10 % pour un Ambassadeur abonné (CA-V7-054) ; une souscription ne génère aucun filleul (`referred_by` intouché).
8. **Si un écran affiche un prix** : le prix produit vient de `products.price` ; le prix d'un forfait vient de `subscription_plans.price_fcfa` ; **aucun des deux n'apparaît jamais dans l'autre contexte**.

---

## 10. Pagination, filtrage, Cache-Control, limites

### 10.1 Pagination

Enveloppe `{ items, page, perPage, total, totalPages }` (§1.5 v2.6) — `page` ≥ 1 défaut 1, `per_page` 1..48 défaut 12, `per_page` hors bornes → `400 VALIDATION_ERROR`. Routes paginées V7 : `GET /api/storefront/:slug` (items de la boutique) et `GET /api/admin/subscriptions` (file/historique). Les autres routes renvoient des objets simples. Filtre `status` de la route 7 : `PENDING|ACTIVE|EXPIRED|CANCELLED`, défaut `PENDING`, insensible à rien (valeur exacte).

### 10.2 Filtrage

V7 n'ajoute **aucun** paramètre de filtrage sur le catalogue (il n'est pas touché). Filtres V7 : `status` (route 7), `per_page`/`page` (routes 5 et 7). Aucun filtre `q` en V7.

### 10.3 `Cache-Control` (décision V7 explicite)

| Route | En-tête | Justification |
|---|---|---|
| `GET /api/storefront/:slug` (publique) | **`private, no-store`** | Écart assumé vs le cache public v2.6 (`/api/categories`, `/api/banners`) : la réponse porte un slug personnalisé et une réponse `404` de non-divulgation ne doit **jamais** être servie depuis un cache partagé ; cohérent avec le défaut v2.6 (`private, no-store` ailleurs) |
| `GET /api/subscriptions/me`, `GET /api/admin/subscriptions` | `private, no-store` | Liées à une session — jamais en cache partagé (règle v2.6 inchangée) |
| Mutations (`POST`/`DELETE`) | `private, no-store` | Défaut v2.6 |
| `404` de boutique | `private, no-store` | Idem — pas de mémorisation d'un « n'existe pas » |

Aucun autre en-tête de cache n'est introduit ; l'en-tête ne modifie aucune forme de réponse (P5 v2.6).

### 10.4 Rate limiting

| Scope | Limite | Portée | Dépassement |
|---|---|---|---|
| Global `/api/*` | 300 req / IP / 1 min | toutes les routes V7 | `429 RATE_LIMITED` (existant) |
| Admin `/api/admin/*` | 60 req / IP / 1 min | routes 7 et 8 | `429 RATE_LIMITED` (existant, `skipAdmin`) |
| **`storefront-contact`** (nouveau) | **10 req / IP / 10 min** | **route 6 uniquement** | `429 RATE_LIMITED` + `Retry-After` (existant, nouveau scope) |

Clé `rl:storefront-contact:<ip>`. En `NODE_ENV=test`, bypassé (comportement v2.6 conservé). ≥ 2 instances ⇒ compteur partagé requis **avant** prod (dette v2.6 PO-V5-17, non résolue par V7).

---

## 11. Codes d'erreur V7 — récapitulatif et payloads d'exemple

### 11.1 Codes **nouveaux** (n'existent pas en v2.6)

| Code | HTTP | Route(s) | Sens |
|---|---|---|---|
| `SLUG_RESERVED` | `400` | 1 | Slug ∈ 20 mots réservés (§5.4) |
| `INVALID_SUPERSEDES` | `400` | 1 | `supersedesId` pointant vers **son propre** abonnement de statut ≠ `ACTIVE` (`PENDING`, `EXPIRED`, `CANCELLED`, déjà remplacé) — arbitrage définitif 17/11/2026 |
| `SUBSCRIPTION_REQUIRED` | `403` | 3 | Pas d'abonnement `ACTIVE` non expiré (souscription `PENDING`, expirée, annulée, ou jamais souscrite) |
| `SUBSCRIPTION_ALREADY_ACTIVE` | `409` | 8 | Un `ACTIVE` existe déjà pour ce vendeur et la demande n'est pas un changement de forfait déclaré (`supersedesId` absent) ; inclut le mapping 23505 de `uq_one_active_subscription_per_seller` |
| `STOREFRONT_QUOTA_EXCEEDED` | `409` | 3 | Quota du forfait atteint (`used >= quota`) — message explicite avec `used`/`quota` |
| `STOREFRONT_ALREADY_LISTED` | `409` | 3 | Produit déjà actif dans la boutique (unicité partielle `uq_storefront_active_product`, 23505) |
| `NOT_PRODUCT_OWNER` | `403` | 3 | Produit d'un autre vendeur — **exception assumée au §1.4 v2.6** (§5.2) |
| `PLAN_NOT_FOUND` | `404` | 1 | `planId` inexistant ou plan inactif |
| `INVALID_STATUS` | `409` | 8 | Cible d'activation pas `PENDING` |

### 11.2 Codes **existants réutilisés** (sémantique inchangée)

| Code | HTTP | Route(s) | Note |
|---|---|---|---|
| `UNAUTHENTICATED` | `401` | 1,2,3,4,6,7,8 | v2.6 §1.1 |
| `FORBIDDEN` | `403` | 7,8 | v2.6 §1.3 — non-admin sur route admin |
| `VALIDATION_ERROR` | `400` | 1,3,4,5,6,7,8 | v2.6 §1.1, avec `details[]` |
| `NOT_FOUND` | `404` | 1,4,5,6,8 | v2.6 §1.4 — boutique : payload unique (§5.1) |
| `SLUG_TAKEN` | `409` | 1 | Réutilisé (déjà utilisé pour `products.slug`) — sémantique identique : unicité |
| `PRODUCT_NOT_FOUND` | `404` | 3 | Réutilisé (v2.6) — produits inexistants/supprimés |
| `CONTACT_SELF` | `400` | 6 | Réutilisé (v2.6 §3.2 quater, contact produit) — même sens : auto-contact refusé |
| `RATE_LIMITED` | `429` | 6 (et global/admin) | v2.6 §8 |
| `INTERNAL_ERROR` | `500` | toutes | v2.6 §1.1 — aucune fuite |

### 11.3 Mapping contraintes PostgreSQL → codes (à ajouter dans `middleware/errors.ts`, sans toucher l'existant)

| Contrainte / index (nouveau, migration `019_storefront.sql`) | Code |
|---|---|
| `uq_active_subscription_slug` (partiel, `slug WHERE status='ACTIVE'`) | `SLUG_TAKEN` |
| `uq_one_active_subscription_per_seller` (partiel, `seller_id WHERE status='ACTIVE'`) | `SUBSCRIPTION_ALREADY_ACTIVE` |
| `uq_storefront_active_product` (partiel, `product_id WHERE withdrawn_at IS NULL`) | `STOREFRONT_ALREADY_LISTED` |
| `chk_subscription_slug_format` (échec format, filet DB) | `VALIDATION_ERROR` |
| `chk_activation_pair` / `chk_active_window` / `chk_supersedes_not_self` | `VALIDATION_ERROR` (logs détaillés, message générique) |

### 11.4 Payloads d'exemple — un JSON par code (tous les 4xx/5xx V7)

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "Vous devez être connecté" } }
{ "error": { "code": "FORBIDDEN", "message": "Accès réservé aux administrateurs" } }
{ "error": { "code": "VALIDATION_ERROR", "message": "Données invalides", "details": [ { "field": "message", "message": "Le message doit contenir entre 10 et 2000 caractères" } ] } }
{ "error": { "code": "NOT_FOUND", "message": "Boutique introuvable" } }
{ "error": { "code": "PLAN_NOT_FOUND", "message": "Forfait introuvable" } }
{ "error": { "code": "PRODUCT_NOT_FOUND", "message": "Article introuvable" } }
{ "error": { "code": "SLUG_TAKEN", "message": "Cette adresse de boutique est déjà prise" } }
{ "error": { "code": "SLUG_RESERVED", "message": "Ce nom est réservé, choisissez-en un autre" } }
{ "error": { "code": "INVALID_SUPERSEDES", "message": "Votre abonnement n'est pas actif : seul un abonnement actif peut être remplacé" } }
{ "error": { "code": "SUBSCRIPTION_REQUIRED", "message": "Un abonnement actif est nécessaire pour gérer votre boutique" } }
{ "error": { "code": "SUBSCRIPTION_ALREADY_ACTIVE", "message": "Ce vendeur a déjà un abonnement actif" } }
{ "error": { "code": "STOREFRONT_QUOTA_EXCEEDED", "message": "Quota de votre forfait atteint (10/10). Retirez une annonce de votre boutique ou changez de forfait." } }
{ "error": { "code": "STOREFRONT_ALREADY_LISTED", "message": "Cette annonce est déjà dans votre boutique" } }
{ "error": { "code": "NOT_PRODUCT_OWNER", "message": "Ce produit ne vous appartient pas" } }
{ "error": { "code": "CONTACT_SELF", "message": "Vous ne pouvez pas contacter votre propre boutique" } }
{ "error": { "code": "INVALID_STATUS", "message": "Cette demande n'est pas en attente d'activation" } }
{ "error": { "code": "RATE_LIMITED", "message": "Trop de requêtes, réessayez dans 10 minute(s)" } }
{ "error": { "code": "INTERNAL_ERROR", "message": "Erreur interne du serveur" } }
```

> **`STOREFRONT_QUOTA_EXCEEDED`** : la paire `(used)/(quota)` du message reflète le forfait réel au moment du refus (`10/10`, `30/30`, `100/100`). **`INVALID_STATUS`** ne porte **pas** de `currentStatus` (contrairement aux transitions de commandes V3) — les clients V7 branchent sur `code`, pas sur un statut.

### 11.5 Codes explicitement **interdits** en V7 (garde-fous de recette)

`PRODUCT_CONTACT_NOT_ALLOWED` (réservé v2.6, SOLD) · `INVALID_TRANSITION` / `ORDER_NOT_ALLOWED` / `PAYOUT_NOT_PENDING` / `ROUTE_DEPRECATED` (réservés commandes V3/V4) · `INVALID_STATUS` hors route 8 · toute valeur de `subscription_status` en minuscules · tout code d'erreur **prélevé sur le pipeline de commande** (§9). Un test de recette (`@tester`) peut les asserter absents des réponses V7.

---

## 12. Sécurité — récapitulatif V7 (en complément de §4.1 et §5)

| Axe | Mesure contractuelle | Critères / références |
|---|---|---|
| **Ownership** | `productId` vérifié `owner_id = session.userId` (route 3) ; listing vérifié via jointure `subscription.seller_id` (route 4) ; abonnement toujours résolu depuis `session.userId`, jamais depuis un paramètre | CA-V7-030/034 |
| **RBAC** | `requireAuth` (vendeur) / `requireAdmin` (admin) réutilisés ; aucun `role` nouveau, aucune écriture `users.role`, aucune élévation | CA-V7-002/013/050/052 |
| **Slug** | Normalisation NFD + regex stricte + longueur 3–40 + 20 mots réservés **côté serveur (autorité)** ; échappement React ; requêtes paramétrées uniquement | CA-V7-020/021/022 |
| **Non-divulgation** | `404 NOT_FOUND` unique (§5.1) ; exception unique et documentée `403 NOT_PRODUCT_OWNER` (§5.2) ; aucun `currentStatus`/`hint` dans les 404 | CA-V7-024/030 |
| **Coordonnées privées** | Sérialiseur public V7 = `displayName` + `memberSince` ; 0 occurrence de `phone`/`whatsapp`/`email`/`tel:`/`mailto:` dans la boutique ; email du **demandeur** transmis uniquement au vendeur (route 6) | CA-V7-026/045/046/047, D2 |
| **Injection / XSS** | zod sur toutes les entrées ; React échappe le contenu ; `message` rendu comme texte (jamais `dangerouslySetInnerHTML`) | CA-V7-045 |
| **Paiement / fraude** | Aucune route de paiement d'abonnement, aucun webhook, aucun champ bancaire ; `status='ACTIVE'` client ignoré (CA-V7-014) | CA-V7-014, §9 |
| **CSRF / cookie** | Double soumission existante sur POST/DELETE ; cookie `httpOnly`, `SameSite=Lax`, `Secure` en prod, same-origin | §2 |
| **Rate limiting** | Global 300/min · admin 60/min · **`storefront-contact` 10/10 min** (nouveau scope) | §10.4 |
| **Concurrence quota** | `SELECT … FOR UPDATE` sur l'abonnement + `COUNT` + `INSERT` en une transaction ; dépassement → `409 STOREFRONT_QUOTA_EXCEEDED` | CA-V7-031/032, R-V7-A5 |
| **Parrainage / Vitrine** | Aucun accès à `referred_by`, `ambassador_until`, `vitrine_until`, `referral_qualifications` | CA-V7-054 |
| **Commission** | Aucun tarif d'abonnement dans le calcul de commande ; `COMMISSION_RATE` inchangée (§9) | CA-V7-006, CA-V5-150 |

---

## 13. Contrat « 2.7 — V7 Hébergement vendeurs » — versionnage et checklist d'intégration (`@backend`)

**Version du contrat** : **2.7 — V7 Hébergement vendeurs (2026-11-17)**. v2.7 = v2.6 + les seuls ajouts listés ci-dessous. **v2.6 reste applicable tel quel** — aucune section v2.6 n'est amendée, réécrite ou supprimée.

### 13.1 Checklist de fusion dans `docs/api.md` (livrable `@backend`, CA-V7-063)

**Ajouter (création de sections, dans l'ordre du document) :**

- [ ] Onglet de version → **2.7** (encart « Évolution V7 — Hébergement vendeurs ») : mention additive, 8 routes, renvoi au présent contrat ; v2.4/v2.5/v2.6 restent applicables.
- [ ] §1.4 : **ajouter la ligne d'exception** — `POST /api/storefront/listings` : produit d'autrui → `403 NOT_PRODUCT_OWNER` (écart assumé au §1.4, arbitrage chef de projet 17/11/2026). **Ne pas modifier** les lignes existantes du tableau.
- [ ] §1.2 : **ajouter** les lignes `409 STOREFRONT_QUOTA_EXCEEDED` / `SUBSCRIPTION_ALREADY_ACTIVE` / `STOREFRONT_ALREADY_LISTED` / `INVALID_STATUS` ? Non — §1.2 reste **inchangé** (codes 409 déjà couverts). Vérifier seulement.
- [ ] §2 : ajouter les modèles §6.1–6.6 du présent contrat (numérotation libre, ex. `§2.11 SubscriptionPlan`, `§2.12 Subscription`, `§2.13 ListingView`, `§2.14 StorefrontPublic`, `§2.15 SubscriptionAdminItem`).
- [ ] §2.6 (enums) : ajouter `subscription_status` (`PENDING|ACTIVE|EXPIRED|CANCELLED`) ; **ne pas toucher** aux enums existants ; `notification_type` inchangé (`product.contact` réutilisé).
- [ ] §3 : ajouter `§3.9 V7 — Hébergement vendeurs` avec les 8 routes (corps, réponses, erreurs), en **référençant** le présent contrat comme source détaillée ou en l'inline-isant (au choix de `@backend`, contenu identique).
- [ ] §4 (matrice de validation) : ajouter les bornes V7 — `slug` 3–40 regex, `message` 10–2000, `email` ≤ 254, `per_page` 1..48, `planId`/`productId`/`supersedesId`/`:id` entiers ≥ 1, `status` (route 7) enum, `durationDays = 30` en lecture.
- [ ] §5 (notifications) : ajouter **N15** — `POST /api/storefront/:slug/contact` (**V7**) → `product.contact` (type existant réutilisé), destinataire **vendeur de la boutique**, titre boutique + expéditeur. Marquer explicitement « aucun nouveau type `notification_type` ».
- [ ] §6 (carte récapitulative) : ajouter les 8 lignes (méthode, chemin, rôle, corps, `2xx`) + noter l'ordre de déclaration `/listings` avant `/:slug`.
- [ ] §8 (notes d'implémentation) : ajouter — migration `019_storefront.sql` appliquée **avant** le code en prod (`RUN_MIGRATIONS=false`), feature flag `FEATURE_STOREFRONT`, matérialisation paresseuse de l'expiration (sans cron), `SELECT … FOR UPDATE` pour le quota, mapping 23505 → codes (§11.3), rate limit `storefront-contact` 10/10 min, `Cache-Control: private, no-store` partout en V7.

**Ne JAMAIS modifier :**

- [ ] Les routes, schémas, codes d'erreur, libellés et comportements v2.6 (et antérieurs) — diff attendu = **ajouts uniquement**.
- [ ] Le pipeline de commande/paiement/payout, les handlers `products`, `orders`, catalogue, fiche produit, notifications existantes.
- [ ] `docs/cahier-des-charges*.md`, `docs/architecture*.md` — hors fusion (voir §15).
- [ ] Les enums existants, `notification_type`, `products`, `users`, `orders` — 0 colonne, 0 valeur.

**Preuves à produire par `@backend` avec la fusion :**

- [ ] `cd server && npx tsc --noEmit` → 0 erreur ; `cd web && npx tsc -b` → 0 erreur.
- [ ] Suite de tests existante rejouée, **0 échec, 0 amendement** (CA-V7-005) ; nouveaux tests V7 verts (CA-V7-012/013/015/020/022/024/030/031/045/048…).
- [ ] `grep -rnE 'storefront_listings|subscription_id|STOREFRONT_QUOTA|withdrawn_at' server/src --include='*order*' --include='*payment*' --include='*checkout*'` → **0 occurrence** (CA-V7-037b/038).
- [ ] `grep -rn 'CREATE TRIGGER' migrations/019_storefront.sql` → vide (CA-V7-037c, 0 trigger sur `products`).
- [ ] `git diff` des fichiers du pipeline de commande/paiement/checkout = **0 ligne**.
- [ ] `grep -rn "STOREFRONT_QUOTA\|quota" server/src/routes/products.routes.ts server/src/services/products.service.ts` → **0 occurrence** (CA-V7-038).
- [ ] Parrainage/Vitrine : `referred_by`, `ambassador_until`, `vitrine_until`, `referral_qualifications` — 0 occurrence ajoutée dans le diff V7 (CA-V7-054).
- [ ] CA-V7-063 : les codes `SLUG_TAKEN`, `SLUG_RESERVED`, `SUBSCRIPTION_REQUIRED`, `SUBSCRIPTION_ALREADY_ACTIVE`, `STOREFRONT_QUOTA_EXCEEDED`, `CONTACT_SELF` (et les nouveaux du §11) présents dans le `api.md` fusionné v2.7 avec leurs statuts et payloads.
- [ ] Réponse `404` de boutique identique quel que soit le motif (test : slug inconnu vs `PENDING` vs `EXPIRED` → corps et statut strictement égaux, CA-V7-024).
- [ ] Regex `phone|whatsapp|email|tel:|mailto:` sur la réponse `GET /api/storefront/:slug` → 0 occurrence (CA-V7-026).

### 13.2 Cohérence avec le déploiement (rappel, architecture §7 — non contractuel ici)

Ordre impératif : **sauvegarde PostgreSQL → migration `019_storefront.sql` appliquée manuellement → vérification (3 tables, 3 forfaits, enum `subscription_status`, `information_schema` identique pour l'existant) → déploiement du code → health check**. Si le code est déployé avant la migration, les routes V7 répondent `500` (sans toucher à l'existant) — d'où le feature flag. **Ce document ne déclenche ni n'autorise aucun déploiement.**

### 13.3 Décisions arrêtées dans ce contrat (traçabilité)

| # | Décision | Justification |
|---|---|---|
| C-V7-1 | `Cache-Control: private, no-store` sur **toutes** les réponses V7, boutique publique incluse | **Assumé, réaffirmé le 17/11/2026** : non-divulgation des 404 + slug personnalisé ; défaut v2.6 conservé ; aucun cache public ajouté (§10.3) |
| C-V7-2 | `:id` non entier → `400 VALIDATION_ERROR` (routes 4 et 8) | v2.6 ne tranche pas ; cohérent avec §1.5 (paramètres invalides → 400) |
| C-V7-3 | `INVALID_STATUS` sans `currentStatus` | Le `currentStatus` est réservé aux transitions de commandes V3/V4 ; V7 branche sur `code` |
| C-V7-4 | Route 1/6 en `requireAuth` (admin admis) | Cohérent avec `referrals.routes.ts` (l'admin a un profil) ; aucun RBAC modifié |
| C-V7-5 | Frontière `404 NOT_FOUND` (supersedesId d'autrui / inexistant / d'autrui non supersédable) vs `400 INVALID_SUPERSEDES` (propre abonnement, statut ≠ `ACTIVE`) vs changement valide (propre `ACTIVE`) | **CLOSE — arbitrage définitif du chef de projet, 17/11/2026** : `404` si d'autrui/inexistant/d'autrui non supersédable (aucune confirmation d'existence) ; `400 INVALID_SUPERSEDES` si son propre abonnement non-`ACTIVE` ; propre `ACTIVE` ⇒ changement valide (ancien `CANCELLED` à l'activation). `@backend` implémente cette règle telle quelle — plus de validation de revue requise |
| C-V7-6 | `SUBSCRIPTION_ALREADY_ACTIVE` n'est **jamais** renvoyé par la route 1 | CA-V7-011/015 : le 409 est à l'activation, pas à la souscription |
| C-V7-7 | Réponse `GET /api/subscriptions/me` = `200` même sans abonnement (`subscription: null`) | L'espace privé doit toujours exister pour afficher l'écran de choix (US-V7-01) |

---

## 14. Points ouverts et héritages (à ne pas trancher silencieusement)

| # | Sujet | Statut | Commentaire |
|---|---|---|---|
| PO-V7-04 | Changement de forfait : nouvel abonnement `PENDING` (proposition cahier) vs modification courante | 🔓 Ouvert — tranché côté contrat par l'arbitrage chef de projet 17/11/2026 | Ce contrat documente `supersedesId` (intention déclarée) : `PENDING` lié, prédécesseur `ACTIVE` jusqu'à l'activation, puis `CANCELLED` + réattach. `@backend` valide en revue |
| PO-V7-06 | Liste des 20 mots réservés définitive ? (marques, catégories ?) | 🔓 Ouvert | Liste figée côté code (§5.4) ; ajout = 1 ligne + test, sans migration ; le contrat n'a pas à la figer définitivement |
| PO-V7-07 | Sénégal (V7) vs Côte d'Ivoire (V1–V5) | 🔓 Ouvert | Aucun impact fonctionnel ; ce contrat n'amende aucun doc antérieur |
| PO-V7-08 | SLA d'activation admin (ex. < 24 h ouvrées) + notification admin à la souscription | 🔓 Ouvert | Hors contrat API ; la route 7 expose `createdAt` pour mesurer le délai ; la notification admin à la souscription est à confirmer (R-V7-03 / R-V7-A10) |
| PO-V7-09 | Nom définitif de la route d'ajout | ✅ Tranché par l'architecture (`POST /api/storefront/listings`) | Ce contrat reprend ce chemin exact ; à confirmer côté backend en revue |
| — | Ambiguïté architecture §4.2(1) (`404` vs `400` sur `supersedesId`) | **✅ CLOSE — arbitrage définitif du chef de projet, 17/11/2026** | Règle intégrée : d'autrui / inexistant / d'autrui non supersédable → `404 NOT_FOUND` (aucune confirmation d'existence) ; propre non-`ACTIVE` → `400 INVALID_SUPERSEDES` ; propre `ACTIVE` → changement valide (ancien `CANCELLED` à l'activation, nouveau `ACTIVE`). Intégrée en §4, §5.2/§5.3, §7.1, §7.2, §11.1, §11.4, §13.3 |
| — | Cache public v2.6 non étendu à V7 | Accepté | C-V7-1 |

**Risques à surveiller par `@backend`/`@tester`** : R-V7-A2 (fuite du 403 `NOT_PRODUCT_OWNER` ailleurs que la route 3) · R-V7-A5 (concurrence quota — verrou `FOR UPDATE` obligatoire) · R-V7-A6 (ré-souscription d'un `EXPIRED` non matérialisé → 23505 mappé `SUBSCRIPTION_ALREADY_ACTIVE`) · R-V7-A7/A8 (ordre migration→code ; zéro fuite du quota dans `POST /api/products`) · R-V7-A10 (file `PENDING` qui s'accumule — PO-V7-08).

---

## 15. Ce que ce document ne prouve pas

Ce contrat est une **spécification**, pas une implémentation. Il ne prouve ni n'autorise :

- ❌ Aucun test n'est exécuté à ce stade ; les 45 critères `CA-V7-xxx` restent **à recette** par `@tester` après livraison.
- ❌ La conformité de `docs/api.md` v2.7 (fusion) — livrable de `@backend` (checklist §13.1).
- ❌ La migration `019_storefront.sql`, le DDL, les seeds — livrables de `@backend` (architecture §2).
- ❌ Le déploiement, le feature flag, la recette de production — livrables de `@deploy-ops` / `@tester`.
- ❌ Toute modification de l'UI web (`/boutique/:slug`, `/mon-abonnement`, `/admin/abonnements`) — livrable de `@frontend`. Ce contrat fixe les JSON, pas les écrans.
- ❌ `docs/api.md` v2.6 n'a **pas** été modifié par ce document (et ne doit pas l'être en dehors de la fusion v2.7).

---

## 16. Définition de Done — verdict binaire (portée : **ce document**)

| # | Exigence de la mission | État | Preuve |
|---|---|---|---|
| 1 | Un seul fichier créé, aucun autre modifié | ✅ | `revends/docs/api-v7-hebergement-vendeurs.md` ; `git status --porcelain` → 1 seul chemin (`?? docs/api-v7-hebergement-vendeurs.md`), 0 autre fichier touché |
| 2 | Avertissement « additif only » explicite | ✅ | Encart liminaire (7 points, dont zéro écriture pipeline de commande) |
| 3 | Carte des 8 routes : méthode, chemin exact, rôle, corps, statuts | ✅ | §4 (8 routes, chemins identiques à l'architecture §4.1) + §4.1 (auth) |
| 4 | Pour chaque route : JSON d'exemple, champs/types, codes d'erreur simulés (succès + chaque 4xx + 500) | ✅ | §7.1→§7.8 — requêtes/réponses JSON, tableaux de bornes, ≥ 1 scénario par code, payload par scénario |
| 5 | Tous les codes d'erreur demandés présents et typés UPPER_SNAKE_CASE | ✅ | §11 — SLUG_TAKEN, SLUG_RESERVED, VALIDATION_ERROR, SUBSCRIPTION_REQUIRED, SUBSCRIPTION_ALREADY_ACTIVE, INVALID_SUPERSEDES, STOREFRONT_QUOTA_EXCEEDED, NOT_PRODUCT_OWNER, PRODUCT_NOT_FOUND, CONTACT_SELF, UNAUTHENTICATED, FORBIDDEN (+ SLUG_TAKEN réutilisé, PLAN_NOT_FOUND, INVALID_STATUS, NOT_FOUND, STOREFRONT_ALREADY_LISTED, RATE_LIMITED, INTERNAL_ERROR) |
| 6 | Non-divulgation : 404 unique ; exception `403 NOT_PRODUCT_OWNER` documentée comme écart assumé au §1.4 | ✅ | §5.1 (payload identique, 5 motifs), §5.2 (exception limitée à la route 3, arbitrage chef de projet), §5.3 (table) |
| 7 | Boutique publique : structure des annonces (source `products`), aucun numéro/e-mail vendeur, `Cache-Control: private, no-store` | ✅ | §6.4, §8.3, §10.3 |
| 8 | Contact boutique : champs 10–2000, notification `product.contact` interne, jamais de canal privé, rate limit 10/10 min | ✅ | §7.6, §8.1, §10.4 |
| 9 | Activation admin : qui, `activated_by`/`activated_at`, jamais de `status` client | ✅ | §7.8, §8.2 |
| 10 | Anti-confusion : commission 10 % inchangée, aucun tarif d'abonnement dans le pipeline de commande | ✅ | §9 (8 points, dont la commande `grep` de non-écriture) |
| 11 | Contrat versionné « 2.7 — V7 Hébergement vendeurs » + checklist d'intégration | ✅ | En-tête + §13 (versionnage, checklist de fusion `docs/api.md`, preuves attendues) |
| 12 | Définition de Done avec verdict binaire | ✅ | §16 (ce tableau + verdict) |
| 13 | Cohérent avec `docs/architecture-v7-hebergement-vendeurs.md` (chemins, codes, ordre de déclaration, rate limit, notification réutilisée) et avec le cahier (45 critères) | ✅ | Références croisées §3, §4, §5.4, §6, §7, §11.3 |
| 14 | Aucun code, aucun déploiement, aucune modification de `docs/api.md` ni d'aucun autre fichier | ✅ | Mission en lecture seule + écriture unique de ce fichier |

### Auto-revue (skill `auto-revue`)

> Auto-revue : 2 incohérences détectées et tranchées dans ce document — (a) l'ambiguïté de l'architecture §4.2(1) sur `supersedesId` (`404` vs `400`) → **close par arbitrage définitif du chef de projet le 17/11/2026** (C-V7-5, §7.1) ; (b) le `Cache-Control` public de v2.6 non applicable à V7 → `private, no-store` partout, décision tracée et **assumée, réaffirmée le 17/11/2026** (C-V7-1, §10.3) ; (c) `INVALID_STATUS` volontairement sans `currentStatus` (C-V7-3). Références croisées internes vérifiées (§10.3, §5.2). Aucun endpoint ajouté au-delà des 8 de l'architecture.

### VERDICT

**DONE — contrat V7 complet, additif et actionnable.** Verdict binaire sur le **document** : **✅ DONE**.

**Réserves explicites (portée)** : (1) ce verdict porte sur le contrat, **pas** sur l'implémentation V7 — la recette des 45 critères (`CA-V7-xxx`) reste due par `@tester` ; (2) la fusion dans `docs/api.md` en **v2.7** est due par `@backend` avec la checklist §13.1 ; (3) `docs/api.md` v2.6 reste la source de vérité en vigueur **jusqu'à cette fusion** ; (4) 3 points restent ouverts côté produit (PO-V7-04, PO-V7-06, PO-V7-08) sans impact sur la validité du contrat ; (5) C-V7-5 est **CLOSE** (arbitrage définitif du chef de projet, 17/11/2026) ; **C-V7-1 (`private, no-store`) est assumé** et réaffirmé le 17/11/2026 ; seules la fusion v2.7 (@backend) et la recette (@tester) restent dues.
