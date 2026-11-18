# ARCHITECTURE TECHNIQUE V8 — « Hébergement Boutique »

| | |
|---|---|
| **Version** | 1.1 — **18/11/2026** (v1.1 : arbitrages chef de projet du 18/11/2026 intégrés — §14.A/B/C/D/F/G clos) |
| **Auteur** | Agent `@architecte` (Inkling 2 Small Free), pour l'équipe projet ReVends |
| **Branche / base** | `feat/v8-hebergement-boutique`, base `fix/v6-on-799a7ab` (V7 en prod, migrations `001`→`019_storefront.sql` appliquées, HEAD `d81178e`) |
| **Statut** | **Architecture VALIDÉE — arbitrages du 18/11/2026 (§14.A/B/C/D/F/G) intégrés ; passage `@backend` autorisé ; re-synchronisation du cahier par `@cahier-des-charges` (§14.B)** |
| **Source de vérité fonctionnelle** | `docs/cahier-des-charges-v8-hebergement-boutique.md` (validé chef de projet 18/11/2026 — 75 critères `CA-V8-xxx`) — **amendée en 3 points par les décisions PO-V8 18/11/2026 consignées ici (§2.3, §13.2)** |
| **Architectures à respecter (modifiées additivement)** | `docs/architecture-v7-hebergement-vendeurs.md` (V7, 17/11) · `docs/architecture.md` · `docs/architecture-v5.md` |
| **Contrats** | `docs/api.md` **v2.7** → **v2.8** (livrable `@backend`, §13.5) · `docs/api-v7-hebergement-vendeurs.md` |
| **Nature** | **Document additif** : il s'ajoute aux architectures V1→V7 sans les amender. **Aucune ligne de code, aucun test, aucun déploiement, aucune migration réalisés dans cette mission.** |
| **Périmètre cible** | Web (React + Vite, `revends/web`) + API (Node + Express 5 + TypeScript + PostgreSQL via `pg`, `revends/server`). **Aucune cible mobile native.** |

> **Règle d'or de cette architecture** : *tout est ajouté, rien n'est modifié dans l'existant — à l'unique exception consignée (auto-approbation en création pour les éligibles, décision V8-D2, seule dérogation acceptée au verrou CA-V5-150, comme au cahier §8).* Zéro objet existant modifié, y compris les types/enums : `notification_type` reste inchangé (réutilisation de `product.contact` et `article_rejected`).

> **Vérifications réalisées pour ce document (18/11/2026)** — preuves exécutées sur le dépôt :
> - `grep -rnE 'storefront|subscription|payment_reference|auto_approv' server/src --include='*order*' --include='*payment*' --include='*checkout*' --include='*payout*' --include='*cart*'` → **aucune occurrence (exit 1)** : socle V8 propre avant implémentation (CA-V8-082/083).
> - `grep -n "disabled" web/src --include=*.tsx | grep -i vendre` → 2 occurrences non liées (`subcategories.length === 0`, `canSubmit`) : bouton « Vendre » jamais conditionné au statut/abonnement à ce jour (CA-V8-004).
> - `node_modules/pdfkit`, `node_modules/pdf-lib`, `node_modules/jspdf`, `node_modules/@react-pdf` → **absents** ; aucune lib PDF nulle part dans le repo (`grep -rni 'pdfkit|pdf-lib|jspdf|react-pdf|pdfmake' --include='*.json' --include='*.ts' --include='*.tsx' .` hors `node_modules` → 0 occurrence code).
> - `server/package.json` : Express 5.2.1, TypeScript 7.0.2, `pg` 8.23.0, zod 4.6.5, multer 2.4.0 (memoryStorage + magic bytes), `@vercel/blob` 2.8.2, `node-cron` 4.6.0, nodemailer 10.0.12 — **aucune dépendance PDF**. Build serveur `npm run build` = `tsc -p tsconfig.json`.
> - `npm view pdfkit version` → **0.20.2** (dernière, publiée 2026-11-16, dépendances 100 % JS : fflate, fontkit, linebreak, noble-hashes/ciphers, png-js — aucun code natif). `jspdf` 4.2.1 existe aussi (orientation navigateur).
> - Vercel Cron (docs officielles, consulté 18/11/2026) : invocation **HTTP GET** vers le path déclaré dans `vercel.json` → `crons`, authentifiée via header **`Authorization: Bearer $CRON_SECRET`** (variable d'environnement), 404/401 si absente ; `x-cron-secret` **n'est pas envoyé par Vercel** ; les crons ne tournent que sur déploiements **production** ; plan Hobby = précision « quelque part dans l'heure » + quota de jobs (voir §11 — **correction ACTÉE §14.F** : dual-auth + 1 job quotidien `0 6 * * *`).
> - API : `/api` → `cacheControl` `private, no-store` par défaut (`src/middleware/cache.ts`) — réponses portant badge déjà non mises en cache (CA-V8-024).

---

## 1. Vue d'ensemble additive et principes (V8-D1 → V8-D10)

### 1.1 Reformulation du problème

V8 renforce l'offre abonnée V7 **sans toucher au parcours de vente** : (a) publication directe `AVAILABLE` pour les vendeurs éligibles, (b) badges de palier dérivés, (c) priorité au tri par défaut Atelier > Boutique > Découverte, (d) boutique « brandable » (logo/bannière/description, blob existant), (e) référence de paiement à la souscription, (f) bilan mensuel au 1er (e-mail + PDF serveur + page Stats). Tout est **additif** : la seule écriture hors périmètre V8 autorisé est le statut persisté `AVAILABLE` à l'insert pour les éligibles (V8-D2).

### 1.2 Les 10 décisions actées (18/11/2026, non renégociables) → traduction technique

| # | Décision (chef de projet) | Traduction architecturale (section) |
|---|---|---|
| V8-D1 | Bouton « Vendre » gratuit, jamais conditionné | Aucune condition d'abonnement/statut sur `/vendre` ni `POST /api/products` hors statut initial (CA-V8-003/004). 0 ligne modifiée dans le chemin d'entrée (§4, §9) |
| V8-D2 | Publication directe `ACTIVE` + `+221 7XXXXXXXX` (format strict) ; sinon `PENDING` ; admin rétrograde | Éligibilité **dérivée en lecture à l'insert**, même transaction (§4.1) ; trace `auto_approved_products` (R2, §4.3) ; route `retrograde` (§4.4) |
| V8-D3 | Badges « Boutique » / « Boutique Vérifiée » / « Boutique Pro », `ACTIVE` uniquement, révoqués à l'expiration, coexistants avec Ambassadeur | `storeBadge()` calcul en lecture, jamais stocké, JOIN `seller_subscriptions` + `subscription_plans` (§5) |
| V8-D4 | Tri par défaut : Atelier > Boutique > Découverte, **puis Vitrine**, puis `created_at DESC, id` ; tris explicites inchangés | `CASE` composite dans `queryCatalogPage`, **uniquement** si `section === undefined && sort === 'recent'` (§6) |
| V8-D5 | Boutique brandable : logo + bannière (Blob) + description + adresse de collecte **privée** | Table `storefront_profiles` ; réutilisation `savePhoto`/`put()` + préfixe `uploads/storefront/` ; adresse visible admin uniquement (§7, §10) |
| V8-D6 | Expiration : veille, badges/boosts off, **catalogue jamais masqué** | Aucune lecture masquante ; boosts/badges dérivés → disparaissent seuls ; catalogue inchangé (§6, §4.6 cahier) |
| V8-D7 | Bilan au 1er : e-mail + **PDF serveur** + page Stats `/mon-abonnement` (vues, ventes, CA, meilleur article, panier moyen, conversion) | `storefront-reports.service.ts` partagé (1 seul calcul) ; `monthly_metrics` (§8, §9, §12) ; job Vercel Cron (§11) |
| V8-D8 | Activation admin après Wave/OM/virement ; souscription porte une **référence** | ALTER `seller_subscriptions` : `payment_reference varchar(64)`, `payment_method varchar(32)` ; validation stricte zod (§2.4, §13.1 E1) |
| V8-D9 | Verrous CA-V7-003/004/037c/038 restent verts ; quota boutique-only | §9 (non-contradiction), §13.4 (mapping CA), greps dédiés (§1.3, §12.3) |
| V8-D10 | Date 18/11/2026 — validé chef de projet — base de développement V8 | En-tête ; §13.3 (Done) |

### 1.3 Principes directeurs (non négociables) — extension des P1–P10 de V7

| # | Principe | Conséquence technique directe |
|---|---|---|
| P1 | **Additivité stricte du schéma** | **3 nouvelles tables** : `storefront_profiles`, `monthly_metrics` (fusion reports+snapshots, §14.B clos), `auto_approved_products` (**R2 retenue**, §14.A clos). **2 colonnes** sur `seller_subscriptions` uniquement. Aucun type/enum existant modifié. Migration `020_storefront_v8.sql` |
| P2 | **Aucun handler existant modifié hors exception consignée** | Éditions minimales listées en §5.2 : `products.service.ts#createProduct` (V8-D2 **obligatoire**, dérogation V8-D2), `insertProduct` (`RETURNING id, status`), `app.ts` (montage 1 routeur), `mailer.ts`/`templates.ts` (additif). Catalogue : **1 bloc `if`** dans `queryCatalogPage` (V8-D4, contraint par CA-V8-030/036 — sinon le boost est impossible) |
| P3 | **Dérivation en lecture, jamais stockée** | Badges (§5), éligibilité (§4.1), expiration paresseuse (V7 inchangé), classement payant (§6) : aucun flag, aucune colonne, aucun job de révocation |
| P4 | **Unique point de contrôle** | Auto-approbation : uniquement dans la transaction de création (`createProduct`). Quota boutique : toujours uniquement dans `POST /api/storefront/listings` (V7). Rétrogradation : uniquement route admin dédiée (§4.4) |
| P5 | **Séparation des préoccupations** | V8 n'écrit **jamais** dans le pipeline commande/paiement (CA-V8-080/082/083) — §9, greps |
| P6 | **Prix/paliers en base** | Aucune valeur de forfait en dur ; la boutique référence `subscription_plans.name` (V7) |
| P7 | **Pas de nouveau paiement, pas de nouveau rôle** | Aucun checkout/webhook d'abonnement ; activation admin manuelle inchangée (CA-V7-013/014) ; `requireAuth`/`requireAdmin` réutilisés |
| P8 | **Confidentialité par construction** | `collecte_address` : 0 occurrence publique (CA-V8-044/049) ; référence paiement : jamais publique ni journalisée (CA-V8-052/055) ; 0 PII tierce dans bilan/PDF (CA-V8-072/075) |
| P9 | **Indépendance du parrainage** | Aucune lecture/écriture de `vitrine_until`, `ambassador_until`, `referred_by`, `referral_qualifications` ; Vitrine repasse **après** le payant au tri par défaut uniquement (§6) |
| P10 | **Simplicité** | SQL brut le long du pool `pg` ; zod ; réutilisation multer/`@vercel/blob`/nodemailer ; **1 seule nouvelle dépendance** (`pdfkit`, §9) ; pas d'ORM, pas de workspace npm |
| **P11 (V8)** | **Idempotence stricte des effets de bord** | Bilan : `INSERT … ON CONFLICT (subscription_id, period) DO NOTHING` ; rétrogradation : transaction unique ; auto-approbation : 1 ligne de trace par produit |
| **P12 (V8)** | **Aucun calcul divergent** | 1 seul module de calcul des 6 métriques (`storefront-reports.service.ts`) partagé par PDF, e-mail et page Stats (CA-V8-067) |

### 1.4 Vue d'ensemble des flux

```
[ Vendeur éligible ]                     [ Vendeur non éligible ]
      │ POST /api/products                      │ POST /api/products
      ▼                                         ▼
 products.service#createProduct
      │ 1. SELECT éligible (ACTIVE + ends_at>now() + phone ~ '^\\+2217[0-9]{8}$')
      │ 2a. éligible → INSERT products … RETURNING id, status='AVAILABLE'
      │     └─ txn : INSERT auto_approved_products (R2, retenue §14.A)
      │        action='product.auto_approved'  → AUCUNE notif vendeur (V6.4)
      │ 2b. sinon   → INSERT … status='PENDING' (comportement V7/V5, inchangé)
      ▼
 products (AVAILABLE|PENDING) ──► catalogue (tri par défaut : palier CASE §6)
      │                                ▲ badge dérivé §5 (cartes/fiche)
      ▼                                │
 storefront_listings (V7) ──► /boutique/:slug (+ branding §7 si ACTIVE)
      │
      ▼                            [ 1er du mois 06:00 UTC ]
 orders / order_events ◄─────────── POST|GET /api/cron/monthly-report (§11)
 (pipeline INTOUCHABLE)                    │ calcul via storefront-reports.service.ts
                                           ▼
                              monthly_metrics (upsert idempotent §8.3)
                                           │ e-mail + PDF (§9) + page Stats (§8)
                                           ▼
                                     users.email du vendeur (jamais un tiers)
```

**Synchronisation web/mobile** : aucune cible mobile en V8. Les endpoints sont REST, same-origin, agnostiques ; une future app RN pourra les consommer sans adaptation (cohérent V1→V7).

---

## 2. Modélisation des données — migration `020_storefront_v8.sql`

### 2.0 Garantie d'additivité — vérification avant écriture

- **0 colonne ajoutée à une table pré-V8 autre que `seller_subscriptions`** (périmètre V7/V8, décision PO-V8-05 clos — conforme CA-V7-001 redéfini au cahier §2.3-8).
- **0 colonne ajoutée à `users`, `products`, `orders`, `payments`, `notifications`, `referral_qualifications`, `subscription_plans`, `storefront_listings`, `admin_actions`, `order_events`** (CA-V8-001).
- **0 trigger, 0 `ALTER TYPE`, 0 valeur d'enum** (`grep -n 'ALTER TYPE\|CREATE TRIGGER' server/migrations/020*` → 0, CA-V8-002/036). `notification_type` inchangé.
- **Aucun index modifié** sur l'existant ; seuls des **index sur les 3 tables nouvelles** sont créés (CA-V8-001/036). Aucun index ajouté à `order_events`/`orders` (index existants suffisants — vérifiés : `idx_orders_seller`, `idx_orders_seller_recent` (009), `idx_order_events_order` (003) — CA-V8-068).
- Les migrations `001`→`019` restent **byte-identiques** ; `020_storefront_v8.sql` est **rejouable/idempotent** (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, colonne nullable) — CA-V8-002/056.
- **Aucune ligne réécrite** : `payment_reference`/`payment_method` = `NULL` sur les lignes existantes (CA-V8-053/056).
- **Seed** : `subscription_plans` **non touché** (les 3 forfaits V7 restent la source ; aucun UPDATE, aucun nouveau palier).

### 2.1 DDL complète — `server/migrations/020_storefront_v8.sql`

En-tête de fichier (style `019_storefront.sql`, contraintes nommées, commentaires) :

```sql
-- ============================================================================
-- 020_storefront_v8.sql — V8 « HÉBERGEMENT BOUTIQUE » (PostgreSQL 15+)
-- Prérequis : 001 → 019 appliqués. Exécuté par migrate.ts dans BEGIN/COMMIT
--             (ou manuellement, §3 — RUN_MIGRATIONS=false en prod).
-- ADDITIF : 2 colonnes nullable sur seller_subscriptions (périmètre V7/V8,
-- PO-V8-05 RETENU 18/11) ; 3 nouvelles tables (résolution §14.A/B : R2 retenue,
-- monthly_metrics fusionne reports+snapshots) ; 0 trigger, 0 ALTER TYPE,
-- 0 valeur d'enum, 0 modification des 001→019.
-- ============================================================================
```

#### 2.1.1 ALTER `seller_subscriptions` — 2 colonnes nullable (exact, PO-V8-05)

```sql
-- ---------- 1. RÉFÉRENCE DE PAIEMENT (Wave | Orange Money | virement) ----------
-- V8-D8 / F5 / CA-V8-050..057 — PO-V8-05 RETENU le 18/11/2026 (plan B :
-- table subscription_payment_refs 1:1, migration 021, conservé §12.4/R-V8-B10).
ALTER TABLE seller_subscriptions
    ADD COLUMN IF NOT EXISTS payment_reference varchar(64) NULL,   -- référence saisie vendeur (Wave-2026…, OM …, VIR/…)
    ADD COLUMN IF NOT EXISTS payment_method    varchar(32) NULL
        CHECK (payment_method IN ('wave', 'orange_money', 'virement'));

COMMENT ON COLUMN seller_subscriptions.payment_reference IS
    'Référence de paiement déclarée par le vendeur à la souscription (Wave/OM/virement). Visible back-office + propriétaire uniquement. Jamais publique, jamais loggée en clair (CA-V8-052/055).';
COMMENT ON COLUMN seller_subscriptions.payment_method IS
    'wave | orange_money | virement — renseignée à la souscription, vérifiée par l''admin avant activation. NULL sur les lignes pré-V8 (legacy activable, CA-V8-053).';
```

Types **exacts** exigés par la consigne : `payment_reference varchar(64)`, `payment_method varchar(32)`. Nullable, sans défaut, aucun backfill.

#### 2.1.2 Table 1 — `storefront_profiles` (branding 1:1)

```sql
-- ---------- 2. PROFIL BOUTIQUE (branding 1:1 avec le vendeur) ----------
-- V8-D5 / F4 / CA-V8-040..049 — nouveau, aucun lien avec products ni users.
CREATE TABLE IF NOT EXISTS storefront_profiles (
    seller_id          BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    logo_path          TEXT NULL,                 -- URL publique Blob (ou chemin disque /uploads/storefront/…) ; NULL = défaut
    banner_path        TEXT NULL,                 -- idem ; décorative (alt="" aria-hidden)
    public_description TEXT NULL,                  -- 0–500 graphèmes (graphemes), rendu React échappé, jamais HTML brut
    collecte_address   TEXT NULL,                  -- 10–500 caractères ; PRIVÉE (admin/logistique) — 0 occurrence publique
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_storefront_profile_description
        CHECK (public_description IS NULL OR char_length(public_description) <= 500),
    CONSTRAINT chk_storefront_profile_collecte
        CHECK (collecte_address IS NULL OR (char_length(collecte_address) BETWEEN 10 AND 500)),
    CONSTRAINT chk_storefront_profile_logo_scheme
        CHECK (logo_path   IS NULL OR (logo_path   ~ '^(https?://|uploads/storefront/)') ),
    CONSTRAINT chk_storefront_profile_banner_scheme
        CHECK (banner_path IS NULL OR (banner_path ~ '^(https?://|uploads/storefront/)') )
);

COMMENT ON TABLE  storefront_profiles IS
    'Branding boutique V8 (1:1 vendeur). Rendu public UNIQUEMENT si abonnement ACTIVE (CA-V8-045). collecte_address : strictement interne (vue admin détail) — CA-V8-044/049.';
COMMENT ON COLUMN storefront_profiles.collecte_address IS
    'Adresse de collecte INTERNE (admin/logistique). Aucune surface publique, e-mail, PDF, log, ni serializer (CA-V8-044/049/075).';
```

Éditions possibles dès `PENDING` (préparation) ; rendu public seulement si `ACTIVE` (sinon page boutique 404 inchangée, V7). `ON DELETE CASCADE` : suppression du compte → profil purgé (cohérent V7).

#### 2.1.3 Table 2 — `monthly_metrics` (snapshots + premier/dernier jour + bilan idempotent)

Remplace **à la fois** `storefront_monthly_reports` et `storefront_view_snapshots` du cahier v1.0 (§4.5) — fusion **confirmée** par le chef de projet le 18/11/2026 (§14.B clos ; re-synchronisation du cahier par `@cahier-des-charges`).

```sql
-- ---------- 3. MÉTRIQUES MENSUELLES (relevés de vues + bilan du 1er) ----------
-- V8-D7 / F6 / CA-V8-060..072 — PO-V8-04 RETENU (delta de snapshots).
-- 1 ligne par (subscription_id, period). Rôles de la même ligne :
--   stade « relevé »  (dernier jour de M, 28–31 à 06:00) : views_baseline = cumul, views_sum = 0, email_status NULL
--   stade « bilan »   (1er de M+1, 06:00)                : views_sum = delta, sales_count, ca_fcfa, email_status SENT|FAILED
-- Proposition A RETENUE par le chef de projet (§14.C clos, 18/11/2026) :
-- views_baseline / email_status / sent_at sont des colonnes pleines de la table.
CREATE TABLE IF NOT EXISTS monthly_metrics (
    subscription_id  BIGINT NOT NULL REFERENCES seller_subscriptions(id) ON DELETE CASCADE,
    period           TEXT   NOT NULL,                -- '2026-11' (YYYY-MM, UTC)
    views_sum        INTEGER NOT NULL DEFAULT 0,     -- vues DU MOIS (delta) ; 0 au stade relevé
    sales_count      INTEGER NOT NULL DEFAULT 0,     -- ventes PAID sur le mois
    ca_fcfa          INTEGER NOT NULL DEFAULT 0,     -- CA brut FCFA (entier ; overflow → plan B BIGINT, §12.4/R-V8-B05)
    views_baseline   INTEGER NOT NULL DEFAULT 0,     -- cumul view_count capturé au relevé (28–31) — INTERNE, jamais sérialisé
    email_status     TEXT   NULL CHECK (email_status IN ('SENT','FAILED')),  -- NULL = relevé seulement ; 'SENT' terminal (PO-V8-08 : pas de renvoi V8)
    sent_at          TIMESTAMPTZ NULL,               -- rempli quand email_status est posé (SENT|FAILED)
    computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (subscription_id, period),           -- = UNIQUE(subscription_id, period) — CA-V8-063
    CONSTRAINT chk_monthly_metrics_period
        CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT chk_monthly_metrics_nonneg
        CHECK (views_sum >= 0 AND sales_count >= 0 AND ca_fcfa >= 0 AND views_baseline >= 0)
);

COMMENT ON TABLE monthly_metrics IS
    'V8 bilan mensuel : relevés de vues (dernier jour) + ligne de bilan idempotente au 1er (CA-V8-063/070). Aucune donnée acheteur, aucune coordonnée vendeur (CA-V8-072/075).';
COMMENT ON COLUMN monthly_metrics.views_sum IS
    'Delta de view_count sur le mois (dernier relevé − relevé précédent). Premier bilan : cumul courant, libellé « vues cumulées (1er relevé) » (CA-V8-070).';
COMMENT ON COLUMN monthly_metrics.views_baseline IS
    'Cumul view_count au relevé (dernier jour de M, 00:00→06:00). INTERNE : jamais exposé par l''API/PDF/e-mail — sert uniquement au calcul du delta au bilan (CA-V8-070).';
COMMENT ON COLUMN monthly_metrics.email_status IS
    'NULL = relevé (ou bilan en cours) ; SENT | FAILED = bilan du 1er effectué. Aucune transition depuis SENT (PO-V8-08). Garantit l''idempotence (CA-V8-063/069).';
```

> **Proposition A RETENUE (§14.C — arbitrage chef de projet 18/11/2026)** : `views_baseline INTEGER NOT NULL DEFAULT 0` (cumul au relevé — nécessaire pour calculer le delta du mois suivant après écriture du bilan), `email_status TEXT NULL CHECK (IN 'SENT','FAILED')` (CA-V8-069 : `FAILED` persisté, `SENT` terminal — PO-V8-08), `sent_at TIMESTAMPTZ NULL`. CA-V8-060/063/069/070/071 couverts par ce schéma (§12.5). Table créée avec ces colonnes — aucune colonne existante touchée.

#### 2.1.4 Index (minimaux, additivement)

```sql
-- Index de consultation du bilan/Stats (GET /api/subscriptions/me/stats) : historique 12 mois.
CREATE INDEX IF NOT EXISTS idx_monthly_metrics_subscription_period
    ON monthly_metrics (subscription_id, period DESC);   -- PK couvre déjà (subscription_id, period) ; DESC explicite pour ORDER BY period DESC
-- L'unicité (subscription_id, period) via PK suffit pour ON CONFLICT — aucun index supplémentaire.

-- File admin des auto-approbations (R2 retenue, §14.A clos)
CREATE INDEX IF NOT EXISTS idx_auto_approved_products_created ON auto_approved_products (created_at DESC);
```

Aucun index sur les tables existantes. `idx_seller_subscriptions_pending` (V7) couvre la file admin `PENDING` + tri `created_at` (CA-V8-052).

### 2.2 Table 3 — `auto_approved_products` (R2 RETENUE — §14.A clos 18/11/2026)

Dans la limite des **3 nouvelles tables max** actées le 18/11/2026, la table **retenue** par le chef de projet ajoute :

```sql
-- ---------- 4. TRAÇABILITÉ AUTO-APPROBATIONS (V8-D2/F1 — R2 RETENUE) ----------
CREATE TABLE IF NOT EXISTS auto_approved_products (
    product_id      BIGINT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    seller_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id BIGINT NOT NULL REFERENCES seller_subscriptions(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auto_approved_products_subscription
    ON auto_approved_products (subscription_id, created_at DESC);
```

- **R2 RETENUE (18/11/2026)** : 3 tables ; F1/F8/CA-V8-014/015/016 inchangés ou quasi inchangés (grep sur la nouvelle table au lieu d'`admin_actions`) ; `admin_actions` non détourné.
- **R1 écartée (18/11/2026)** : `admin_actions(action='product.auto_approved', admin_id=sellerId)` — rejetée pour éviter la pollution de l'historique admin et l'ambiguïté `admin_id`.

Le pipeline d'implémentation (§4.3/§4.4) est celui de R2 uniquement.

### 2.3 Correspondance cahier v1.0 → schéma livré (résumé — détail §14)

| Cahier v1.0 | Livré (consigne 18/11) | État |
|---|---|---|
| 4 tables (`storefront_profiles`, `auto_approved_products`, `storefront_monthly_reports`, `storefront_view_snapshots`) | **3 tables RETENUES** (§14.A/B clos) : les 4 cahier deviennent `storefront_profiles`, `auto_approved_products`, `monthly_metrics` (fusion reports + snapshots) | **Amendé (acté)** — §14.A/B |
| `storefront_profiles(seller_id, logo_url, banner_url, description, collection_address…)` | `storefront_profiles(seller_id, logo_path, banner_path, public_description, collecte_address, created_at, updated_at)` (noms consigne) | **Amendé (noms, acté)** — mapping CA-V8-044/049 |
| `storefront_monthly_reports(UNIQUE(seller_id, month), best_product_id, avg_basket_fcfa, conversion_rate, sent_at, email_status, pdf_path…)` | `monthly_metrics(subscription_id, period PK, views_sum, sales_count, ca_fcfa, views_baseline, email_status, sent_at, computed_at)` — prop. A retenue (§14.C) ; best/avg/conversion **calculés à la lecture** par le module partagé (P12) — jamais stockés | **Amendé (acté)** — §14.B/C |
| `storefront_view_snapshots(seller_id, taken_at, total_views) UNIQUE(seller_id, taken_at::date)` | Fusionné dans `monthly_metrics` (ligne « relevé » 28–31, `views_baseline`) + delta au 1er | **Amendé (acté)** — §8.3 |

### 2.4 Contraintes et index — récapitulatif

| Table | Contraintes | Index |
|---|---|---|
| `seller_subscriptions` (ALTER) | + `payment_reference varchar(64) NULL`, + `payment_method varchar(32) NULL CHECK(IN wave/orange_money/virement)` | inchangés (V7) |
| `storefront_profiles` | PK `seller_id`, FK `users ON DELETE CASCADE`, CHECKs description ≤ 500 / collecte 10–500 / schémas d'URL | PK |
| `monthly_metrics` | PK `(subscription_id, period)` (= UNIQUE), FK `seller_subscriptions ON DELETE CASCADE`, CHECKs période/positivité | PK + `idx_monthly_metrics_subscription_period` (DESC) |
| `auto_approved_products` | PK `product_id`, FK `products`/`users`/`seller_subscriptions` `ON DELETE CASCADE` | PK + `idx_auto_approved_products_subscription` (§2.2) + `idx_auto_approved_products_created` (§2.1.4) |

### 2.5 Seed — aucun

Aucune ligne d'amorçage. Les 3 forfaits V7 (`subscription_plans`) restent inchangés. `schema_migrations` recevra `020_storefront_v8.sql` à l'application manuelle.

---

## 3. Runbook de migration — application **manuelle** en production (`RUN_MIGRATIONS=false`)

Constat de production (inchangé depuis V6/V7) : entrée serverless Vercel **n'appelle pas `migrate()`** ; en prod, `RUN_MIGRATIONS=false` ; les migrations sont appliquées **manuellement** via runner trusted. `migrate.ts` : readdir trié lexicographiquement, une transaction par fichier, verrou `pg_advisory_lock`, table `schema_migrations`. `020_…` vient après `019_storefront.sql` ✓.

**Ordre impératif (identique V7 §7.2, adapté) :**

1. **Sauvegarde PostgreSQL de production** (`pg_dump` ou snapshot Supabase) — conserver hors site ; documenter l'heure (journal `docs/journal.md`, livrable `@backend`/`@deploy-ops`).
2. **Vérifier l'état pré-migration** : `SELECT filename FROM schema_migrations ORDER BY 1` → `019_storefront.sql` présente, `020_storefront_v8.sql` absente ; `SELECT count(*) FROM seller_subscriptions` (n₀) ; `SELECT * FROM subscription_plans` → 3 lignes (2000/10, 5000/30, 10000/100) ; `SELECT unnest(enum_range(NULL::notification_type))` → valeurs attendues, **sans** valeur V8.
3. **Appliquer `020_storefront_v8.sql`** via runner trusted : `RUN_MIGRATIONS=true npm run db:migrate` (ou `psql -f` dans une transaction) — **avant** tout déploiement du code V8.
4. **Vérifier post-migration** :
   - `information_schema.columns` : `seller_subscriptions` a **exactement 2 colonnes de plus** (`payment_method`, `payment_reference`, toutes deux nullable) ; `users/products/orders/payments/notifications/referral_qualifications/subscription_plans/storefront_listings` **identiques** ;
   - 3 nouvelles tables présentes : `monthly_metrics` : PK `(subscription_id, period)` + colonnes `views_baseline`, `email_status`, `sent_at` ; `storefront_profiles` : PK `seller_id` ; `auto_approved_products` : PK `product_id` ;
   - `SELECT count(*) FROM seller_subscriptions` = n₀ ; `payment_method`/`payment_reference` = NULL partout ; `subscription_plans` toujours 3 lignes ; enums inchangés (`notification_type`, `subscription_status`) ;
   - Migration **rejouée une 2ᵉ fois** → succès sans erreur (idempotence, CA-V8-002/056).
5. **Déployer le code** (web + API) — `scripts/deploy-vercel.sh` ; variables d'env : `CRON_SECRET` (≥ 16 caractères, lettres/chiffres — en-tête HTTP), `AUTO_APPROVE_V8=true` (défaut) ; `DISABLE_CRON` **absent/false** en prod.
6. **Health check** `GET /api/health` + smoke : `GET /api/storefront/<slug-inexistant>` → 404 identique ; `POST /api/cron/monthly-report` sans secret → 401 ; activation compte test → badge visible ; `GET /api/subscriptions/me/stats` → 200.
7. **Recette** `@tester` — grille CA-V8 (§13.4). Toute déviation = V8 non conforme → `AUTO_APPROVE_V8=false` (§12.2).

> **Si le code est déployé avant la migration** → toutes les routes V8 renvoient 500 (tables absentes). L'ordre §3 prime, comme en V7 (R-V7-A7) et comme le rappelle CA-V8-056.
> **`journal.md` (livrable)** : backup, heure, checksum du dump, résultat des 2 runs de la migration, smoke — consigné (CA-V8-056).

---

## 4. Publication directe — auto-approbation (`POST /api/products`)

### 4.1 Éligibilité — dérivée en lecture, **à chaque création uniquement**

```sql
-- Requête unique d'éligibilité (appelée UNE fois, dans la txn de createProduct)
SELECT s.id AS subscription_id
  FROM seller_subscriptions s
  JOIN users u ON u.id = s.seller_id
 WHERE s.seller_id = $1                -- ownerId de la session (jamais un paramètre client)
   AND s.status = 'ACTIVE'
   AND s.ends_at > now()               -- borne à l'instant T (CA-V8-013/064/084)
   AND u.phone ~ '^\+2217[0-9]{8}$'    -- format strict Sénégal (016_phone_strict_9_chiffres.sql)
 LIMIT 1;
```

- Éligible → statut persisté `AVAILABLE` à l'insert ; sinon → `PENDING` (**inchangé**). Aucun drapeau persisté ; révocation immédiate à l'expiration paresseuse ou à la correction du numéro (CA-V8-012/013).
- Double verrou = format strict **+** activation admin (Wave/OM/virement) — décision PO-V8-01 RETENU (a).
- **Hors champ** : articles créés avant éligibilité (jamais rétro-approuvés) ; `RESERVED→AVAILABLE` (refus post-réservation) ; édition de produit (jamais consultée) ; import (n/a).
- V6.4 : **zéro** notification/e-mail vendeur déclenché par l'auto-approbation ; seul l'admin consulte `GET /api/admin/auto-approvals`.
- Le quota boutique n'est **jamais** consulté ici (CA-V8-081).

### 4.2 Point d'application exact dans `createProduct`

Flux actuel (vérifié `src/services/products.service.ts`, `src/repositories/products.repository.ts`) :

```
createProduct(ownerId, fields, files)
  ├─ files.length < MIN_PHOTOS → 400 PHOTO_MISSING          (inchangé)
  ├─ assertValidPhotos(files)                               (inchangé)
  └─ withTransaction(client):
        ├─ validateCategory(client, …)                      (inchangé)
        ├─ uniqueSlug(client, …)                            (inchangé)
        ├─ insertProduct(client, ownerId, fields, slug)     ← modifié (§4.3)
        ├─ photos (writePhotoFile + insertImage)            (inchangé)
        ├─ insertNotification(… 'article_submitted' …)      ← CONDITIONNÉ (§4.3)
        ├─ admins ← findAdminAlertRecipients                ← CONDITIONNÉ (§4.3)
        └─ alertAdmins(… product_submitted_admin …)         ← CONDITIONNÉ (§4.3)
```

**Diff attendu (fichiers — rien d'autre) :**

| Fichier | Changement | Portée |
|---|---|---|
| `repositories/products.repository.ts` | `insertProduct(client, ownerId, fields, slug, initialStatus?: 'PENDING' \| 'AVAILABLE')` → `RETURNING id, status` (retour élargi, `DEFAULT 'PENDING'` reste le défaut DB) | 1 fonction |
| `repositories/products.repository.ts` | Nouveau `selectActiveEligibleSubscription(client, sellerId)` — requête §4.1 (lecture seule) | ajout |
| `services/products.service.ts` | Dans `createProduct` : calcul éligibilité **avant** `insertProduct` ; notification/admin alert **skipées si auto-approuvé** ; appel `recordAutoApproval(client, …)` dans la txn | `createProduct` uniquement |
| `repositories/admin.repository.ts` | Aucune édition (la trace est dans `auto_approved_products` via `auto-approved.repository.ts`) ; `insertAdminAction` réutilisée uniquement pour la rétrogradation (§4.5) | 0 |
| `services/admin-alerts.service.ts` | **Pas modifié** (non appelé pour les éligibles) | 0 |

### 4.3 Trace d'auto-approbation — R2 **RETENUE** (arbitrage clos, §14.A 18/11/2026)

> Homonymie : « R2 » ici = variante de traçabilité (§14.A) — **à ne pas confondre** avec la route `R2 DELETE /api/storefront/profile/banner` (§13.1).

**R2 — retenue : 3ᵉ table `auto_approved_products`**

```ts
// dans la transaction de createProduct, APRÈS insertProduct — exactement 1 ligne
await insertAutoApprovedProduct(client, {
  productId: id, sellerId: ownerId, subscriptionId: eligible.subscription_id,
});   // INSERT INTO auto_approved_products … ON CONFLICT (product_id) DO NOTHING
```

F1 : « trace dans la nouvelle table `auto_approved_products` » ✔ cahier. CA-V8-015 (trace exhaustive, 1 ligne/produit) ✔ inchangé. F8 (garde `409 NOT_AUTO_APPROVED`) : `SELECT 1 FROM auto_approved_products WHERE product_id=$1`.

**R1 — écartée (18/11/2026)** : `admin_actions(action='product.auto_approved', admin_id=sellerId)` — rejetée : détournement de table d'audit admin, `admin_id NOT NULL` ambigu, pollution de l'historique admin (CA-ADM07). Conservée au document uniquement pour historique décisionnel ; **non implémentée**.

**Arbitrage §14.A clos (18/11/2026)** : R2 retenue — (1) limite 3 tables respectée ; (2) F1/F8 et CA-V8-014/015/016 intacts ; (3) `admin_actions` réservé aux actions admin réelles (`product.auto_approved_retrograded` via §4.5) ; (4) sémantique propre (table système ≠ journal admin).

### 4.4 Code applicatif — extrait normatif

```ts
// services/products.service.ts — createProduct (diff conceptuel, V8-D2)
const eligible = await selectActiveEligibleSubscription(client, ownerId);   // §4.1 — 1 requête
const initialStatus = eligible && config.autoApproveV8 ? 'AVAILABLE' : 'PENDING';
const id = await insertProduct(client, ownerId, fields, slug, initialStatus);   // RETURNING id, status

if (initialStatus === 'AVAILABLE') {
  await recordAutoApproval(client, { productId: id, sellerId: ownerId, subscriptionId: eligible!.subscriptionId });   // §4.3 — R2 retenue
  // AUCUNE notification vendeur (V6.4) ; AUCUNE alerte admin « à valider » —
  // les admins consultent GET /api/admin/auto-approvals (§4.5).
} else {
  await insertNotification(client, ownerId, 'article_submitted', 'Article soumis', fields.name);   // comportement existant
  // … findAdminAlertRecipients / alertAdmins idem (inchangés)
}
```

`config.autoApproveV8` : zod `enum(['true','false']).default('true')` — plan B R-V8-01 du cahier (`AUTO_APPROVE_V8=false` → retour strict à `PENDING`, sans migration, réversible en redéploiement).

**Garanties transactionnelles** : auto-approbation = **même transaction** que l'insert (P11) ; rollback → ni produit, ni trace, ni notification. Produit auto-approuvé = `AVAILABLE` immédiat → catalogue/fiche/mes-articles le montrent sans fenêtre `PENDING` (CA-V8-011). `RETURNING` (consigne) : le service réutilise `selectOwnerProduct(id)` existant pour la réponse — `RETURNING id, status` sert à vérifier/journaliser le statut persisté (et aux tests CA-V8-010).

### 4.5 Rétrogradation admin — `POST /api/admin/products/:id/retrograde`

Body `{ reason: string }` — `reason` trimmé, **≥ 10 caractères** (zod, sinon `400 VALIDATION_ERROR`).

```
txn:
 1. SELECT … FROM products WHERE id=$1 AND deleted_at IS NULL FOR UPDATE   → absent → 404 NOT_FOUND
 2. product.status <> 'AVAILABLE'  → 409 INVALID_STATUS   (SOLD/RESERVED/PENDING/REJECTED — un PENDING passe par la route reject existante)
 3. garde trace : SELECT 1 FROM auto_approved_products WHERE product_id=$1   (R2 retenue)
    absent → 409 NOT_AUTO_APPROVED
 4. UPDATE products SET status='REJECTED', rejection_reason=$2 WHERE id=$1   (approved_at/by inchangés — rejet ≠ approbation)
 5. admin_actions : action='product.auto_approved_retrograded', target_type='product', target_id=$1, admin_id=<admin session>, description=<reason>
 6. insertNotification(seller_id, 'article_rejected', …)   -- valeur enum EXISTANTE, réutilisée (F8 ; aucun type ajouté)
 7. commit → réponse { product } (sérialisé comme buildAdminProduct)
```

- `requireAdmin` → un `user` reçoit `403` (convention ARB-V5-02). La route `POST /api/admin/products/:id/reject` (V5) **inchangée**. La place boutique est libérée **par dérivation** (`products.status='REJECTED'` → comptage V7 décrémenté) — 0 écriture quota (CA-V8-014/081).
- Montée sous `/api/admin` : **routeur séparé** `admin-v8.routes.ts` (paths `/auto-approvals`, `/products/:id/retrograde` inexistants) → 0 édition de `admin.routes.ts` (P2) ; `requireAdmin` au niveau routeur.

### 4.6 Route compagnon — `GET /api/admin/auto-approvals`

`requireAdmin` ; query `page`, `per_page` (1..48, défaut 12) ; réponse paginée §1.5 avec `{ id, productId, productName, sellerId, sellerDisplayName, createdAt, subscriptionId }` — alimentée par la trace (`auto_approved_products` ⨝ `products` ⨝ `users`). Sert au contrôle qualité admin (K4 < 5 %) et à CA-V8-018. Montée dans `admin-v8.routes.ts`.

---

## 5. Badges de palier — dérivés en lecture, jamais stockés (V8-D3)

### 5.1 Fonction de référence `storeBadge(sellerId)` — contrat

Nouveau module `src/utils/storefront-badges.ts` :

```ts
export type StorefrontBadge = 'boutique' | 'verifiee' | 'pro' | null;

/** Badge de palier d'un vendeur — dérivé en lecture, JAMAIS stocké (CA-V8-023). */
export async function storeBadge(sellerId: number, q: Queryable = pool): Promise<StorefrontBadge> {
  const { rows } = await q.query<{ name: string }>(
    `SELECT sp.name
       FROM seller_subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.seller_id = $1 AND s.status = 'ACTIVE' AND s.ends_at > now()
      LIMIT 1`, [sellerId]);
  const name = rows[0]?.name;
  return name === 'Atelier' ? 'pro' : name === 'Boutique' ? 'verifiee' : name === 'Découverte' ? 'boutique' : null;
}
```

Sémantique : `{ badge: 'pro' | 'verifiee' | 'boutique' | null }` (clé TS `badge`, libellé d'affichage mapé côté front — jamais en dur dans le front, CA-V8-026) :

| Palier `ACTIVE` (`ends_at > now()`) | Badge sérialisé | Libellé affiché |
|---|---|---|
| Atelier | `pro` | « Boutique Pro » |
| Boutique | `verifiee` | « Boutique Vérifiée » |
| Découverte | `boutique` | « Boutique » |
| `PENDING`/`EXPIRED`/`CANCELLED`/non abonné | `null` (absent) | aucun badge (CA-V8-025) |

Révocation = **paresseuse en lecture** : `ends_at` dépassé → la query ne retourne plus rien → badge absent à la lecture suivante, **0 job, 0 écriture** (CA-V8-021/024/031). Coexistence Ambassadeur : les deux badges s'affichent côte à côte ; `users.ambassador_until` jamais lu/écrit par V8 (CA-V8-022/037).

### 5.2 Propagation dans le catalogue et la fiche — pas de N+1

**Ne pas appeler `storeBadge()` par carte** (N+1). Le badge est calculé **en SQL** dans les requêtes existantes, même pattern que le `EXISTS(vitrine)` actuel (`products.repository.ts:499-503`) :

```sql
-- LEFT JOIN LATERAL — ajouté dans CARD_SELECT / FICHE_SELECT (colonnes en plus, 0 colonne produits)
LEFT JOIN LATERAL (
  SELECT sp.name AS plan_name
    FROM seller_subscriptions s
    JOIN subscription_plans sp ON sp.id = s.plan_id
   WHERE s.seller_id = p.owner_id AND s.status = 'ACTIVE' AND s.ends_at > now()
   LIMIT 1
) badge ON true
-- … colonne ajoutée au SELECT :
CASE badge.plan_name WHEN 'Atelier' THEN 'pro' WHEN 'Boutique' THEN 'verifiee'
                     WHEN 'Découverte' THEN 'boutique' ELSE NULL END AS seller_badge
```

Sérialiseurs (`serializeProductCard`, fiche publique) : champ **additif** `sellerBadge` (`'pro'|'verifiee'|'boutique'|null` — ou absent) repris tel quel. Front : composant `SellerBadge` lisant `sellerBadge` + libellés mapés (CA-V8-026). Fiche d'un produit `PENDING` d'un non-abonné : `sellerBadge: null` (CA-V8-025). `Cache-Control` : défaut `/api` = `private, no-store` (vérifié `cache.ts`) → aucun badge périmé servi (CA-V8-024). Performances : LEFT JOIN LATERAL corrélé + LIMIT 1 → `uq_one_active_subscription_per_seller` (V7, index unique partiel `WHERE status='ACTIVE'`) ⇒ nested loop indexé, < 0,1 ms/ligne ; à mesurer en recette (CA-V8-034).

**Bounds** : aucune écriture, aucun stockage, aucun cache longue durée (CA-V8-023/024).

---

## 6. Ordre d'affichage du catalogue — tri par défaut uniquement (V8-D4)

### 6.1 Emplacement exact dans le code

Fichier `src/repositories/products.repository.ts`, fonction `queryCatalogPage` (vérifiée, lignes ~471–505). **Seul le bloc** `if (filters.section === undefined && sort === 'recent')` change :

```ts
// V8-D4 / F3 / CA-V8-030..038 — UNIQUEMENT tri par défaut (section absente && sort==='recent')
if (filters.section === undefined && sort === 'recent') {
  orderBy = `CASE badge.plan_name
               WHEN 'Atelier'    THEN 1
               WHEN 'Boutique'   THEN 2
               WHEN 'Découverte' THEN 3
               ELSE 4 END ASC,
             EXISTS (
               SELECT 1 FROM users wv
                WHERE wv.id = p.owner_id AND wv.vitrine_until > now()
             ) DESC, ${orderBy}`;   // ${orderBy} = 'p.created_at DESC, p.id'
}
```

(`orderBy` de base = `p.created_at DESC, p.id` — inchangé. `badge` = le même LEFT JOIN LATERAL que §5.2. Pour éviter un double LATERAL, l'implémentation peut fusionner les JOIN.)

Sémantique : **Atelier (1) → Boutique (2) → Découverte (3) → Vitrine (`EXISTS` = 1 pour les ambassadeurs ≠ payants) → non-payants (4)**, puis `created_at DESC, id` partout. Un payant `EXPIRED` retombe à 4 (badge `NULL` → `CASE … ELSE 4`) — sans aucune écriture (CA-V8-031).

### 6.2 Verrous respectés

- **Tris explicites intacts** : `price_asc`, `price_desc`, `popular`, `oldest`, `relevance` ; sections `promotions`/`best_offers`/`popular`/`new`/`discover` — bloc `if` non emprunté ⇒ séquences d'ids **byte-identiques** à pré-V8 (CA-V8-032 golden master).
- **Vitrine après le payant, avant les non-payants** (CA-V8-033) ; `vitrine_until` jamais lu en écriture (CA-V8-037) ; `popular`/`recent` V6.7 conservés hors défaut.
- **Aucun produit masqué, exclu, ni paginé autrement** ; `perPage` et tie-break `id` inchangés (CA-V8-035).
- **Aucune écriture** : 0 `UPDATE`/`INSERT INTO products` ajouté (CA-V8-036) ; 0 occurrence de `storefront_listings|STOREFRONT_QUOTA` dans le chemin catalogue (CA-V8-038 — rejoué en recette).
- `EXPLAIN (ANALYZE, BUFFERS)` attendu < 2 ms @10k produits, 0 seq scan (CA-V8-034) — risque perf documenté §12.4/R-V8-B07 (le `CASE` impose un sort top-N ; index `idx_products_catalog` ne peut pas servir ce ORDER BY ; limite 48 lignes ⇒ tri en mémoire).

### 6.3 Fiche produit — aucun réordonnancement

La fiche (`GET /api/products/:id`) n'est pas concernée ; seul le badge y est ajouté (§5.2, champ additif `sellerBadge`).

---

## 7. Boutique brandable — upload logo/bannière + routes (V8-D5)

### 7.1 Réutilisation stricte du stockage existant (`src/utils/storage.ts`)

**Aucun nouveau backend, aucun nouveau SDK** (CA-V8-046). Ajout **additif** dans `storage.ts` (fichier existant, fonctions ajoutées seulement — pas de modification de `savePhoto`/`savePaymentProof`/`deletePhoto`) :

```ts
const STOREFRONT_DIR = 'uploads/storefront';

/** Logo ou bannière de boutique — même pattern que savePhoto (UUID serveur, Blob ou disque). */
export async function saveStorefrontAsset(buffer: Buffer, mime: string): Promise<string> {
  const filename = `${crypto.randomUUID()}.${extFor(mime)}`;
  if (blobStorageEnabled()) {
    const { url } = await put(`${STOREFRONT_DIR}/${filename}`, buffer, {
      access: 'public', contentType: mime, addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    logger.info('asset boutique écrit (blob)', { pathname: `${STOREFRONT_DIR}/${filename}`, bytes: buffer.length });
    return url;
  }
  const absPath = path.join(config.uploadDir, '..', STOREFRONT_DIR, filename);   // uploads/storefront/<uuid>.<ext>
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, buffer);
  return `${STOREFRONT_DIR}/${filename}`;
}
export const deleteStorefrontAsset = deletePhoto;   // réutilisé tel quel (best-effort, URL absolue → del() Blob)
```

- Nom de fichier **toujours UUID serveur** ; magic bytes vérifiés (`sniffImageMime` réutilisé de `middleware/upload.ts`) — jamais le header client (RG-MEDIA-1).
- MIME `image/jpeg|png|webp` uniquement ; **logo ≤ 2 Mo · bannière ≤ 4 Mo** (`MAX_LOGO_BYTES`/`MAX_BANNER_BYTES` dans `middleware/upload.ts`, `memoryStorage`, `fileSize: 8 Mo` outer + contrôle par kind dans le service, 2 kinds max).
- `BLOB_READ_WRITE_TOKEN` absent (dev/test) → repli disque identique à `savePhoto` (CA-V8-046).
- Anciens fichiers : écrasement → suppression best-effort après succès (CA-V8-047) ; échec ignoré (P8).
- Le préfixe logique `uploads/storefront/` est **nouveau** ; `uploads/products` et `uploads/payment-proofs` inchangés.

### 7.2 Les 3 nouveaux endpoints (+ 1 variante d'arbitrage)

| # | Méthode & chemin | Auth | Succès | Description |
|---|---|---|---|---|
| R1 | `PUT /api/storefront/profile` | `requireAuth` (owner) | `200` | **Multipart** : `logo` (file, opt.) + `banner` (file, opt.) + champs `publicDescription` (≤ 500 graphèmes), `collecteAddress` (10–500). Crée la ligne `storefront_profiles` au 1er appel (upsert). 0–2 fichiers par requête |
| R2 | `DELETE /api/storefront/profile/logo` | `requireAuth` (owner) | `200` `{ ok: true }` | Retire le logo (NULL), Blob supprimé best-effort |
| R3 | `DELETE /api/storefront/profile/banner` | `requireAuth` (owner) | `200` `{ ok: true }` | Retire la bannière (NULL), idem |

**Variante écartée (§14.D clos, 18/11/2026)** : éclater R1 en `POST /api/storefront/profile/logo` + `POST /api/storefront/profile/banner` + `PUT /api/storefront/profile` (3 routes JSON, 5 endpoints) — **non retenue** ; les CA-V8-040/041/085 seront amendés sur la forme PUT multipart (décision actée par le chef de projet — amendement consigné §14.D).

**`PUT /api/storefront/profile` — détails (R1/R2/R3 **RETENUS**, §14.D clos)**

- Disponible **dès `PENDING`** (préparation, CA-V8-045) ; le rendu public n'a lieu que si `ACTIVE` (sinon `/boutique/:slug` 404 inchangé).
- `collecteAddress` : **jamais renvoyée dans aucune réponse API ni UI** (arbitrage §14.D clos). Saisie en écriture seule (`PUT`) ; aucune lecture possible via l'API — la valeur existante n'est affichable nulle part (le propriétaire ressaisit pour corriger ; le front n'affiche qu'un indicateur `collecteAddressSet: boolean`). Lecture réservée au SQL trusted (DBA/logistique hors produit).
- Réponse `200` : `{ profile: { logoUrl, bannerUrl, publicDescription, collecteAddressSet, updatedAt } }` (propriétaire uniquement).
- Erreurs : `401 UNAUTHENTICATED` · `400 VALIDATION_ERROR` (description > 500 graphèmes, graphes combinants comptés — `Intl.Segmenter`, test Unicode `👨‍👩‍👧` = 1 grapheme — CA-V8-043 ; collecteAddress hors 10–500, CA-V8-042) · `400 INVALID_IMAGE` (MIME ≠ magic bytes, ou non-image — `application/pdf` → 400) · `413 FILE_TOO_LARGE` (> 2 Mo logo · > 4 Mo bannière, message clair) · `500 INTERNAL_ERROR`.
- Écriture : upsert `storefront_profiles` (même transaction que suppression éventuelle de l'ancien blob — blob supprimé **après** commit, best-effort).
- **Édition dès `PENDING` mais jamais rendue publique hors `ACTIVE`** — le serializer public (§7.3) ignore le profil si pas `ACTIVE` (CA-V8-045).
- XSS : `public_description` stockée brute, **rendue échappée** (React) ; `<script>alert(1)</script>` inerte (CA-V8-042) ; jamais `dangerouslySetInnerHTML` ; alt bannière vide / `aria-hidden="true"`, logo `alt=« Logo de la boutique {nom} »` (CA-V8-041/048).

### 7.3 Lecture publique — `GET /api/storefront/:slug` (route **inchangée**, payload **étendu additivement**)

V7 : `{ storefront: { slug, displayName, memberSince }, items, page, perPage, total, totalPages }`. **Extension v2.8** (0 champ supprimé, 0 type changé, codes inchangés) :

```jsonc
{
  "storefront": {
    "slug": "mode-dakar",
    "displayName": "Aïcha M.",        // inchangé
    "memberSince": 2024,               // inchangé
    "logoUrl": "https://…public.blob.vercel-storage.com/uploads/storefront/<uuid>.png",   // NOUVEAU (ou absent)
    "bannerUrl": "https://…",                                                        // NOUVEAU (ou absent)
    "publicDescription": "…"                                                          // NOUVEAU (ou absente)
  },
  "items": [ … ]                       // inchangé (+ champ additif sellerBadge par carte, §5.2)
}
```

- Champs présents **uniquement si** (a) le profil existe **et** (b) l'abonnement est `ACTIVE` (sinon 404 identique V7 — règle de non-divulgation conservée, §3.6 V7).
- `collecte_address` : **0 occurrence** — ni JSON, ni HTML, ni logs, ni aucune UI/API (arbitrage §14.D clos : lecture **SQL trusted uniquement**) — CA-V8-044/049/075 ; sérialiseur public `serializeStorefrontPublic` **étendu** avec un allowlist strict `{ slug, displayName, memberSince, logoUrl?, bannerUrl?, publicDescription? }`.
- `Cache-Control: private, no-store` inchangé (route déjà `no-store`, vérifié). Phase front : bloc branding en tête de `/boutique/:slug` (logo 96 px, bannière responsive `max-width:100%`, description échappée, contrastes AA — CA-V8-041/048/076).

### 7.4 Admin et adresse de collecte — **aucun accès via produit (arbitrage §14.D clos)**

- La **file** `GET /api/admin/subscriptions` (V7) est étendue **additivement** avec `paymentMethod`, `paymentReference` (et « référence absente » si NULL — CA-V8-052/053). L'**adresse de collecte** n'y figure pas.
- **Pas de route détail admin en V8** (décision actée) : aucune surface API/UI — admin ou propriétaire — n'expose `collecte_address`. La logistique/admin y accède **via SQL trusted** (lecture bornée, hors produit, hors API) : `SELECT collecte_address FROM storefront_profiles WHERE seller_id = $1;` — réservé aux opérations internes, jamais sérialisé.
- **Limite acceptée en V8** (revisitable V9) : l'admin ne voit pas l'adresse dans l'UI ; la référence de paiement reste la seule donnée de souscription visible en file admin.

---

## 8. Statistiques — `GET /api/subscriptions/me/stats`

### 8.1 Contrat

`requireAuth`. Résout **l'abonnement le plus récent** du connecté (tous statuts — la page Stats doit fonctionner aussi pour `EXPIRED` : « votre bilan a cessé » + historique visible). Propriétaire uniquement — un autre vendeur n'y accède pas (`/me` ⇒ périmètre session) ; anonyme → `401`. Réponse `200` :

```jsonc
{
  "subscription": { "id": 41, "status": "ACTIVE", "plan": { "name": "Atelier", "quota": 100 }, "endsAt": "2026-12-17T…", "daysRemaining": 30 },
  "latestReport": {                       // dernier bilan dont la ligne existe (email_status NOT NULL) — null sinon
    "period": "2026-10",
    "views": 1234,                        // delta (ou cumul libellé si 1er relevé)
    "viewsLabel": "vues du mois",         // ou « vues cumulées (1er relevé) »
    "salesCount": 4,
    "revenueFcfa": 120000,                // CA brut persisté (monthly_metrics.ca_fcfa)
    "netRevenueFcfa": 108000,             // recalculé à la lecture : CA brut − Σ orders.commission (persistée, 10 % exact — CA-V5-150)
    "commissionFcfa": 12000,
    "avgBasketFcfa": 30000,               // brut / ventes (null si 0 vente → « — »)
    "bestProduct": { "id": 88, "name": "iPhone 12", "sales": 2 },   // tie-break view_count DESC
    "conversionRate": 0.0032,             // ventes / vues ; null si vues = 0 → « — »
    "emailStatus": "SENT",                // SENT | FAILED
    "sentAt": "2026-11-01T06:00:12.000Z"
  },
  "history": [ /* … jusqu'à 12 mois, même structure, tri period DESC … */ ],
  "isFirstReport": false
}
```

- **Aucun calcul divergent** (P12) : toutes les valeurs viennent de `storefront-reports.service.ts#computeMonthlyMetrics(subscriptionId, period, client)` — le **même** module que l'e-mail et le PDF (CA-V8-061/067). `netRevenueFcfa`, `commissionFcfa`, `avgBasketFcfa`, `bestProduct`, `conversionRate` : recalculés à la lecture depuis `orders`/`order_events` (données immuables post-PAID ⇒ recalcul déterministe) ; `views`, `salesCount`, `ca_fcfa` : **persistés** dans `monthly_metrics` (immuables après bilan).
- Historique = lignes `monthly_metrics` du vendeur (`email_status IS NOT NULL`) limitées à 12 (CA-V8-066).
- Erreurs : `401 UNAUTHENTICATED` · `500 INTERNAL_ERROR`. Route montée dans `subscriptions.routes.ts` (existant, **+1 handler**, pas de modification des 2 handlers V7).
- Payload strictement owner — aucun champ de tiers, aucune coordonnée (CA-V8-066/072/075).

### 8.2 Page front `/mon-abonnement` — onglet « Statistiques »

Bloc dans `pages/MySubscriptionPage.tsx` (existant, +1 onglet) : KPIs du dernier bilan (7 lignes : vues, ventes, CA brut, CA net, panier moyen, meilleur article, taux de conversion), historique 12 mois (tableau), état d'envoi (`SENT`/`FAILED` — `aria-live`), CTA « renouveler » si `EXPIRED` (message V7 conservé). Responsive 375 px, `scrollWidth ≤ 375`, axe 0 violation (CA-V8-076/077). 0 erreur JS ; données via `lib/storefront.ts` + `lib/api.ts` (CSRF).

### 8.3 Snapshots de vues — mécanisme (2 relevés/mois)

| Run | Déclencheur (§11) — **1 cron quotidien `0 6 * * *`, dispatch interne (§14.F clos)** | Action |
|---|---|---|
| **Relevé de base** (`views_baseline`, au 1er 06:00) | Branche « 1er » du dispatch (jour 1) | Pour chaque abonnement `ACTIVE` : `INSERT INTO monthly_metrics(subscription_id, period, views_baseline, views_sum=0, …) VALUES (…) ON CONFLICT (subscription_id, period) DO UPDATE SET views_baseline = EXCLUDED.views_baseline, computed_at = now() WHERE monthly_metrics.email_status IS NULL` (joint au `runMonthlyReport` du 1er) |
| **Relevé final** (`views_sum`, dernier jour 06:00) | Branche « dernier jour » du dispatch | Même chose mais `views_sum = (SELECT Σ p.view_count …)` ; `views_sum` n'est **jamais** écrasé par le bilan (persisté=cible delta `views_sum − views_baseline` uniquement au calcul/restitution, jamais en base) |
| **Bilan** (1er de M+1, 06:00) | Branche « bilan » du cron quotidien : `date_part('day', now()) = 1` | §8.4 — calcul + e-mail + PDF + upsert idempotent |

- `views_baseline` (RETENUE, §14.C clos) = cumul `view_count` capturé au relevé (dernier jour de M, 06:00). Au bilan : `delta = cumul(1er M+1) − views_baseline(M)`. Aucun relevé préalable (abonnement activé après le dernier relevé) → `delta = cumul(1er)`, libellé **« vues cumulées (1er relevé) »** (CA-V8-070, premier bilan).
- `Σ view_count` = `SELECT COALESCE(SUM(p.view_count),0) FROM products p JOIN storefront_listings l …` — **vues des articles de la boutique** : définition retenue = somme des `view_count` des produits **du catalogue du vendeur** (`p.owner_id = seller`, `deleted_at IS NULL`) — cohérent avec « vues d'articles » (V8-D7) et indépendant du mécanisme boutique (quota). Documenté pour `@tester` (CA-V8-070).
- **Dernière capture manquante** (cron relevé KO) : bilan procède quand même (delta depuis le relevé 1er précédent — au pire `views_sum = cumul` libellé idem) ; jamais d'échec bloquant (P8) — risque §12.4/R-V8-B06.

### 8.4 Algorithme du bilan (1er, 06:00) — écrit par `storefront-reports.service.ts`

```
T = date_trunc('month', now())                 -- 1er du mois courant 06:00 UTC
M        = to_char(T - interval '1 month', 'YYYY-MM')   -- mois bilan (ex. job du 1er déc → '2026-11')
M_start  = date_trunc('month', T - interval '1 month')  -- '2026-11-01 00:00 UTC'
M_end    = T                                              -- borne exclue

candidats = SELECT s.id, s.seller_id, s.slug, u.email, u.display_name
              FROM seller_subscriptions s JOIN users u ON u.id = s.seller_id
             WHERE s.status = 'ACTIVE' AND s.ends_at > T     -- borne T (CA-V8-064/084) ; EXPIRED/PENDING/CANCELLED exclus

pour chaque candidat s :
    -- Idempotence stricte (CA-V8-063) : ligne bilan déjà posée ?
    existing = SELECT email_status FROM monthly_metrics WHERE subscription_id = s.id AND period = M
    if existing AND existing.email_status IS NOT NULL → SKIP (0 e-mail, 0 ligne)

    metrics = computeMonthlyMetrics(s.id, M, tx):            -- MÊME fonction que /me/stats (P12)
        ventes   = COUNT(DISTINCT o.id) FROM orders o JOIN order_events e ON e.order_id = o.id
                   WHERE o.seller_id = s.seller_id AND e.to_status='PAID'
                     AND e.created_at >= M_start AND e.created_at < M_end          -- PO-V8-03 RETENU
        ca_brut  = COALESCE(SUM(o.amount), 0)   (même périmètre)
        commission= COALESCE(SUM(o.commission), 0)   -- 10 % persisté (CA-V5-150)
        ca_net   = ca_brut - commission
        panier   = ventes > 0 ? floor(ca_brut / ventes) : NULL                   -- 0 vente → « — »
        meilleur = produit du vendeur avec le + de ventes PAID dans M ; tie-break view_count DESC
        vues     = delta vs views_baseline du relevé M (ou cumul si absent — flag isFirstReport)
        conversion = vues > 0 ? ventes / vues : NULL                              -- 2 déc., NULL → « — » (CA-V8-062)

    -- Upsert idempotent — CA-V8-063
    INSERT INTO monthly_metrics (subscription_id, period, views_sum, sales_count, ca_fcfa,
                                 views_baseline, email_status, sent_at, computed_at)
    VALUES (s.id, M, metrics.vues, metrics.ventes, metrics.ca_brut,
            (SELECT views_baseline FROM … M), NULL, NULL, now())
    ON CONFLICT (subscription_id, period) DO UPDATE
       SET views_sum = EXCLUDED.views_sum, sales_count = EXCLUDED.sales_count,
           ca_fcfa = EXCLUDED.ca_fcfa, computed_at = now()
       WHERE monthly_metrics.email_status IS NULL
    -- si 0 ligne affectée → un bilan concurrent a gagné la course → SKIP (pas d'e-mail)

    pdf   = renderBilanPdf({ boutique: slug, period: M, metrics })               -- §9
    ok    = sendMail(s.seller_id, u.email, 'storefront_monthly_report',
                     vars(metrics), { attachments: [{ filename: `bilan-${slug}-${M}.pdf`, content: pdf, contentType: 'application/pdf' }] })
    UPDATE monthly_metrics SET email_status = ok ? 'SENT' : 'FAILED', sent_at = now()
     WHERE subscription_id = s.id AND period = M
    -- P8 : ok=false → FAILED persisté, log sans PII, AUCUNE exception ne remonte (CA-V8-069)
```

- **Aucune écriture** sur `products`, `orders`, `payments`, `order_events`, `notifications`, `seller_subscriptions` (sauf la ligne `monthly_metrics`) — CA-V8-082/083.
- Sélection stricte `ACTIVE` au moment T (CA-V8-064/084) — test borne `T−1s`/`T+1s`.
- Meilleur article = « meilleur article du catalogue du vendeur sur le mois » (PO-V8-02 RETENU) : ventes PAID du mois, tie-break `view_count DESC` — **interprétation consignée, cahier §2.3-5**.
- 6 métriques affichées, CA brut **et** net = 7 lignes (V8-D7, CA-V8-061).

---

## 9. PDF du bilan — stratégie retenue (§14.G clos)

### 9.1 Vérification faite (18/11/2026)

- `node_modules/` : **aucun** `pdfkit`, `pdf-lib`, `jspdf`, `@react-pdf/*`, `pdfmake` — et **zéro occurrence** dans `package.json` (racine, `server/`, `web/`).
- `npm view pdfkit` → **0.20.2** (dernière, publiée 2026-11-16) ; dépendances 100 % JavaScript (`fflate`, `fontkit`, `linebreak`, `png-js`, `@noble/*`) — **aucun code natif**, aucun canvas, aucune police embarquée nécessaire (polices standard PDF = WinAnsi). `jspdf` 4.2.1 : orienté navigateur, plus lourd en Node (vfs/polices). Install : `npm install pdfkit@0.20.2` + `@types/pdfkit` (dev) dans `server/`.

### 9.2 Décision retenue : **`pdfkit` 0.20.2** (seule nouvelle dépendance de V8)

Justification : (1) génération **serveur**, **hors-ligne** (aucun appel réseau — CA-V8-065) ; (2) standard de facto Node pour du PDF texte/tableaux ; (3) typographie Latin-1/WinAnsi suffisante — contenu = chiffres, français (é, è, ê, à, ç…), noms de boutique : translittération défensive des glyphes hors Latin-1 (remplacement par `?` — jamais de crash sur emoji/CJK dans un nom) ; (4) `%PDF-` magic bytes natifs ; (5) taille << 2 Mo (typiquement 15–40 Ko) ; (6) `npm audit` : aucune vulnérabilité critique connue sur 0.20.2 (CA-V8-078 — rapport joint à la recette) ; (7) alternative « générateur PDF maison » rejetée : risque élevé de xref/offsets corrompus, ~150 lignes sensibles à maintenir — faux ami de la « légèreté ».

**pdfkit ACCEPTÉ (§14.G clos, 18/11/2026)** — seule nouvelle dépendance serveur, consignée. **Condition d'installation (à la charge de `@backend`) : `npm audit` exécuté AVANT `npm install pdfkit@0.20.2`, rapport joint à la recette (CA-V8-078) — aucune vulnérabilité critique tolérée, sinon arrêt et retour au chef de projet.** Plan B documenté pour mémoire (sans objet depuis §14.G clos) : générateur minimal maison (document A4 1 page, objets PDF fixes, pas de compression, WinAnsi) — strictement limité au gabarit 7 lignes + en-tête/pied. **« no-PDF-mais-email » est rejeté** (casse CA-V8-060/065/067). `jspdf` écarté (orientation navigateur, gestion des polices en Node plus fragile que pdfkit pour ce cas serveur).

### 9.3 Contenu et garanties (`src/utils/bilan-pdf.ts`)

- Pages **A4**, marges 48 pt ; en-tête « Bilan mensuel ReVends — {boutique} — {mois} » ; tableau 7 lignes (vues, ventes, CA brut, CA net, panier moyen, meilleur article « {nom} — {n} ventes », taux de conversion à 2déc. ou « — ») ; pied « ReVends — Hébergement Boutique » ; date de génération UTC.
- **0 donnée d'un tiers** (nom/e-mail/téléphone acheteur) ; **0 coordonnée vendeur** (phone/email) ni adresse de collecte ni référence de paiement — le PDF n'embarque que : nom boutique, mois, 7 métriques (CA-V8-065/072).
- Fichier `bilan-{slug}-{YYYY-MM}.pdf` ; Stream/Buffer en mémoire (jamais écrit sur disque) ; `Buffer` passé à nodemailer via `attachments` (§9.4).
- Hors-ligne en test : transport mail `jsonTransport` (test) ⇒ aucune socket ; bytes vérifiés (`%PDF-`) par le test CA-V8-065.

### 9.4 Extension strictement additive du Mailer

| Fichier | Ajout (rien d'autre) |
|---|---|
| `src/mail/templates.ts` | `'storefront_monthly_report'` ajouté à l'union `MailEvent` ; `renderTemplate` : nouveau case (sujet « Votre bilan ReVends de {mois} — {boutique} », texte+HTML 7 lignes, **aucune PII**) ; aucun template existant touché (`git diff server/src/mail/` = ajouts uniquement) |
| `src/mail/mailer.ts` | `sendMail(userId, to, event, vars = {}, attachments?: { filename: string; content: Buffer; contentType: string }[])` — **paramètre optionnel**, transmis tel quel à `t.sendMail({ …, attachments })`. Signature rétrocompatible : **0 appel existant modifié** (CA-V8-071) |
| `src/mail/templates.ts` (sujet) | `subjectOf` : +1 entrée `storefront_monthly_report` |
| `notification_type` | **inchangé** — le bilan n'est **pas** une notification in-app (aucun insert dans `notifications` pour le bilan ; e-mail seul) — CA-V8-071, 0 nouvelle valeur d'enum |

Échec SMTP → P8 : `email_status='FAILED'` persisté, log **sans** référence/coordonnées (CA-V8-055/069), job non bloquant ; `notification_deliveries` — le bilan n'y est **pas** inséré (hors flux notifications) ; l'idempotence repose sur `monthly_metrics` (CA-V8-063).

---

## 10. Anti-spam / Turnstile — endpoint Contact existant (`/api/storefront/:slug/contact`)

**Constat dépôt (vérifié 18/11/2026)** : **aucun Turnstile** n'existe dans le repo (`grep -ri turnstile` → 0 occurrence, code et docs). Le motif anti-abus déjà en place pour le contact boutique est :

1. `requireAuth` — un compte authentifié est requis (comptes gratuits mais traçables) ;
2. rate-limit dédié **`storefront-contact`** : 10 requêtes / 10 min / IP, clé Redis `rl:storefront-contact:<ip>` (`app.ts:196`, `rateLimit({ scope: 'storefront-contact', windowMs: 600_000, max: 10 })`) — jamais partagé avec le global (300/min) ;
3. zod strict : `message` 10–2000 caractères trimmés, `email` optionnel ≤ 254 format e-mail (`contactSchema`) ;
4. **garde métier** : 404 non divulgateur hors `ACTIVE`, `400 CONTACT_SELF` (anti-spam auto), notification interne uniquement (`product.contact`) ;
5. CSP helmet + React escaping (XSS).

**Décision V8 (retenue)** : **ne pas introduire Turnstile**. Motifs : (a) ajout = nouvelle dépendance + clé Cloudflare + widget front + appel de vérification par POST (coût par requête, hors-ligne en test) pour un endpoint déjà authentifié, limité en volume et scoppé boutique ; (b) la consigne demande de *réutiliser le motif existant*, pas d'en créer un nouveau ; (c) la surface de création de compte abusive relève des anti-abus existants (auth rate-limit, vérification e-mail) hors périmètre V8.

**Plan B documenté** (si le chef de projet l'exige) : Turnstile invisible (widget front sur le formulaire de contact uniquement) + vérification serveur dans `contactStorefront` (1 POST HTTPS vers `https://challenges.cloudflare.com/turnstile/v0/siteverify` avec secret `TURNSTILE_SECRET_KEY`, tolérance test) — 1 nouvelle env var, 0 nouvelle table, endpoint inchangé hors garde supplémentaire ; à arbitrer (§14.E) avec Cloudflare site key + humain en recette. **Dans les deux cas : aucune modification du contrat de la route contact, aucun changement de comportement hors ce garde** (CA-V8-005).

---

## 11. Déclenchement du bilan — Vercel Cron (prod) + in-process (dev/tests) — correction de contrat

### 11.1 Écart signalé au cahier (PO-V8-06) — **le cahier est techniquement inexact sur 2 points**

Le PO-V8-06 RETENU dit : « Vercel Cron — `POST /api/cron/monthly-report`, secret `CRON_SECRET` (header `x-cron-secret`) ». **Vérifié sur les docs officielles (18/11/2026) :**

1. Vercel Cron invoque le path en **HTTP GET**, pas POST ;
2. Vercel envoie automatiquement **`Authorization: Bearer <CRON_SECRET>`** (dérivé de la variable d'environnement), **jamais** `x-cron-secret` ;
3. Les crons ne tournent que sur **déploiements production** ;
4. Plan Hobby : précision « quelque part dans l'heure », et quota de jobs limité — **arbitrage §14.F clos : 1 seul job quotidien `0 6 * * *`** (dispatch interne 1er/dernier jour), la variante à 2 jobs est écartée.

**Conséquences contractuelles (ACTÉES par le chef de projet, §14.F clos 18/11/2026) :** le secret reste `CRON_SECRET` (variable Vercel, ≥ 16 car., lettres/chiffres) ; le endpoint accepte **deux** authentifications, toutes deux en comparaison à temps constant : `Authorization: Bearer <CRON_SECRET>` (usage Vercel prod) **ou** `x-cron-secret: <CRON_SECRET>` (déclenchement manuel/test, fidèle au libellé cahier). Le endpoint répond à **GET et POST** (GET = Vercel ; POST = ergonomie manuelle). Comportement : `401 { error: { code: 'UNAUTHENTICATED', message: 'Cron non autorisé' } }` si absent/invalide/`CRON_SECRET` non défini ; corps `{ ok: true, mode, processed, sent, failed }` sinon.

> Sans cette correction, **chaque invocation quotidienne renverrait 401 et aucun bilan ne partirait jamais** — c'est un défaut bloquant du cahier, détecté ici avant code. R-V8-B01, §12.4.

### 11.2 Production — `vercel.json` (racine) : ajout de la clé `crons`

```jsonc
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "express",
  /* …existant inchangé… */
  "crons": [
    { "path": "/api/cron/monthly-report", "schedule": "0 6 * * *" }   // UNIQUE — quotidien 06:00 UTC ; dispatch interne 1er = bilan / dernier jour = relevé / sinon noop
  ]
}
```

- L'endpoint route par **calendrier UTC** (pas par `?mode`) : si `date = 1er` → bilan(M−1) ; sinon si `demain = 1er` → relevé ; sinon `200 { ok: true, mode: 'noop' }`. Aucune logique de scheduling dans le code métier (mono-entrée, teste `runMonthlyReport(T)` en isolation — CA-V8-060).
- **Décision §14.F actée (18/11/2026)** : **1 job quotidien `0 6 * * *`** — la variante à 2 jobs (`0 6 1 * *` + `0 6 28-31 * *`) est **écartée** (quota Hobby et simplicité). Imprécision « quelque part dans l'heure » acceptable (bilan 06:00 ± 59 min — sans impact : le bilan porte sur le mois écoulé).
- `maxDuration` : le bilan (≤ 100 vendeurs × ~200 ms requêtes + SMTP) vise < 30 s (CA-V8-068) ; Hobby limite les fonctions à 60 s max (docs Vercel) — marge OK ; en Pro, plafond supérieur. À surveiller en 1ère exécution (K9).

### 11.3 Dev / tests — in-process (même fonctions métier, CA-V8-060)

`src/jobs/run.ts` (fichier existant, **additivité préservée** — la tâche minute d'expiration des réservations n'est **pas** modifiée) :

```ts
import { expireExpiredReservations } from '../services/expiry.service.js';
import { runMonthlyReportIfDue } from '../services/storefront-reports.service.js';

export function startScheduler(): void {
  if (config.disableCron) { /* …existant… */ return; }
  cron.schedule('*/1 * * * *', /* …existant, inchangé… */);
  cron.schedule('0 6 * * *', async () => {          // quotidien 06:00 — délègue au service (logique 1er = bilan / dernier jour = relevé)
    try { const r = await runMonthlyReportIfDue(new Date()); if (r.mode !== 'noop') logger.info('cycle mensuel exécuté', r); }
    catch (err) { logger.error('échec bilan mensuel', { errorMessage: (err as Error).message }); }   // jamais d'exception remontée (P8)
  });
}
```

- `DISABLE_CRON=true` (dev/tests) → rien ne démarre ; les tests appellent `runMonthlyReport(T)` directement (fixtures gelées, CA-V8-060) et `runViewSnapshot(T)` — mêmes fonctions, deux modes, **CA-V8-060 testé dans les deux modes** ✔.
- Tests : `NODE_ENV=test` + transport mail `jsonTransport` ; `recentSentMails()` = 2 e-mails pour la fixture 3 abonnés (2 ACTIVE + 1 EXPIRED exclu) ; 0 réseau (CA-V8-065) ; l'échec SMTP simulé → `email_status='FAILED'`, autres vendeurs traités (CA-V8-069).

### 11.4 Sûreté opérationnelle

- Idempotence stricte ⇒ double tir cron/retry **sans double envoi** (`monthly_metrics` PK + garde `email_status IS NULL` + `ON CONFLICT DO UPDATE … WHERE`) — CA-V8-063.
- Cron prod ne tourne que sur déploiement production (docs Vercel) ⇒ pas de bilan en preview.
- `CRON_SECRET` absent → 401 systématique (jamais 200 ouvert) — fail-closed.
- K9 (taux d'envoi ≥ 95 %) : surveiller la 1ère exécution du 1er ; runbook `journal.md` + alerte admin si `FAILED > 0` (renvoi manuel = **V9**, PO-V8-08 — hors V8).

---

## 12. Rollback · Tests · Risques

### 12.1 Rollback

| Niveau | Action | Impact existant |
|---|---|---|
| **Code** | Redeploy commit précédent (ou `AUTO_APPROVE_V8=false` pour la publication directe seule) | Aucun — aucun handler existant supprimé ; `AUTO_APPROVE_V8=false` → `PENDING` immédiat (R-V8-01) |
| **Tri/badges** | Revert du bloc `queryCatalogPage` + du LEFT JOIN (PR ciblée) ; boost/badges disparaissent (**dérivés** — aucune écriture à annuler) | Catalogue retrouve l'ordre V6.7+V7 exact |
| **Données** | `DROP TABLE IF EXISTS monthly_metrics, storefront_profiles, auto_approved_products; ALTER TABLE seller_subscriptions DROP COLUMN IF EXISTS payment_method, DROP COLUMN IF EXISTS payment_reference;` — produits auto-approuvés **restent AVAILABLE** (jamais re-basculés) | Zéro objet pré-V8 touché ; 001→019 intactes ; `notification_type` jamais modifié |
| **Documents** | Cahiers V1→V7 **jamais** modifiés ; `docs/api.md` v2.8 reste (documente l'état livré) ; cahier V8 amendé par `@cahier-des-charges` (§14) | Traçabilité |

### 12.2 Feature flag `AUTO_APPROVE_V8`

`config.ts` (zod, défaut `'true'` en prod ; `'false'` restaure V7 exactement pour la création) — rollback d'incident en 1 redéploiement, sans migration, sans toucher aux cahiers (plan B R-V8-01). Le boost tri n'a **pas** de flag (dérivé, §6) ; rollback = revert code.

### 12.3 Tests — stratégie (les 75 CA-V8-xxx, inchangés sauf §14)

Pyramide : unitaires (`storeBadge`, éligibilité, calcul métriques, zod ref params) → intégration `node --test` par fichier de test (pattern `test/*.test.ts` du repo) sur base de recette pré-peuplée → grille bout-en-bout `@tester` (§9 cahier, 14 scénarios). **Ordre d'exécution des verrous (rejoués avant toute merge V8)** : CA-V8-003/004/005/006, puis 080/082/083.

Greps de recette (à exécuter et citer — CA-V8-016/036/038/049/055/071/082/083) :

```bash
grep -rnE 'eligib|AUTO_APPROV|autoApproved' server/src          # CA-V8-016 — hors (a) module décision, (b) trace, (c) retrograde/admin-approvals
grep -rnE 'storefront|subscription|payment_reference|auto_approv' server/src --include='*order*' --include='*payment*' --include='*checkout*' --include='*payout*' --include='*cart*'   # CA-V8-083 → 0
grep -rnE 'storefront_listings|subscription_id|STOREFRONT' server/src --include='*order*' --include='*payment*' --include='*checkout*'                                # CA-V8-082 → 0
git diff fix/v6-on-799a7ab -- 'server/src/*order*' 'server/src/*payment*' 'server/src/*checkout*' 'server/src/*payout*' 'server/src/*cart*'   # → 0 ligne
grep -rniE 'payment_reference|paymentReference' server/src    # hors (service souscription, repos/serializers admin+proprio) → 0
grep -rniE 'collection_address|collecte_address|collecteAddress|Sandaga' server/src web/src   # CA-V8-044/049 — hors (a) module profil, (b) lecture SQL trusted ops, (c) tests ; jamais UI/API (§14.D)
grep -rn 'ALTER TYPE\|CREATE TRIGGER' server/migrations/020_storefront_v8.sql                    # → 0
```

État au 18/11/2026 (socle) : **les trois premiers greps sont déjà à 0** (exécution sur `fix/v6-on-799a7ab`, cf. en-tête) — V8 part d'un pipeline propre.

### 12.4 Matrice de risques (propriétaires, actions, plans B) — fusion cahier §7 + risques d'architecture

| ID | Risque | Niveau | Action (propriétaire) | Plan B |
|---|---|---|---|---|
| R-V8-01 | Auto-approbation trop large → contenu indésirable publié | 🔴 Critique | Double verrou éligibilité (§4.1) ; rétrogradation F8 ; `AUTO_APPROVE_V8` ; K4 < 5 % ; @backend+@cahier | Flag `false` — retour modération en 1 deploy |
| R-V8-02 | Incompréhension vendeur (publié sans validation) | ⚠️ Important | Message `/mon-abonnement` + badge « Boutique Vérifiée » explicite ; FAQ admin ; @frontend | Support ReVends |
| R-V8-03 | Boost perçu injuste ; Vitrine « dégradée » | ⚠️ Important | Communication ; K6/K7 ; « Cercle des 10 » inchangé sauf tri par défaut ; @chef+@frontend | Arbitrage chef de projet (Vitrine avant Découverte ?) |
| R-V8-04 | Fuite `collecte_address` | 🔴 Critique | CA-V8-044/049 en pré-recette ; allowlist serializer public ; 0 log ; @securite+@tester | Retirer l'adresse du V8 (garder branding) |
| R-V8-05 | Référence de paiement journalisée/exposée | ⚠️ Important | CA-V8-055 ; masquage `logger` ; serializers admin/proprio seulement ; @securite | Rotation références |
| R-V8-06 | Double envoi bilan (retry/cron) | ⚠️ Important | PK + `ON CONFLICT … WHERE email_status IS NULL` ; CA-V8-063 ; @backend | Renvoi manuel = V9 |
| R-V8-07 | Cron Vercel non fiable | ⚠️ Important | **PO-V8-06 clos** ; exécution dev in-process ; K9 ≥ 95 % surveillé ; @deploy-ops | Endpoint admin émission manuelle (V9) |
| R-V8-08 | XSS description boutique | ⚠️ Important | React échappé ; pas de `dangerouslySetInnerHTML` ; axe ; @frontend+@tester | CSP helmet bloque inline |
| R-V8-09 | Rétrogradations massives → perte de confiance | ⚠️ Important | K4 ; `admin_actions` ; revue hebdo mois 1 ; @cahier+@chef | Durcir éligibilité (ancienneté) |
| R-V8-10 | ALTER perçu comme rupture d'additivité | ⚠️ Important | CA-V8-001/002 redéfinissent V7/V8 ; 2 colonnes nullables, 0 ligne réécrite ; communication ; @chef | Plan B PO-V8-05 : `subscription_payment_refs` 1:1 (migration 021) |
| R-V8-11 | Pagination instable au nouveau tri | ℹ️ Mineur | Tie-break `id` ; CA-V8-035 ; @backend | Keyset pagination |
| R-V8-12 | CA-V5-150 de fait amendé (éligibles) | ⚠️ Important | Dérogation **consignée** (V8-D2) ; double verrou test CA-V8-012/079 ; @cahier | Revert F1 (PR flag) |
| **R-V8-B01** | ~~`x-cron-secret`/GET-POST cahier ≠ Vercel réel~~ → **CLOS (§14.F clos 18/11/2026)** | ✅ Clos | Décision actée : endpoint **GET+POST** ; auth dual `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) **ou** `x-cron-secret` (manuel) ; comparaison à temps constant ; fail-closed (401 si secret absent) ; **1 cron quotidien `0 6 * * *` + dispatch interne** (1er = bilan, dernier jour = relevé, sinon noop). Cahier PO-V8-06 amendé sur ce point ; @backend+@deploy-ops | Cron externe (GitHub Actions / cron-job.org) → POST avec header — même endpoint |
| **R-V8-B02** | ~~`pdfkit` refusé~~ → **CLOS (§14.G clos 18/11/2026)** : pdfkit **accepté** | ✅ Clos | `pdfkit@0.20.2` consignée (seule nouvelle dépendance) ; **`npm audit` obligatoire AVANT installation, rapport joint à la recette** (CA-V8-078) — aucune vulnérabilité critique sinon retour chef de projet ; @backend+@securite | PDF maison 1 page (gabarit fixe) |
| **R-V8-B03** | ~~Hobby : quota crons / imprécision~~ → **CLOS (§14.F clos)** | ✅ Clos | 1 job quotidien `0 6 * * *` retenu (quota Hobby OK, 1 job/jour) ; imprécision ± 59 min sans impact (bilan du mois écoulé) ; dispatch interne dans `runMonthlyReportIfDue` ; @deploy-ops | Scheduler externe |
| **R-V8-B04** | ~~Trace auto-approbation polluant `admin_actions`~~ → **CLOS (§14.A clos 18/11/2026)** : R2 retenue | ✅ Clos | `auto_approved_products` (table système dédiée) ; `admin_actions` strictement réservé aux actions admin (`product.auto_approved_retrograded`) ; @backend | R1 écartée — ne pas implémenter |
| **R-V8-B05** | `monthly_metrics.ca_fcfa INTEGER` overflow (> 2,1 Mds FCFA/mois) ou `views_sum` cumul 1er bilan > 2,1 Mds | ℹ️ Mineur | Mesurer K15 au M+1 ; recette avec fixture grande boutique ; INT conservé (consigne exacte) | `ALTER … TYPE BIGINT` (additif, sûr) — V8-bis |
| **R-V8-B06** | Cron relevé (dernier jour) KO → delta = cumul au bilan | ℹ️ Mineur | Toléré par conception (libellé « 1er relevé » impossible ici — libellé neutre) ; log + métrique | Bilan procède, vues = delta vs relevé 1er précédent ou cumul ; aucune erreur |
| **R-V8-B07** | `CASE` ORDER BY + LIMIT 48 sur 10k produits > 2 ms (CA-V8-034) | ⚠️ Important | Mesure `EXPLAIN ANALYZE` en recette ; LEFT JOIN LATERAL indexé (`uq_one_active_subscription_per_seller`) ; @backend+@tester | Tri en deux passes (ids palier puis merge) — hors scope tant que mesuré |
| **R-V8-B08** | Adresse collecte visible quelque part (surface oubliée : admin list, logs, Stats) | ⚠️ Important | Allowlist unique côté serializer ; grep CI CA-V8-049 ; revue @securite ; **0 occurrence dans `GET /api/subscriptions/me/stats`** (réponse auditée) | Retirer F4-adresse |
| **R-V8-B09** | `storefront_profiles` créée par un non-acheteur… n/a ; upload abusif (storage Blob 2 Mo×N) | ⚠️ Important | Rate-limit global `/api` (300/min) + 2 Mo max + UUID ; quota fichiers/jour ? **aucun** en V8 — risque accepté (comptes vendeur authentifiés) | Limite N fichiers/profil (actuellement 1 logo + 1 bannière par vendeur, remplace) |
| **R-V8-B10** | ALTER `seller_subscriptions` refusé en arbitrage final | ⚠️ Important | PO-V8-05 plan B : `subscription_payment_refs(subscription_id PK, payment_method, payment_reference)` migration 021 — **documenté, non chiffré** ; bascule = ajout table + branche service, sans impact autre | 021 |

**Risques ouverts après ce document** : aucun blocage d'arbitrage — tous les points §14.A/B/C/D/F/G sont **clos** par le chef de projet (18/11/2026). Restent : R-V8-03 (communication chef de projet — payant avant Vitrine), R-V8-B05/B06/B07 (mesurés en recette, plans B documentés), R-V8-B08 (revue @securite pré-recette). Tous les autres sont atténués par un critère de recette ou un flag.

### 12.5 Mapping vers les CA-V8-xxx

| CA | Conforme via |
|---|---|
| CA-V8-001 | §2 (2 colonnes nullable + 3 tables — R2 retenue) — **amendé** : 3 tables au lieu de 4 (§14.A/B clos) ; preuve `information_schema` post-020 |
| CA-V8-002 | §2.0/§3 (001→019 byte-identiques ; `grep ALTER TYPE|CREATE TRIGGER` → 0) |
| CA-V8-003/004/006 | §4 (chemin création inchangé hors statut initial) ; greps §12.3 — **dérogation V8-D2 consignée** (seule acceptée) |
| CA-V8-005 | Aucune route existante supprimée (§13.1) ; suites rejouées |
| CA-V8-010→019 | §4 (éligibilité transactionnelle, trace, rétrogradation, V6.4, quota) — avec R2 : CA-V8-015/016 inchangés |
| CA-V8-020→027 | §5 (badge dérivé, SQL LATERAL, révocation paresseuse, `no-store`, axe) |
| CA-V8-030→038 | §6 (CASE tri par défaut seul ; EXPLAIN < 2 ms ; golden master tris explicites) |
| CA-V8-040→049 | §7 (R1/R2/R3, Blob existant, magic bytes, UUID, 0 fuite adresse, XSS inerte, `alt`/AA) — **routes POST→PUT** (§14.D) |
| CA-V8-050→057 | §13.1 E1 (obligatoire à la souscription), E3 (file admin) ; validation regex exacte §13.1 ; plan B PO-V8-05 |
| CA-V8-060→072 | §8 (algorithme, idempotence, borne T, module partagé P12), §9 (PDF hors-ligne, 7 lignes, `%PDF-`), §11 (2 modes) — amendés : persistance `monthly_metrics` au lieu de `storefront_monthly_reports`/`storefront_view_snapshots` (§14.B clos) ; `views_baseline`/`email_status`/`sent_at` (prop. A, §14.C clos) |
| CA-V8-075→079 | §7.3/§8/§10 (allowlists, 0 PII), §12.3 (gates), §4 (CA-V8-079 4 couples) |
| CA-V8-080/082/083 | Greps §12.3 — socle déjà à 0 ; rejeu en recette ; `git diff` pipeline = 0 ligne |
| CA-V8-081 | §4 (quota hors createProduct), §6 (0 écriture tri) |
| CA-V8-084 | §8.4 (borne `ends_at > T`) + §3 (migration test) |
| CA-V8-085 | §13.5 — `docs/api.md` **v2.8** par `@backend` (hors ce document) ; ce cahier/architecture n'amendent pas `api.md` |

---

## 13. Décisions d'exécution, contrat v2.8, verrous, Done

### 13.1 Routes — carte complète

**Nouvelles (7) :**

| # | Méthode & chemin | Auth | Succès | Codes d'erreur nouveaux |
|---|---|---|---|---|
| R1 | `PUT /api/storefront/profile` (multipart) | owner | `200` | `INVALID_IMAGE`, `FILE_TOO_LARGE` (429/413 existants réutilisés quand possible) |
| R2 | `DELETE /api/storefront/profile/logo` | owner | `200` | — |
| R3 | `DELETE /api/storefront/profile/banner` | owner | `200` | — |
| R4 | `GET /api/subscriptions/me/stats` | owner | `200` | — |
| R5 | `GET /api/admin/auto-approvals` | admin | `200` | — |
| R6 | `POST /api/admin/products/:id/retrograde` `{reason}` | admin | `200` | `NOT_AUTO_APPROVED`, `INVALID_STATUS`, `REASON_TOO_SHORT`(400→VALIDATION_ERROR) |
| R7 | `GET\|POST /api/cron/monthly-report` | cron secret | `200` | `UNAUTHENTICATED` (401, fail-closed) |

**Modifiées (additif, contrat v2.8 — aucune supprimée, aucune renommée) :**

| # | Route | Changement | Nature |
|---|---|---|---|
| E1 | `POST /api/subscriptions` | **corps étendu obligatoire** : `paymentMethod ∈ wave\|orange_money\|virement`, `paymentReference` (trim, 4–64, regex `^[A-Za-z0-9][A-Za-z0-9 .\-_/]{2,62}$`) → sinon `400 INVALID_PAYMENT_METHOD` / `400 PAYMENT_REFERENCE_REQUIRED` / `400 INVALID_PAYMENT_REFERENCE` ; réponse `201` inchangée | **Rupture assumée** (cahier F5/CA-V8-050) — dérogation aussi consignée |
| E2 | `GET /api/storefront/:slug` | + `logoUrl?`, `bannerUrl?`, `publicDescription?` (si `ACTIVE` et profil présent) | Additif, lecture publique |
| E3 | `GET /api/admin/subscriptions` | + `paymentMethod`, `paymentReference` (ou libellé « référence absente » si NULL) | Additif, admin |
| E4 | `GET /api/subscriptions/me` | **RETENU (§14.D clos)** : + bloc `profile { logoUrl, bannerUrl, publicDescription, collecteAddressSet }` (lecture owner ; `collecteAddressSet: boolean` **uniquement** — jamais la valeur, jamais `collecte_address`) ; la lecture est ainsi possible côté front sans exposer l'adresse | Additif (même classe que E2 — acté) |
| E5 | `GET /api/products`, `GET /api/products/:id` | + champ additif `sellerBadge` par carte/fiche (`'pro'\|'verifiee'\|'boutique'\|null`) | Additif |
| E6 | `docs/api.md` | v2.7 → **v2.8** (livrable `@backend`, CA-V8-085) : 7 routes + 6 extensions + tous les codes (`PAYMENT_REFERENCE_REQUIRED`, `INVALID_PAYMENT_METHOD`, `INVALID_PAYMENT_REFERENCE`, `NOT_AUTO_APPROVED`, `INVALID_STATUS`, `INVALID_IMAGE`, `FILE_TOO_LARGE`, `REASON…`) + encart « routes V7 (8) inchangées — 8 routes listées « inchangées » » + §13 checklist fusion | Doc seulement |

**Inchangées (verrou)** : les 8 routes V7 listées inchangées au sens fonctionnel strict — seule l'extension de payload E3 leur est ajoutée (E1/E4 en modifient corps/lecture : documentées comme **amendées** par v2.8, pas « inchangées » — précision d'honnêteté au cahier §6.6/CA-V8-085). `POST /api/products` : comportement inchangé sauf statut initial pour les éligibles (V8-D2).

**Nouveaux codes d'erreur (à documenter v2.8)** : `PAYMENT_REFERENCE_REQUIRED`, `INVALID_PAYMENT_METHOD`, `INVALID_PAYMENT_REFERENCE`, `NOT_AUTO_APPROVED`, `INVALID_IMAGE`, `FILE_TOO_LARGE` (+ réutilisés : `INVALID_STATUS`, `UNAUTHENTICATED`, `NOT_FOUND`, `VALIDATION_ERROR`, `STOREFRONT_QUOTA_EXCEEDED`, `SUBSCRIPTION_REQUIRED`…).

### 13.2 Non-négociables conservés — vérification des 6 verrous centraux

| Verrou | Exigence | Comment ce design le respecte | Verdict |
|---|---|---|---|
| CA-V7-003 / CA-V5-069 | Non-abonné, 11e création après SOLD → 201 | `createProduct` : aucune lecture d'abonnement pour les non-éligibles ; statut initial décidé par l'éligibilité seule ; quota jamais consulté | ✅ (V8-D1) |
| CA-V7-004 / CA-V5-070 | Bouton « Vendre » jamais conditionné | 0 ligne touchée au point d'entrée ; `SellView` inchangé ; grep §12.3 | ✅ |
| CA-V7-033 / 037c | Refusée boutique reste vendable ; pipeline intact | 0 écriture pipeline ; greps §12.3 ; statut boutique dérivé | ✅ |
| CA-V7-037c/038 | 0 logique abonnement hors nouvelles routes | V8-D4 dans `products.repository.ts` : **extension unique** du point de tri (CASE) — non cotée « écriture » ; quota jamais lu hors listings ; greps | ✅ (étendu, comme CA-V8-038 l'exige) |
| CA-V5-150 | 5 étapes, commission 10 %, ≥ 1 photo | Commission `COMMISSION_RATE` inchangée (aucune réimplémentation — §8.4) ; **statut initial = seule sous-clause amendée** (V8-D2, consignée cahier §8/§2.2) | ✅ (dérogation consignée unique) |
| V6.4 / CA-V8-018 | Aucune sollicitation vendeur avant PAID | Auto-approbation ⇒ 0 notification (§4.2) ; rétrogradation notifie `article_rejected` **après** publication (acte admin) ; bilan = e-mail de service au vendeur lui-même, **jamais** de sollicitation ; `notification_type` intact | ✅ |

### 13.3 Fichiers à créer / modifier (cible `@backend` + `@frontend`)

**Serveur — création**

| Fichier | Rôle |
|---|---|
| `server/migrations/020_storefront_v8.sql` | DDL §2 (rejouable) |
| `server/src/utils/storefront-badges.ts` | `storeBadge()` + type — ou fusion possible dans `utils/storefront.ts` (1 import) |
| `server/src/utils/bilan-pdf.ts` | Rendu PDF (pdfkit) — gabarit 7 lignes |
| `server/src/services/storefront-reports.service.ts` | `computeMonthlyMetrics`, `runMonthlyReport`, `runViewSnapshot`, `runMonthlyReportIfDue` — **module partagé** (P12) |
| `server/src/repositories/monthly-metrics.repository.ts` | Accès `monthly_metrics` (upsert idempotent, lecture Stats/12 mois) |
| `server/src/repositories/storefront-profiles.repository.ts` | Upsert profil, lecture owner/public(ACTIVE) |
| `server/src/services/storefront-profile.service.ts` | R1/R2/R3 (validation magic bytes, taille, graphemes via `Intl.Segmenter`, suppression ancien blob) |
| `server/src/repositories/auto-approved.repository.ts` | `insertAutoApprovedProduct`, lookup garde rétrogradation (R2) |
| `server/src/routes/admin-v8.routes.ts` | R5, R6 (monté sous `/api/admin`) |
| `server/src/routes/cron.routes.ts` | R7 (mount `/api/cron`) |
| `server/test/storefront-v8.*.test.ts` | Suites V8 (éligibilité 6 cas, tri golden master, stats, bilan idempotent, PDF bytes) |

**Serveur — modification minimale (additive)**

| Fichier | + |
|---|---|
| `services/products.service.ts` | éligibilité + statut initial (§4.2) |
| `repositories/products.repository.ts` | `insertProduct` (param + `RETURNING id, status`), `selectActiveEligibleSubscription`, `CARD_SELECT`/fiche + `LEFT JOIN LATERAL badge` + colonne `seller_badge` |
| `repositories/admin.repository.ts` | 0 édition — `insertAdminAction` réutilisée uniquement pour la rétrogradation (§4.5) |
| `routes/subscriptions.routes.ts` | +1 handler `GET /me/stats` |
| `routes/storefront.routes.ts` | +R1, R2, R3 (ordre littéral avant `/:slug`) |
| `routes/admin-subscriptions.routes.ts` | +`paymentMethod`, `paymentReference` dans la sérialisation liste (E3) |
| `mail/templates.ts`, `mail/mailer.ts` | §9.4 (MailEvent + `attachments?`) |
| `app.ts` | +2 lignes montage (`/api/admin` nouveau routeur, `/api/cron`) — 0 middleware retiré |
| `config.ts` | +`autoApproveV8`, lecture `CRON_SECRET` (déjà la convention env) |
| `jobs/run.ts` | +`cron.schedule('0 6 * * *', …)` (§11.3) |
| `middleware/upload.ts` | +`uploadStorefrontAsset` (logo ≤ 2 Mo · bannière ≤ 4 Mo, 1 fichier) |
| `vercel.json` | +`crons` : **1 job** `0 6 * * *` (§11.2, §14.F clos) |
| `server/package.json` | +`pdfkit@0.20.2` (**après `npm audit` — §14.G clos), +`@types/pdfkit` (dev) |

**Web — création / modification**

| Fichier | + |
|---|---|
| `components/storefront/SellerBadge.tsx` | Badge de palier (libellés mapés depuis `sellerBadge`, `aria-label` complet, contraste AA — CA-V8-027) |
| `pages/MySubscriptionPage.tsx` | +onglet « Statistiques » (7 lignes + historique 12 mois + état envoi) |
| `pages/MySubscriptionPage.tsx` | +bloc branding (upload logo/bannière, description, adresse collecte — saisie `textarea` écriture seule 10–500, indicateur « renseignée ✓ » ; jamais réaffichée) |
| `views/StorefrontView.tsx` | +bloc branding public (logo/bannière/description, `alt` sémantiques) — rendu **si fourni && ACTIVE** ; sinon page V7 inchangée |
| `pages/admin/AdminSubscriptionsPage.tsx` | +colonnes méthode/référence (+ « référence absente ») (E3) |
| `components/site/*Card.tsx`, `views/ProductView.tsx` | +`SellerBadge` (via `sellerBadge` API — CA-V8-026) |
| `lib/storefront.ts`, `lib/storefront.types.ts` | +helpers `updateStorefrontProfile`, `deleteStorefrontLogo|Banner`, `getMyStats` + types |
| `App.tsx` | aucune route nouvelle (Stats = onglet existant ✔) |
| `SellView.tsx` | **0 ligne** (CA-V8-004) |

### 13.4 Définition de Done — verdict binaire (portée : ce document)

| # | Exigence de la mission | État | Preuve |
|---|---|---|---|
| 1 | Un seul fichier du livrable, aucun autre chemin touché | ✅ | `docs/architecture-v8-hebergement-boutique.md` ; `git status --porcelain` → 1 fichier (§13.6) |
| 2 | Vue d'ensemble additive + 10 décisions V8-D1..D10 | ✅ | §1 |
| 3 | DDL 020 complète : ALTER 2 colonnes + **3 tables** (`storefront_profiles`, `monthly_metrics`, `auto_approved_products`) + index ; seed inchangé | ✅ | §2 (DDL), §2.5 |
| 4 | Runbook migration manuelle prod (`RUN_MIGRATIONS=false`) | ✅ | §3 |
| 5 | Auto-approve dans `createProduct` avec RETURNING + trace R2 (retenue) | ✅ | §4, §14.A |
| 6 | `storeBadge()` dérivé | ✅ | §5 |
| 7 | CASE tri par défaut uniquement | ✅ | §6 |
| 8 | Upload Blob existant + 3 endpoints + payload boutique public **sans casser le contrat** | ✅ | §7 |
| 9 | Stats endpoint | ✅ | §8 |
| 10 | Stratégie PDF **unique** (pdfkit 0.20.2, vérifié npm) | ✅ | §9 |
| 11 | Contact : réutilisation du motif anti-spam existant (Turnstile non introduit, documenté) | ✅ | §10 |
| 12 | Cron in-process dev + Vercel Cron prod + `CRON_SECRET` ; **correction GET/Bearer signalée** | ✅ | §11 |
| 13 | Rollback / Tests / risques / mapping CA-V8-xxx | ✅ | §12 |
| 14 | Verdict binaire + DoD | ✅ | §13.4/13.5 |
| 15 | Skills : plan-le-first, gestion-risques, auto-revue, definition-done, verifie-toujours, docs-officielles | ✅ | En-tête (preuves exécutées), §12.4, §13.6 |

**Ce document est DONE en tant que livrable.** Les arbitrages §14.A/B/C/D/F/G sont **clos** (18/11/2026) — la livraison V8 peut passer à `@backend` (VERDICT ci-dessous).

### 13.5 Contrat `docs/api.md` v2.8 — note de fusion (livrable `@backend`, CA-V8-085)

`docs/api.md` reste **v2.7** à la date du document. Sa fusion en **v2.8** est due par `@backend` : ajout des 7 routes + 6 extensions (E1–E6, §13.1), tous les codes d'erreur V8, encart « inchangées » (les 8 routes V7 — avec la précision d'honnêteté : E3 étend le payload admin, E1/E4 amendent corps/lecture — à qualifier explicitement), checklist de fusion. **Ce document n'amende pas `api.md`** (cahier §6.8/CA-V8-085).

### 13.6 Auto-revue (une ligne)

> Auto-revue v1.1 (arbitrages intégrés) : 4 défauts détectés puis tranchés — (1) **cron cahier impossible sur Vercel** (POST/`x-cron-secret` → GET/`Authorization: Bearer` + dual-auth) → **acté §14.F (dual-auth + 1 cron quotidien `0 6 * * *`)** ; (2) **`monthly_metrics` ne peut pas à lui seul porter les 2 relevés + le bilan** → `views_baseline`/`email_status`/`sent_at` → **acté §14.C (intégrées au DDL §2.1.3)** ; (3) **`admin_actions.admin_id NOT NULL`** → **R2 RETENUE §14.A (`auto_approved_products`)** ; (4) **`pdfkit`/`jspdf` absents du repo** → pdfkit 0.20.2 **acté §14.G** ; `npm audit` obligatoire avant installation. Correction documentaire : `GET /api/subscriptions/me/stats` est le nom gravé ; E4 acté avec `collecteAddressSet` uniquement (jamais la valeur) ; §14.D clos (R1+R2+R3, pas de route détail admin, collecte_address = SQL trusted) ; §14.B clos (fusion monthly_metrics, re-sync cahier par @cahier) ; CA-V8-085 précisé (E1/E4 ≠ « inchangées »). Relecture finale : identifiants uniques (R1–R7 routes / R1–R2 traçabilité — désambiguïsé §4.3, E1–E6, R-V8-01..12 + R-V8-B01..10, §14.A–H), aucune contradiction silencieuse avec les 10 décisions PO-V8 (D2/D7 seules amendées et signalées). Aucun fichier hors ce document n'a été écrit.

### 13.7 VERDICT

**Architecture V8 COMPLÈTE, ADDITIVE et ACTIONNABLE — verdict binaire sur le livrable architectural : ✅ DONE.**

**Autorisation de passage à `@backend` : ACCORDÉE (arbitrages §14.A/B/C/D/F/G clos le 18/11/2026).** Conditions d'exécution, désormais uniquement opérationnelles : (1) `npm audit` avant `npm install pdfkit@0.20.2` (rapport joint à la recette, CA-V8-078 — aucune vulnérabilité critique tolérée) ; (2) migration `020_storefront_v8.sql` appliquée manuellement avant le code (§3) ; (3) `@cahier-des-charges` re-synchronise le cahier (§14.B) — sans quoi les greps/preuves CA-V8 v1.0 référenceraient des tables inexistantes ; (4) `@backend` fusionne `docs/api.md` v2.8 (§13.5, CA-V8-085). Les décisions PO-V8-01→08 sont toutes intégrées sans les rouvrir ; la cohérence cahier ↔ consignes du 18/11 est rétablie par amendements consignés (§14.A/B/C/D/F/G), pas par contournement.

---

## 14. Écarts vs cahier v1.0 et arbitrages — **tous clos le 18/11/2026**

> Chaque point : **DÉCISION ACTÉE par le chef de projet le 18/11/2026** (arbitrages définitifs). Le cahier `docs/cahier-des-charges-v8-hebergement-boutique.md` sera re-synchronisé par `@cahier-des-charges` en conséquence (fusion monthly_metrics, tables, colonnes, cron, pdfkit) ; `docs/api.md` devient v2.8 via `@backend` (CA-V8-085).

**§14.A — Traçabilité d'auto-approbation : R2 RETENUE** — ✅ **Clos 18/11/2026**
- **Décision actée** : **R2** — 3e table `auto_approved_products(product_id PK, seller_id, subscription_id, created_at)` (+ index `subscription_id, created_at DESC` et `created_at DESC`). F1/F8 et CA-V8-014/015/016 inchangés ou quasi inchangés (grep sur la nouvelle table).
- R1 écartée (admin_actions détourné, `admin_id=sellerId` ambigu, historique admin pollué). Plan B sans objet. Risque R-V8-B04 → **clos**.

**§14.B — Fusion `storefront_monthly_reports` + `storefront_view_snapshots` → `monthly_metrics`** — ✅ **Clos 18/11/2026** (confirmée par le chef de projet)
- Table unique (PK `(subscription_id, period)`), ligne « relevé » (cumul, `views_baseline`, dernier jour) puis upsert « bilan » (delta + `sales_count`/`ca_fcfa` + `email_status`/`sent_at`) au 1er. Idempotence CA-V8-063 inchangée en substance (UNIQUE seller×month ↔ subscription×period). `storefront_monthly_reports` et `storefront_view_snapshots` **n'existent pas** en V8-livré.
- Le DDL (§2.1.3) **couvre CA-V8-060/063/069/070/071** : sélection `ACTIVE` à borne T (CA-V8-060), PK + `email_status IS NULL` + `ON CONFLICT … WHERE` (CA-V8-063), `email_status SENT|FAILED` + `sent_at` (CA-V8-069), `views_baseline` interne (CA-V8-070), `notification_type` intact + aucun template modifié (CA-V8-071 — le bilan n'est pas une notification).
- **Action restant due** : `@cahier-des-charges` re-synchronise le cahier v1.0 (CA-V8-001/015/060/063/065/067/069/070/071/085) — aucun CA supprimé, seules les tables/preuves changent.

**§14.C — Colonnes internes de `monthly_metrics` : Proposition A RETENUE** — ✅ **Clos 18/11/2026**
- **Décision actée** : `views_baseline INTEGER NOT NULL DEFAULT 0` (cumul au relevé — nécessaire pour recalculer le delta M+1 après écriture du bilan), `email_status TEXT NULL CHECK (IN 'SENT','FAILED')` (CA-V8-069 : `FAILED` persisté, `SENT` terminal — PO-V8-08), `sent_at TIMESTAMPTZ NULL` — **intégrées au DDL §2.1.3** (table créée avec, aucune colonne existante touchée).
- CA-V8-063/069/070 deviennent prouvables (ligne d'audit idempotente + `email_status` + `sent_at`).

**§14.D — Routes boutique et surface adresse collecte : R1+R2+R3 + E4 RETENUS ; pas de route détail admin** — ✅ **Clos 18/11/2026**
- **Décision actée** : 3 endpoints — `PUT /api/storefront/profile` (multipart, ≤ 2 fichiers) + `DELETE /api/storefront/profile/logo` + `DELETE /api/storefront/profile/banner` ; CA-V8-040/041/047/085 amendés côté cahier (POST→PUT, @cahier-des-charges).
- **E4 retenu** : `GET /api/subscriptions/me` + bloc `profile { logoUrl, bannerUrl, publicDescription, collecteAddressSet }` (lecture owner ; `collecteAddressSet: boolean` seulement).
- **Pas de route détail admin en V8** : `collecte_address` via **SQL trusted uniquement** — jamais API/UI (admin, propriétaire inclus). Le front branding affiche indicateur `collecteAddressSet` ; rien d'autre. Risque R-V8-B08 → mitigation renforcée (allowlist + grep + revue @securite).

**§14.E — Turnstile sur le contact boutique** — ℹ️ Mineur (non exigé)
- Retenu : motif existant (requireAuth + rate-limit `storefront-contact` 10/10min + zod + CONTACT_SELF + 404 non divulgateur). Turnstile (clé Cloudflare, appel siteverify) : plan B si exigence explicite future — non implémenté par défaut. **Aucun arbitrage rendu, non bloquant.**

**§14.F — Cron Vercel : dual-auth + 1 cron quotidien 06:00 UTC RETENU** — ✅ **Clos 18/11/2026**
- **Décision actée** : **dual-auth** — `Authorization: Bearer <CRON_SECRET>` (envoyé automatiquement par Vercel Cron, HTTP GET) **ou** `x-cron-secret: <CRON_SECRET>` (déclenchement manuel/test) — comparaison à temps constant, **fail-closed** (401 si `CRON_SECRET` absent ou header invalide). Endpoint `GET|POST /api/cron/monthly-report`.
- **1 cron quotidien `0 6 * * *`** (dispatch interne par calendrier UTC : `date = 1er` → bilan(M−1) ; `demain = 1er` → relevé ; sinon `noop`). Variante à 2 jobs **écartée**. Imprécision Hobby « dans l'heure » sans impact (bilan du mois écoulé).
- R-V8-B01/B03 → **clos**. PO-V8-06 amendé sur ces points mécaniques (l'esprit du PO inchangé : Vercel Cron en prod, in-process en dev/tests).

**§14.G — `pdfkit@0.20.2` ACCEPTÉ** — ✅ **Clos 18/11/2026**
- **Décision actée** : `pdfkit@0.20.2` consignée comme seule nouvelle dépendance serveur. **Condition d'installation par `@backend` : `npm audit` exécuté AVANT `npm install pdfkit@0.20.2`, rapport joint à la recette (CA-V8-078)** ; aucune vulnérabilité critique tolérée — sinon arrêt et retour au chef de projet.
- R-V8-B02 → **clos** (condition ci-dessus).

**§14.H — PO-V8-05 plan B (`subscription_payment_refs` 1:1, migration 021)** — ℹ️ Mineur
- Non exécuté ; documenté ; PO-V8-05 (ALTER) **maintenu**. Activation uniquement si l'ALTER était désavoué en arbitrage final (non le cas).

**Récapitulatif : tous les points d'arbitrage §14.A/B/C/D/F/G sont CLOS (18/11/2026). Restent ouverts : §14.E (Turnstile, non exigé) et §§14.H (plan B documenté).**

---

## Annexe A — Références croisées

| Sujet | Référence |
|---|---|
| Cahier source (75 critères) | `docs/cahier-des-charges-v8-hebergement-boutique.md` §2, §4, §6, §7, §10 |
| Architecture V7 (à modifier additivement) | `docs/architecture-v7-hebergement-vendeurs.md` §2 (DDL), §3.5/3.6 (quota/404), §5 (fichiers), §7 (déploiement) |
| Migration précédées | `server/migrations/019_storefront.sql` (style, en-tête), `016_phone_strict_9_chiffres.sql` (regex téléphone), `003_order_events.sql`, `009_soft_delete_perf.sql` |
| Décisions produit | V8-D1..D10 · PO-V8-01..08 (tous clos 18/11/2026) |
| Code | `server/src/services/products.service.ts:160` (`createProduct`), `repositories/products.repository.ts:187` (`insertProduct`, `RETURNING id` actuel), `:426` (`queryCatalogPage`, bloc `sort==='recent'` L499), `jobs/run.ts`, `utils/storage.ts`, `middleware/upload.ts`, `mail/mailer.ts:165` (`sendMail`) |
| Contrats | `docs/api.md` v2.7 (fusion v2.8 due — CA-V8-085) · `docs/api-v7-hebergement-vendeurs.md` · §1.4/§1.5 (exceptions, pagination) |
| Docs Vercel Cron (consultées 18/11/2026) | `Authorization: Bearer $CRON_SECRET`, HTTP GET, prod uniquement, `x-vercel-cron-schedule` non fiable comme frontière de sécurité |
| npm (consulté 18/11/2026) | `pdfkit@0.20.2` (dernière, deps 100 % JS), `jspdf@4.2.1`, `pdf-lib`/`react-pdf` absents du repo |


---

> **MAJ 18/11/2026 (intégration de la revue de code)** : (1) `runViewSnapshot(now, period, kind)` accepte `baseline|sum` ; le 1er pose `views_baseline` (cumul), le dernier jour pose `views_sum` — jamais le delta persisté. (2) Cron monté **avant** la protection CSRF (`/api/cron` n'est pas protégé par double soumission — il s'authentifie par `CRON_SECRET`) ; Vercel Cron utilise toujours `GET` + `Authorization: Bearer`. (3) Déduplication `duplicate` ≠ `SENT` : bilan orpheline = FAILED + trace out-of-box. (4) `collecte_address` JAMAIS exposée (§14.D) — propriétaire/admin inclus (le propriétaire écrit via POST/PUT ; la logistique manuelle passe par SQL trusted). (5) Commission de repli = `config.commissionRate` (floor), jamais « 10 % » codé en dur.
