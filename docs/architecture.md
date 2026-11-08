# ARCHITECTURE TECHNIQUE — ReVends (V2)

| | |
|---|---|
| **Version** | 1.0 (2026-09-20) |
| **Auteur** | Agent architecte, pour l'équipe projet |
| **Statut** | À valider par le chef de projet |
| **Source** | `docs/cahier-des-charges-v2.md` (23 user stories, décisions D1–D12, §8 modèle de données) · `reference/maquette-revends.html` (UI à reproduire) |
| **Versions vérifiées** | Registre npm + docs officielles (Express 5.x, Tailwind v4 + Vite, connect-pg-simple, TypeScript 7) — le 20/09/2026 |

---

## 1. Stack technique retenue

| Couche | Choix | Version vérifiée | Justification |
|---|---|---|---|
| **Runtime** | Node.js LTS | **v22** (machine : 22.23.2) | LTS, ESM natif, compatible Vite 8 (`^20.19 \|\| >=22.12`), compatible connect-pg-simple (`>=22`) |
| **Language** | TypeScript | **~7.0.2** (fallback documenté : 6.0.3) | TS7 = port natif Go (GA 08/07/2026, `latest` npm). Type-check seule (`tsc --noEmit`) : usage non API → « clear to move ». Vite transpile via esbuild, pas tsc. | 
| **Langage (fallback)** | TypeScript | **6.0.3** | Si le tooling d'analyse repose sur l'API compiler (typescript-eslint type-aware, scripts AST) — TS7 ne ship pas encore d'API programmatique stable (attendue en 7.1). Décision : ne PAS activer de règles eslint type-aware en V1, ou shim `@typescript/typescript6`. |
| **Backend** | Express | **5.2.1** (npm `latest`) | REST simple, middleware mature. Express 5 = version courante (migration 4→5 connue : `res.json(obj,status)` supprimé, wildcard `/*splat`, async erreurs propagées automatiquement). |
| **BDD** | PostgreSQL | via `pg` **8.23.0** (driver) | Transactions + `SELECT … FOR UPDATE` requis par le cahier (§7.4, CA-BUY01-03). SQL brut, pas d'ORM : contrôle total des verrous, plus simple qu'un ORM pour ce périmètre. |
| **Sessions** | express-session + connect-pg-simple | 1.19.0 / **10.0.0** | Cookie HTTP-only, session côté serveur en base (persistante aux redéploiements, 7 jours, CA-AUTH02-02). `connect-pg-simple` ≥9.5 PG, prête pour `pg` 8. |
| **Uploads** | multer | **2.4.0** | Stockage disque local `uploads/products/` (RG-MEDIA-1). Multer 1.x = CVE connues → **2.x obligatoire**. |
| **Tâche planifiée** | node-cron | **4.6.0** | `*/1 * * * *` « toutes les minutes » (CA-BUY02-02). ESM-only → package `"type": "module"`. |
| **Validation** | zod | **4.6.5** | Validation serveur de toutes les entrées (§9.5), schémas partagés. |
| **Hachage mdp** | bcryptjs | **3.0.3** | Pure JS → pas de build natif sur Railway (contrairement à bcrypt/argon2). CA-AUTH01-03. |
| **Frontend** | React + Vite + TS | react **19.3.0** · vite **8.3.0** · `@vitejs/plugin-react` 6.1.1 | Stack imposée (compétence @frontend). Vite 8 = ESM-only, Node ≥20.19. |
| **Router front** | react-router | **7.18.4** | Routing déclaratif, guards de rôle. |
| **Stylage** | Tailwind CSS v4 | **4.3.3** + `@tailwindcss/vite` 4.3.3 | CSS-first (import `@import "tailwindcss"`), tokens via `@theme`. Reprend les couleurs de la maquette : `--primary #FF6B35`, `--secondary #004E89`, `--dark #1A1A2E`… |
| **État serveur front** | TanStack Query | v5 (latest) | Cache/listes synchronisées (catalogue, commandes, notifications) + invalidation après mutation. Léger, standard. |
| **Déploiement** | **Railway** (seul) | CLI 5.54.1 connecté | Voir §7. |

### Pourquoi PAS d'ORM, PAS de monorepo toolé

- **Pas d'ORM (Prisma/Knex)** : le cœur métier est du SQL transactionnel avec verrouillage de ligne explicite (`BEGIN; … FOR UPDATE; … COMMIT`). Un ORM ajoute une couche d'abstraction qui gêne plus qu'elle n'aide ici, et alourdit le déploiement (generation client, migrations Prisma). Les migrations sont des fichiers `.sql` bruts exécutés par un petit script `migrate.ts` — lisible, auditable, rien à apprendre.
- **Pas de workspace npm / turborepo** : deux dossiers indépendants `server/` et `web/`, deux `package.json`, deux `node_modules`. Simplicité maximale, build/start Railway trivial. Un monorepo toolé serait surdimensionné pour 3 contributeurs.
- **Pas de mobile en V1** : la cible du cahier V2 est **web responsive** (§1, §4.2). Pas de dossier `mobile/` en V1. Le schéma BDD et l'API REST sont déjà compatibles avec une future app (les endpoints sont agnostiques), mais rien n'est construit pour RN.

---

## 2. Arborescence du projet (cible)

```
revends/
├── README.md
├── .gitignore                 # node_modules, dist, .env, uploads/, .railway
├── docs/
│   ├── cahier-des-charges-v2.md
│   └── architecture.md        # ← ce document
├── reference/
│   └── maquette-revends.html  # UI de référence (@frontend)
│
├── server/                    # API REST + fichiers + front buildé (prod) — CIBLE RAILWAY
│   ├── package.json           # "type": "module"; scripts: dev (tsx watch), build (tsc), start (node dist/index.js), migrate, seed, job:expire
│   ├── tsconfig.json
│   ├── Dockerfile             # multi-stage : node:22 → tsc build → runtime
│   ├── .env.example
│   ├── uploads/
│   │   └── products/          # photos (RG-MEDIA-1) — volume Railway en prod
│   └── src/
│       ├── index.ts           # bootstrap : app + jobs + listen(PORT)
│       ├── app.ts             # app Express : middlewares, routes, static web + uploads, erreurs
│       ├── config.ts          # lecture env (zod), constantes : COMMISSION_RATE=0.10, RESERVATION_MINUTES=15, UPLOAD_DIR, SESSION_SECRET, DATABASE_URL, PORT
│       ├── db/
│       │   ├── pool.ts        # pg.Pool (1 seul pool partagé, aussi utilisé par sessions)
│       │   ├── migrate.ts     # exécute db/migrations/*.sql en ordre, table schema_migrations
│       │   └── migrations/
│       │       ├── 001_init.sql        # schéma complet (voir §4)
│       │       └── 002_seed_categories.sql  # catégories + sous-catégories (D7)
│       ├── middleware/
│       │   ├── auth.ts        # requireAuth (session.role = user) + requireAdmin (403)
│       │   ├── errors.ts      # handler d'erreurs central (zod, pg unique, 404)
│       │   └── upload.ts      # multer config (mimetype réel, ≤5 Mo, 1-4 photos, nom aléatoire)
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── catalog.routes.ts       # public
│       │   ├── categories.routes.ts
│       │   ├── me.routes.ts            # utilisateur connecté (articles, commandes, notifications)
│       │   ├── admin.routes.ts         # requireAdmin uniquement
│       │   └── files.routes.ts         # GET /uploads/products/:file (static sécurisé)
│       ├── services/
│       │   ├── orders.service.ts       # ACHAT : transaction FOR UPDATE (voir §5.1)
│       │   ├── expiry.service.ts       # expiration réservation : tick + lazy (voir §5.2)
│       │   ├── products.service.ts
│       │   ├── payouts.service.ts      # commission, seller_payouts
│       │   └── notifications.service.ts
│       └── jobs/
│           └── expire-reservations.ts  # cron */1 * * * * (D3)
│
└── web/                       # CRA: npm create vite@latest web -- --template react-ts
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts         # plugin vite + tailwindcss + proxy /api et /uploads → localhost:PORT (dev)
    ├── index.html
    └── src/
        ├── main.tsx           # QueryClientProvider + BrowserRouter
        ├── App.tsx            # routes (voir §6.2)
        ├── styles/
        │   └── index.css      # @import "tailwindcss"; @theme (tokens maquette)
        ├── lib/
        │   ├── api.ts         # fetch wrapper (credentials: include, JSON, erreurs normalisées)
        │   └── format.ts      # formatFCFA(n) → "250 000 FCFA", libellés statuts UI
        ├── hooks/
        │   ├── useAuth.ts     # session / me
        │   └── useNotifications.ts  # badge non-lues
        ├── components/        # Navbar, ProductCard, Badge, StatCard, DataTable… (maquette)
        └── routes/
            ├── public/        # Home, Catalog, ProductDetail, Login, Register, AdminLogin
            ├── user/          # UserDashboard, MyArticles, MyOrders, Notifications, Profile, SellForm
            ├── admin/         # AdminDashboard, PendingArticles, AdminOrders, AdminOrderDetail, Payouts, AdminUsers, AdminCategories, AdminHistory
            └── guards.ts      # RequireAuth / RequireAdmin wrappers
```

> En prod, une **seule entité Railway** : Express sert `/api/*`, `/uploads/*` **et** le build statique de `web/dist` (copié dans l'image serveur). → cookie HTTP-only **same-origin**, zéro CORS, zéro 2e service. En dev, Vite proxy `/api` vers `http://localhost:4000`.

---

## 3. Décisions structurantes d'architecture (mapping cahier → implémentation)

| Décision cahier | Implémentation technique |
|---|---|
| D1 (paiement hors-ligne admin) | Aucun webhook/paygate. Endpoint admin `POST /api/admin/orders/:id/confirm-payment` (transaction). |
| D2 (display_name public) | `users.display_name` seul exposé ; les sérialisations API n'incluent **jamais** `name/email/phone` côté volume « public ». Test T22 = vérifier l'absence de ces champs dans les JSON catalogue/fiche. |
| D3 (réservation 15 min) | Constante serveur `RESERVATION_MINUTES=15`. Double mécanisme : lazy + cron (voir §5.2). |
| D4 (statut unique produit) | Enum `product_status` — pas de statut APPROVED. `approved_at/approved_by` portent la traçabilité. |
| D5 / D6 (workflow commande, D6 paiement) | Enum `order_status` à 6 états. `payments.status` séparé. « Paiement reçu » = une transaction (ordre→WAITING_SELLER_PAYMENT + payment→PAID). |
| D7 (catégories hiérarchiques) | `categories.parent_id` auto-référent, max 2 niveaux (contrainte déclenchateur), 5 catégories seed + sous-catégories. |
| D8 (champs complémentaires) | Colonnes `brand, model, age_years, defects, accessories, notes` sur `products`. |
| D9 (modif/suppression) | Règles métier dans `products.service.ts` : modif AVAILABLE → PENDING (re-soumission, `rejection_reason` NULL). Suppression interdite si commande `WAITING_PAYMENT`/`WAITING_SELLER_PAYMENT` (query active). |
| D10 (achat exige connexion) | Front : redirection `/login?next=/articles/:id` ; serveur : 401 sinon. |
| D11 (`CMD-%06d`) | Trigger `BEFORE INSERT` sur `orders` : `'CMD-' || lpad(nextval('orders_number_seq')::text, 6, '0')` → `CMD-000001`… |
| D12 (recherche) | `WHERE name ILIKE '%'||$1||'%'` (insensible casse) + filtre catégorie/sous-catégorie + `ORDER BY` parmi (created_at DESC \| price ASC \| price DESC). Index trigram `pg_trgm` pour la perf. |
| §7.3 commission | `commission = floor(price * 0.10)`, `seller_amount = price - commission`, **stockés sur `orders`** à la création (intégrité historique). |
| §7.8 traçabilité | Chaque action admin sensible insère `admin_actions` **dans la même transaction** que l'action (§9.8, CA-ADM07-01). |
| §8 contraintes d'intégrité | Voir DDL §4 : index partiel unique « une seule commande WAITING_PAYMENT par produit », checks sur statuts, etc. |

---

## 4. Schéma SQL — DDL PostgreSQL

PostgreSQL 15+ (Railway livre PG 16/17). Fichier cible : `server/src/db/migrations/001_init.sql` (exécuté par `migrate.ts`, suivi dans `schema_migrations`).

```sql
-- ============================================================
-- ReVends — 001_init.sql  (PostgreSQL 15+)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- recherche ILIKE %mot% (D12)

-- ---------- ENUMS ----------
CREATE TYPE user_role          AS ENUM ('user', 'admin');
CREATE TYPE product_condition  AS ENUM ('Neuf', 'Très bon état', 'Bon état', 'Correct', 'À réparer');
CREATE TYPE product_status     AS ENUM ('PENDING', 'AVAILABLE', 'RESERVED', 'SOLD', 'REJECTED');  -- D4
CREATE TYPE order_status       AS ENUM ('WAITING_PAYMENT', 'PAYMENT_FAILED',
                                        'WAITING_SELLER_PAYMENT', 'SELLER_PAID',
                                        'COMPLETED', 'CANCELLED');                                  -- D5
CREATE TYPE payment_status     AS ENUM ('PENDING', 'PAID', 'FAILED');
CREATE TYPE payment_method     AS ENUM ('MOBILE_MONEY', 'CASH', 'BANK_TRANSFER', 'OTHER');         -- D1
CREATE TYPE payout_status      AS ENUM ('PENDING', 'PAID');
CREATE TYPE notification_type  AS ENUM ('article_submitted', 'article_approved', 'article_rejected',
                                        'order_created', 'payment_confirmed', 'article_reserved',
                                        'reservation_expired', 'seller_paid', 'article_sold');      -- N1..N8

-- ---------- USERS ----------
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    display_name  VARCHAR(50)  NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 50),  -- D2, pseudo public
    name          VARCHAR(100) NOT NULL,      -- nom complet, PRIVÉ
    email         VARCHAR(255) NOT NULL UNIQUE,
    phone         VARCHAR(30)  NOT NULL UNIQUE CHECK (phone ~ '^\+?[0-9 ]{8,20}$'),
    password_hash TEXT         NOT NULL,      -- bcryptjs, CA-AUTH01-03
    role          user_role    NOT NULL DEFAULT 'user',
    accepted_cgu  BOOLEAN      NOT NULL DEFAULT FALSE,  -- CA-AUTH01-01 (bloquant à l'inscription)
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- CATEGORIES (D7, hiérarchique, 2 niveaux) ----------
CREATE TABLE categories (
    id         BIGSERIAL PRIMARY KEY,
    parent_id  BIGINT REFERENCES categories(id) ON DELETE RESTRICT,  -- NULL = catégorie, sin. sous-catégorie
    name       VARCHAR(100) NOT NULL,
    slug       VARCHAR(120) NOT NULL UNIQUE,
    active     BOOLEAN      NOT NULL DEFAULT TRUE,                   -- CA-ADM06
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT categories_no_self_parent CHECK (parent_id <> id)
);
CREATE INDEX idx_categories_parent ON categories(parent_id) WHERE parent_id IS NOT NULL;

-- Max 2 niveaux (pas de sous-sous-catégorie) : trigger
CREATE OR REPLACE FUNCTION enforce_category_depth() RETURNS trigger AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM categories WHERE id = NEW.parent_id AND parent_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'categories: max depth 2 (sous-catégorie seulement)';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_categories_depth BEFORE INSERT OR UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION enforce_category_depth();

-- ---------- PRODUCTS ----------
CREATE TABLE products (
    id              BIGSERIAL PRIMARY KEY,
    owner_id        BIGINT NOT NULL REFERENCES users(id),
    category_id     BIGINT NOT NULL REFERENCES categories(id),       -- sous-catégorie (validée serveur)
    name            VARCHAR(120) NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),  -- CA-SELL01-01
    slug            VARCHAR(140) NOT NULL UNIQUE,
    description     TEXT   NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
    condition       product_condition NOT NULL,
    price           INTEGER NOT NULL CHECK (price BETWEEN 500 AND 10000000),  -- RG-PROD-1, entier FCFA
    location        VARCHAR(100) NOT NULL CHECK (char_length(location) BETWEEN 3 AND 100),
    status          product_status NOT NULL DEFAULT 'PENDING',       -- D4
    rejection_reason VARCHAR(255),                                   -- obligatoire si REJECTED (RG-REFUS, liste fermée)
    approved_at     TIMESTAMPTZ,
    approved_by     BIGINT REFERENCES users(id),
    brand           VARCHAR(100),                                    -- D8
    model           VARCHAR(100),                                    -- D8
    age_years       INTEGER CHECK (age_years IS NULL OR age_years BETWEEN 0 AND 100),  -- D8
    defects         TEXT,                                            -- D8
    accessories     TEXT,                                            -- D8
    notes           TEXT,                                            -- D8
    reserved_at     TIMESTAMPTZ,                                     -- D3
    reserved_until  TIMESTAMPTZ,                                     -- D3 : now() + interval '15 minutes'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_rejection_reason CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL),
    CONSTRAINT chk_approval_pair    CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT chk_reserved_pair    CHECK ((status = 'RESERVED') = (reserved_at IS NOT NULL AND reserved_until IS NOT NULL))
);
CREATE INDEX idx_products_owner     ON products(owner_id);
CREATE INDEX idx_products_category  ON products(category_id);
CREATE INDEX idx_products_catalog   ON products(created_at DESC, id) WHERE status = 'AVAILABLE';
CREATE INDEX idx_products_price_asc ON products(price ASC, id)      WHERE status = 'AVAILABLE';
CREATE INDEX idx_products_price_desc ON products(price DESC, id)    WHERE status = 'AVAILABLE';
CREATE INDEX idx_products_moderation ON products(created_at ASC)    WHERE status IN ('PENDING', 'REJECTED');
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);   -- D12

-- ---------- PRODUCT_IMAGES (RG-MEDIA-1 : 1 à 4 photos) ----------
CREATE TABLE product_images (
    id         BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    path       TEXT   NOT NULL,             -- "uploads/products/<uuid>.<ext>" (nom aléatoire)
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    position   SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_product_position UNIQUE (product_id, position)
);
CREATE UNIQUE INDEX uq_one_primary_per_product ON product_images(product_id) WHERE is_primary;  -- 1 seule photo principale

-- ---------- ORDERS ----------
CREATE SEQUENCE orders_number_seq;   -- D11 : trigger avant insertion
CREATE TABLE orders (
    id             BIGSERIAL PRIMARY KEY,
    order_number   VARCHAR(20) NOT NULL UNIQUE,   -- 'CMD-%06d' (D11), rempli par trigger
    product_id     BIGINT NOT NULL REFERENCES products(id),
    buyer_id       BIGINT NOT NULL REFERENCES users(id),
    seller_id      BIGINT NOT NULL REFERENCES users(id),   -- fingerprint du vendeur au moment de la commande (§8)
    amount         INTEGER NOT NULL CHECK (amount > 0),    -- = prix au moment de la vente (§8)
    commission     INTEGER NOT NULL CHECK (commission >= 0),   -- floor(price*0.10), §7.3
    seller_amount  INTEGER NOT NULL CHECK (seller_amount >= 0), -- price - commission (§7.3)
    status         order_status NOT NULL DEFAULT 'WAITING_PAYMENT',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_amount_consistency CHECK (amount = commission + seller_amount)
);
CREATE INDEX idx_orders_buyer  ON orders(buyer_id);
CREATE INDEX idx_orders_seller ON orders(seller_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_payouts ON orders(created_at ASC) WHERE status = 'WAITING_SELLER_PAYMENT';
-- CLÉ un produit RESERVED a exactement UNE commande WAITING_PAYMENT active (§8, CA-BUY01-03)
CREATE UNIQUE INDEX uq_one_active_order_per_product ON orders(product_id) WHERE status = 'WAITING_PAYMENT';

CREATE OR REPLACE FUNCTION set_order_number() RETURNS trigger AS $$
BEGIN
    NEW.order_number := 'CMD-' || lpad(nextval('orders_number_seq')::text, 6, '0');
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_orders_number BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- ---------- PAYMENTS (D1, D6) ----------
CREATE TABLE payments (
    id         BIGSERIAL PRIMARY KEY,
    order_id   BIGINT NOT NULL UNIQUE REFERENCES orders(id),   -- 1 paiement par commande
    amount     INTEGER NOT NULL CHECK (amount > 0),
    method     payment_method NOT NULL,
    status     payment_status NOT NULL DEFAULT 'PENDING',
    paid_at    TIMESTAMPTZ,                 -- renseigné quand status = PAID
    reference  VARCHAR(255),                -- référence fournie par l'admin (D1)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- SELLER_PAYOUTS (CA-ADM04) ----------
CREATE TABLE seller_payouts (
    id         BIGSERIAL PRIMARY KEY,
    order_id   BIGINT NOT NULL UNIQUE REFERENCES orders(id),
    seller_id  BIGINT NOT NULL REFERENCES users(id),
    amount     INTEGER NOT NULL CHECK (amount > 0),      -- = orders.seller_amount
    status     payout_status NOT NULL DEFAULT 'PENDING',
    paid_at    TIMESTAMPTZ,
    reference  VARCHAR(255),
    paid_by    BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_payout_paid CHECK (status <> 'PAID' OR (paid_at IS NOT NULL AND paid_by IS NOT NULL))
);

-- ---------- ADMIN_ACTIONS (V1 §27, §7.8) ----------
CREATE TABLE admin_actions (
    id          BIGSERIAL PRIMARY KEY,
    admin_id    BIGINT NOT NULL REFERENCES users(id),
    action      VARCHAR(50) NOT NULL,       -- 'product.approved' | 'product.rejected' | 'payment.confirmed' | 'seller.paid'
    target_type VARCHAR(20) NOT NULL,       -- 'product' | 'order'
    target_id   BIGINT NOT NULL,
    description TEXT NOT NULL,              -- ex. « Vendeur payé — CMD-000125 — 225 000 FCFA »
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_actions_created ON admin_actions(created_at DESC);

-- ---------- NOTIFICATIONS (V1 §29, §10) ----------
CREATE TABLE notifications (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       notification_type NOT NULL,
    title      VARCHAR(255) NOT NULL,
    message    TEXT NOT NULL,
    read_at    TIMESTAMPTZ,                 -- NULL = non lue (CA-NOT01-01)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

-- ---------- SESSIONS (connect-pg-simple, §9.4) ----------
CREATE TABLE "session" (
    sid    varchar NOT NULL COLLATE "default",
    sess   json NOT NULL,
    expire timestamp(6) NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX idx_session_expire ON "session" (expire);

-- ---------- updated_at générique ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_users_updated      BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON categories      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_products_updated   BEFORE UPDATE ON products        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_orders_updated     BEFORE UPDATE ON orders          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payments_updated   BEFORE UPDATE ON payments        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payouts_updated    BEFORE UPDATE ON seller_payouts  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Seed — catégories (002_seed_categories.sql)

Les 5 catégories D7 + sous-catégories (proposition initiale — validation client voir point ouvert §12.6). IDs explicites pour stabilité des FK.

```sql
INSERT INTO categories (id, parent_id, name, slug) VALUES
  (1, NULL, 'Mode',          'mode'),
  (2, NULL, 'Maison',        'maison'),
  (3, NULL, 'Électronique',  'electronique'),
  (4, NULL, 'Électroménager','electromenager'),
  (5, NULL, 'Loisirs',       'loisirs'),
  (6, 1, 'Vêtements', 'mode-vetements'),
  (7, 1, 'Chaussures', 'mode-chaussures'),
  (8, 1, 'Sacs & accessoires', 'mode-sacs'),
  (9, 1, 'Montres & bijoux', 'mode-montres'),
  (10, 2, 'Mobilier', 'maison-mobilier'),
  (11, 2, 'Décoration', 'maison-decoration'),
  (12, 2, 'Cuisine & arts de la table', 'maison-cuisine'),
  (13, 3, 'Téléphones & tablettes', 'electronique-telephones'),
  (14, 3, 'Ordinateurs', 'electronique-ordinateurs'),
  (15, 3, 'Audio & vidéo', 'electronique-audio'),
  (16, 3, 'Appareils photo', 'electronique-photo'),
  (17, 4, 'Gros électroménager', 'electromenager-gros'),
  (18, 4, 'Petit électroménager', 'electromenager-petit'),
  (19, 5, 'Livres & BD', 'loisirs-livres'),
  (20, 5, 'Jeux & jouets', 'loisirs-jeux'),
  (21, 5, 'Sport & fitness', 'loisirs-sport'),
  (22, 5, 'Instruments de musique', 'loisirs-instruments')
ON CONFLICT (id) DO NOTHING;
SELECT setval('categories_id_seq', GREATEST((SELECT MAX(id) FROM categories), 1));
```

### Seed — admin (script `seed.ts`, PAS en SQL)

Le mot de passe admin doit être haché (bcryptjs) — impossible en SQL brut. Script idempotent exécuté à la première mise en service :

- Lire `ADMIN_EMAIL` / `ADMIN_PASSWORD` (env, jamais hardcodé).
- `INSERT INTO users (display_name, name, email, phone, password_hash, role, accepted_cgu) VALUES ('Administrateur', 'ReVends Admin', $1, '+225 00000000', $2, 'admin', TRUE) ON CONFLICT (email) DO NOTHING;`
- Affichage du login admin dans le README déploiement.

---

## 5. Stratégie cœur : anti-double-commande + expiration

### 5.1 Achat d'un article — transaction avec verrou de ligne (CA-BUY01-01…06, T11)

Dans `orders.service.ts`, sur un `pg.Client` dédié extrait du pool (transaction réelle, pas d'auto-commit) :

```sql
BEGIN;

-- 1. Verrouiller la ligne produit (CA-BUY01-03 : anti double-commande)
SELECT id, owner_id, status, reserved_at, reserved_until, price
  FROM products WHERE id = $1 FOR UPDATE;          -- $1 = product_id

-- 2. Si status = 'RESERVED' ET reserved_until < now() → libération paresseuse d'abord (voir 5.2 lazy)

-- 3. Garde-fous
--    - status est 'AVAILABLE'  sinon → ROLLBACK, 409 « Cet article vient d'être réservé »
--    - owner_id <> buyer_id    sinon → ROLLBACK, 400 « Vous ne pouvez pas acheter votre propre article » (CA-BUY01-05)

-- 4. Créer la commande (order_number rempli par trigger, amount/commission/seller_amount calculés serveur)
INSERT INTO orders (product_id, buyer_id, seller_id, amount, commission, seller_amount, status)
VALUES ($1, $2, $3, $price, floor($price * 0.10), $price - floor($price * 0.10), 'WAITING_PAYMENT');

-- 5. Créer le paiement PENDING (D6)
INSERT INTO payments (order_id, amount, method, status) VALUES (currval('orders_id_seq'), $price, 'MOBILE_MONEY', 'PENDING');

-- 6. Réserver le produit (D3)
UPDATE products SET status='RESERVED', reserved_at=now(), reserved_until=now() + interval '15 minutes'
 WHERE id = $1;

-- 7. Notifications dans la MÊME transaction (N3 acheteur, N5 vendeur)
INSERT INTO notifications (user_id, type, title, message) VALUES ($2, 'order_created',   'Commande CMD-… enregistrée', …);
INSERT INTO notifications (user_id, type, title, message) VALUES ($3, 'article_reserved', 'Votre article est réservé',  …);

COMMIT;
```

**Pourquoi `SELECT … FOR UPDATE` (et pas une condition `UPDATE … WHERE status='AVAILABLE'`) ?** Le verrou de ligne garantit que deux requêtes concurrentes sur le même produit s'exécutent **sérieusement** : la 2e attend la fin de la 1re puis constate `status = RESERVED` → échec propre. C'est le point aigu de CA-BUY01-03 et du test de recette T11 (deux sessions en parallèle). En complément, l'index unique partiel `uq_one_active_order_per_product` est un **filet de sécurité base de données** : un plantage de logique applicative ne peut pas créer deux commandes WAITING_PAYMENT sur le même produit (erreur 23505 → 409).

> ⚠️ Discipline d'équipe : TOUTE zone où l'argent ou un statut change passe par une transaction + verrou (doubles paiements CA-ADM03-05, double paye vendeur CA-ADM04-04, expiration) — jamais de requête « best effort » hors transaction.

### 5.2 Expiration de réservation (D3, CA-BUY02-01…03, T13)

Deux mécanismes **complémentaires** (max 1 min de délai dans tous les cas) :

**(a) Vérification paresseuse (lazy)** — dans le code de lecture, il suffit de voir le produit réservé :
1. Listing catalogue : les produits `AVAILABLE` sont renvoyés tels quels (un produit RESERVED n'apparaît pas — il est exclu par le filtre `status = 'AVAILABLE'`).
2. Fiche produit `GET /api/products/:id` : si `status = 'RESERVED' AND reserved_until < now()` → exécute la routine d'expiration (transaction) **avant** de répondre. La fiche reflète alors `AVAILABLE` (CA-CAT03-04).
3. Clic « Acheter » : étape 2 du §5.1 (libération d'abord si expiré).

**(b) Tâche planifiée** — `jobs/expire-reservations.ts`, cron `*/1 * * * *` (node-cron), chaque minute :
```sql
BEGIN;
-- Pour chaque commande WAITING_PAYMENT expirée (verrou selon l'ordre)
SELECT o.id, o.product_id FROM orders o
  JOIN products p ON p.id = o.product_id
 WHERE o.status = 'WAITING_PAYMENT' AND p.status = 'RESERVED' AND p.reserved_until < now()
   FOR UPDATE OF o, p;                                    -- verrouiller ordre + produit

-- Pour chacune (boucle serveur, une transaction par commande) :
UPDATE orders   SET status = 'PAYMENT_FAILED' WHERE id = $oid AND status = 'WAITING_PAYMENT';
UPDATE products SET status = 'AVAILABLE', reserved_at = NULL, reserved_until = NULL
 WHERE id = $opid AND status = 'RESERVED';
UPDATE payments SET status = 'FAILED' WHERE order_id = $oid AND status = 'PENDING';
INSERT INTO notifications (user_id, type, title, message) VALUES ($buyer, 'reservation_expired', 'Votre commande CMD-… a expiré', …);  -- N7
COMMIT;
```

**Sécurité anti-course (D3.3)** : la chaîne `UPDATE … WHERE status = 'WAITING_PAYMENT'` + la clause `WHERE status='RESERVED'` garantissent qu'une confirmation admin (`Paiement reçu` → `WAITING_SELLER_PAYMENT`) déjà appliquée **ne peut pas** être écrasée par l'expiration : si le statut a changé, le `UPDATE` ne matche aucune ligne et le `UPDATE` produit ne matche pas non plus (statut RESERVED attendu). La course est résolue par le verrouillage de ligne (`FOR UPDATE OF o, p`). **L'admin est prioritaire par construction.**

> note déploiement : node-cron tourne dans le process Express. Railway doit rester à **1 instance** (pas de scaling horizontal) → sinon duplication du cron. Acceptable pour le MVP ; si scale un jour → extraire le job.

---

## 6. Auth, rôles, routes front, API

### 6.1 Flux d'authentification et séparation des rôles

- **Inscription** `POST /api/auth/register` : validation zod (pseudo 2-50, name, email unique, téléphone +225, mdp ≥ 8, CGU cochée) → `bcryptjs.hash` (cost 10) → `INSERT users` → `req.session.userId = id; req.session.role = 'user'` → 201 + `GET /api/auth/me`.
- **Connexion** `POST /api/auth/login` : identifiant = email **ou** téléphone (CA-AUTH02-01) → `bcrypt.compare` → session (`userId`, `role`). Erreur générique « Identifiants incorrects ».
- **Déconnexion** `POST /api/auth/logout` : `req.session.destroy()` + clear cookie → session invalide serveur (CA-AUTH02-03).
- **Cookie session** : HTTP-only, `sameSite: 'lax'`, `secure: NODE_ENV === 'production'`, `maxAge: 7 jours` (CA-AUTH02-02, point ouvert §12.9), rolling. Derrière le proxy Railway : `app.set('trust proxy', 1)` **obligatoire** pour que `secure` fonctionne en https.
- **Middlewares serveur** (`middleware/auth.ts`) :
  - `requireAuth` : `session.userId` absent → 401 ; charge l'utilisateur frais depuis la base (rôle et existence).
  - `requireAdmin` : `requireAuth` + `role !== 'admin'` → **403** (CA-AUTH02-04, CA-AUTH03-02).
  - **Toute route admin monte `requireAdmin` au niveau du router** — jamais seulement dans le front (V1 §28, « autorisations vérifiées côté serveur »).
- **Sérialisation RG 7.7** : le mapper sérialiseur expose `display_name` public, jamais `name/email/phone` hors endpoints admin/profil-self (test T22).
- **Routes front gardées** (`guards.ts`) : `RequireAuth` (user) et `RequireAdmin` (admin) enveloppent les layouts `user/` et `admin/` ; la maquette `/admin/login` est une page dédiée (CA-AUTH03-01), distincte du login utilisateur.

### 6.2 Arborescence des routes front (react-router 7)

```
/                          Home (hero maquette)
/catalogue                 Catalogue + recherche + filtres + tri (D12)
/articles/:slug            Fiche article (galerie, info vendeur limitée D2, badge dispo)
/login                     Connexion (redirige ?next= si non connecté, D10)
/register                  Inscription
/admin/login               Connexion admin (CA-AUTH03-01)
── RequireAuth (user) ──
/dashboard                 Tableau de bord (4 compteurs maquette)
/mes-commandes             Liste commandes acheteur (CA-BUY03)
/mes-articles              Liste articles vendeur + modif/suppr (CA-SELL02/03)
/revendre                  Formulaire (CA-SELL01) → /confirmation
/notifications             Badge + liste (CA-NOT01)
/profil                    Profil (maquette)
── RequireAdmin ──
/admin                     Dashboard 4 compteurs (CA-ADM01)
/admin/articles-attente    Approuver / refuser + motif (CA-ADM02)
/admin/commandes           Liste commandes (CA-ADM03)
/admin/commandes/:id       Détail + « Paiement reçu » (méthode + référence)
/admin/paiements-vendeurs  Payer vendeur (CA-ADM04)
/admin/utilisateurs        Liste lecture seule (CA-ADM05)
/admin/categories          Activer/désactiver/renommer (CA-ADM06)
/admin/historique          admin_actions (CA-ADM07)
```

### 6.3 Carte des endpoints REST (préliminaire — finalisée par l'api-designer)

Convention : JSON, erreurs `{ error: { code, message } }`, auth = cookie session. Préfixe `/api`.

| Méthode & route | Auth | Description |
|---|---|---|
| `POST /api/auth/register` | public | Inscription (CA-AUTH01) |
| `POST /api/auth/login` | public | Connexion email/tél + mdp (CA-AUTH02) |
| `POST /api/auth/logout` | user | Déconnexion, détruit la session |
| `GET /api/auth/me` | user | Profil courant + notifications non-lues count |
| `GET /api/categories` | public | Arbre catégories **actives** (+ inactives si admin) |
| `GET /api/products` | public | Catalogue : `q, category_id, sort(recents\|price_asc\|price_desc), page, per_page` — **uniquement** AVAILABLE (CA-CAT01-01) |
| `GET /api/products/:id` | public | Fiche + photos + vendeur limité (D2) + lazy-expiry |
| `POST /api/products` | user | multipart : champs + 1-4 photos → PENDING (CA-SELL01) |
| `GET /api/me/products` | user | Mes articles + statuts |
| `PATCH /api/me/products/:id` | user (owner) | Modif : PENDING → maj, AVAILABLE → PENDING (D9), REJECTED → PENDING + efface motif |
| `DELETE /api/me/products/:id` | user (owner) | Si PENDING/AVAILABLE sans commande active (CA-SELL03) |
| `POST /api/products/:id/buy` | user | **Achat = transaction FOR UPDATE (§5.1)** ; ≠ owner ; 409 si indisponible |
| `GET /api/me/orders` | user | Mes commandes acheteur |
| `GET /api/me/notifications` | user | Liste, non-lues d'abord |
| `PATCH /api/me/notifications/:id/read` | user | Marque lue |
| `POST /api/me/notifications/read-all` | user | Marque tout lu |
| `GET /uploads/products/:file` | public | Photo (express.static sur UPLOAD_DIR) |
| — **admin (toutes → requireAdmin)** — | | |
| `GET /api/admin/stats` | admin | 4 compteurs (CA-ADM01) |
| `GET /api/admin/products?status=PENDING` | admin | Articles à modérer |
| `POST /api/admin/products/:id/approve` | admin | PENDING → AVAILABLE (+ approved_by/at, action, N2) — transaction |
| `POST /api/admin/products/:id/reject` | admin | body `{ reason }` liste fermée RG-REFUS → REJECTED (N2b) — transaction |
| `GET /api/admin/orders` | admin | Liste toutes commandes |
| `GET /api/admin/orders/:id` | admin | Détail commande |
| `POST /api/admin/orders/:id/confirm-payment` | admin | body `{ method, reference? }` — WAITING_PAYMENT → WAITING_SELLER_PAYMENT + payment PAID, **en transaction** (D6, CA-ADM03-03/05) |
| `GET /api/admin/payouts` | admin | Paiements vendeurs (CA-ADM04-01) |
| `POST /api/admin/payouts/:id/pay` | admin | PENDING → PAID + order SELLER_PAID→COMPLETED + product SOLD + N6/N8, **une transaction** (CA-ADM04-02/04) |
| `GET /api/admin/users` | admin | Lecture seule (CA-ADM05) |
| `PATCH /api/admin/categories/:id` | admin | body `{ name?, active? }` (CA-ADM06) |
| `GET /api/admin/history` | admin | admin_actions (CA-ADM07) |
| `GET /health` | public | Health check (deploy) |

---

## 7. Déploiement cible — Railway, une seule entité

### 7.1 Comparatif des cibles (décision)

| Critère | **Railway** (recommandé) | Render (Free) | Vercel + Supabase/Neon |
|---|---|---|---|
| Compte existant sur la machine | ✅ **OUI** — CLI 5.54.1 authentifié (`railway whoami` = dioufidrisss@gmail.com), billing actif (déjà facturé ~0,58 $/période, journal.md) | ❌ NON — le binaire `render` local **n'est pas le CLI Render.com** (erreur « templating engine ») ; il faudrait créer un token `rnd_…` → compte supplémentaire | ⚠️ CLI vercel + supabase installés, mais… |
| Postgres managé | ✅ Plugin Railway Postgres (déjà éprouvé : projet Nprojet) | ⚠️ via Neon/Supabase (tiers) | ✅ Supabase/Neon gratuits, CLI présents |
| Uploads locaux `uploads/products/` | ✅ Volume persistant (monté `/data`) | ❌ Disque éphémère sur Free (perdu au redeploy) | ❌ Filesystem serverless éphémère — uploads locaux **impossibles** |
| Cron toutes les minutes (D3) | ✅ Process long-running node-cron | ⚠️ Free : sleep après 15 min d'inactivité → cron mort + cold start | ❌ Serverless : pas de cron longue durée fiable (plan gratuit très limité) |
| Cookie HTTP-only confort | ✅ Same-origin (front servi par Express) | ✅ idem | ⚠️ 2 entités (web distante + API) → CORS/cookie cross-origin à gérer |
| Coût | Prorata usage après crédit essai (déjà actif, faible) | 0 € mais 4 limitations ci-dessus | 0 € web + DB gratuite |
| **Verdict** | **✔ CIBLE — zéro compte supplémentaire, zéro CORS, uploads persistants, cron fiable** | ❌ éliminé (compte + disque éphémère + sleep) | ❌ éliminé (pas d'uploads locaux possibles, CORS) |

**Décision : Railway, une seule entité** (web buildé + API + uploads + cron). Instructions complètes dans le skill `deploiement-prod` au moment de déployer.

### 7.2 Variables d'environnement (Railway projet `revends`)

| Variable | Exemple / source | Notes |
|---|---|---|
| `DATABASE_URL` | fournie par Railway Postgres plugin | `postgres://…` (driver pg, pool) |
| `SESSION_SECRET` | généré (42+ chars) | secret express-session |
| `ADMIN_EMAIL` | `admin@revends.com` | seed admin |
| `ADMIN_PASSWORD` | fort, ≥ 12 chars | seed admin (haché en base) |
| `NODE_ENV` | `production` | cookie secure, trust proxy |
| `PORT` | Railway l'injecte | `app.listen(PORT)` |
| `UPLOAD_DIR` | `/data/products` | **volume Railway** monté sur `/data` |
| `COMMISSION_RATE` | `0.10` | défaut 10 % (§7.3) |
| `RESERVATION_MINUTES` | `15` | D3 |

**Secret commité : jamais.** .env.example documenté, `.env` gitignoré.

### 7.3 Étapes de déploiement (récap — détail dans le skill `deploiement-prod`)

1. `railway init` (projet `revends`) → + **Railway Postgres** (plugin) + **Volume** monté sur `/data`.
2. Variables §7.2 posées (Railway dashboard ou `railway variables`).
3. Build `server/` : `npm run build` → Dockerfile multi-stage (node:22 : install → tsc → runtime dist). `railway up` depuis `server/`.
4. Migrations + seed : `railway run --service web "npm run migrate && npm run seed"` (proxy local du CLI).
5. `railway domain` → URL https définitive (ex. `revends-production-XXXX.up.railway.app`).
6. `web/` : `npm run build` produit `web/dist`, **copié dans l'image serveur** à la racine du build (ou servi par le serveur Express figé dans le Dockerfile). Le front n'est PAS un service séparé.
7. Health check `GET /health` + recette T01→T22 (docs/cahier §11).
8. Vérifier uploads écrits dans le volume (persistance au redeploy) — point de contrôle obligatoire avant mise en prod réelle.

---

## 8. Points d'attention techniques

**Perf**
- Catalogue : index `AVAILABLE` partiels (tri récent/prix) + index trigram `pg_trgm` sur le nom (D12). Pagination `LIMIT/OFFSET` (page de 12-24, maquette grid).
- Volumes : MVP < 1 000 articles / milliers de commandes (cahier §4) → aucune optimisation exotique nécessaire. Le pool `pg` (max ~10) suffit.

**Offline / UX mobile**
- Cible web responsive (cahier §1) : Tailwind breakpoints ($968px, $640px de la maquette). Pas de PWA/offline en V1 (hors périmètre, pas de travailleur de service).
- Mobile (RN/Expo) : **hors périmètre V1** (§4.2). L'API REST est déjà prête (endpoints agnostiques), le monorepo accueillera `mobile/` sans douleur quand le client le demandera.

**Sécurité (§9 cahier)**
- bcryptjs (cost 10), validation zod de toutes les entrées, MIME réel + ≤ 5 Mo + 1-4 fichiers (multer), nom aléatoire (crypto.randomUUID) → `uploads/products/` **non** servi sous une route exécutable, `express.static` avec `dotfiles: 'ignore'`.
- Erreurs génériques de login (pas de fuite), 403 vs 404 cohérents (un 404 sur ressource d'autrui plutôt qu'une existence révélée), jamais de champ privé dans les JSON publiques (T22).
- Transactions + verrous = le réflexe obligatoire sur toute mutation monétaire/statutaire.

**Versions / migrations à surveiller (cités avec sources)**
- **TypeScript 7.0** (GA 08/07/2026, blog MS) — pas d'API programmatique avant 7.1 → pas d'eslint type-aware en V1 ; fallback pin `typescript@6.0.3`.
- **Express 5** (docs migration) : `res.json(obj, status)` supprimé, wildcard `/*splat`, `req.query` parser « simple », async errors auto-gérées. À lire avant d'écrire les routes.
- **Tailwind v4** (docs) : config via `@theme` CSS, plugin `@tailwindcss/vite` — plus de `tailwind.config.js` par défaut.
- **node-cron 4** : ESM-only (`"type": "module"` serveur).
- **multer 2.x** : requis (1.x = CVE publiques).
- **connect-pg-simple 10** (npm) : table `session` à créer (SQL fourni §4), compatible Node ≥ 22 et pg 8.

---

## 9. Risques (format gestion-risques)

```
🔥 Bloquant : aucun — Railway authentifié, Postgres managé + volume déjà éprouvés sur cette machine.
⚠️ Important : uploads = volume Railway (léger coût) — sans volume, les photos sont perdues à chaque redéploiement.
    → action : monter le Volume `/data` avant toute mise en prod ; vérifier une photo après redeploy.
⚠️ Important : re-soumission d'un article publié (D9) — la transaction de modification doit effacer rejection_reason
    et repasser PENDING SANS perdre les photos existantes (suppression/additive). À spécifier pour l'api-designer.
⚠️ Important : compta conserve-t-elle le count non-lues sur READ des notifications ? → prévoir PATCH read simple, sans course.
INFO : Express 5 change des signatures (res.json(obj,status), /*splat) — citer le guide de migration avant d'écrire les routes.
INFO : TS7.0 sans API programmatique → pas de règles eslint type-aware en V1 (fallback pin 6.0.3).
INFO : catégories seed (proposition 5 + 17 sous-catégories) à valider par le client (point ouvert §12.6 cahier).
INFO : scaling horizontal Railway = cron dupliqué → garder 1 instance en V1.
INFO : paiement hors-ligne — modalités concrètes (numéro Mobile Money ? point de retrait ?) en attente du client (§12.4),
    requis pour la notice affichée à l'acheteur après « Acheter ».
```

---

## 10. Prochaines étapes (après validation de ce document)

1. Chef de projet valide le document + les informations §12.4 (paiement) et §12.6 (catégories).
2. `@frontend` : scaffold `web/` (create-vite react-ts + tailwind v4 + react-router 7), reproduction maquette (skill `fidelite-maquette`).
3. `@backend` (api-designer) : scaffold `server/`, applique `001_init.sql` + seeds, implémente routes/middlewares/services selon §5-6.
4. `schema SQL` figé dans `server/src/db/migrations/` — toute évolution = nouveau fichier `003_…sql`, jamais d'édit du 001 déjà appliqué.

---

## 11. ÉVOLUTION V3 — Auth unifiée (E1) + cycle livraison (E2)

| | |
|---|---|
| **Version** | 1.0 (2026-09-21) |
| **Auteur** | Agent architecte |
| **Statut** | DDL + plan prêts à intégrer par le backend, à valider |
| **Fichier DDL** | `server/migrations/003_order_events.sql` (nouveau, jamais d'édit du 001) |
| **Source** | Consigne d'évolution V3 (E1-auth, E2-cycle livraison). ⚠️ `docs/cahier-des-charges-v3.md` **absent du dépôt** au moment de la rédaction → à rapprocher dès qu'il est fourni (voir §11.15). |
| **Preuve** | Postgres 16 jetable (Docker), exécution réelle de `migrate.ts` — 12/12 assertions PASS (§11.14) |

> **Périmètre.** E1 : l'API d'authentification est **déjà unique** (`POST /api/auth/login` renvoie un `role`) ; le schéma `users` n'évolue pas. E2 : nouveau cycle de commande **à 9 étapes + 2 états d'échec**, journal `order_events`, extension des notifications, réindexation anti-double-commande.
>
> **⚠️ Historique conservé.** Les §1 à §6 décrivent la **V2** (enum `order_status` à 6 valeurs, `WAITING_PAYMENT`, `WAITING_SELLER_PAYMENT`, `SELLER_PAID`, `idx_orders_payouts`, workflow piloté par `orders.status`). Ils ne sont **pas modifiés** (traçabilité de la décision). Pour tout ce qui touche au cycle de commande, **cette section §11 fait foi** : §3 (D5/D6), §5.1/§5.2, §6.1 (lien `/admin/login`) et la carte d'endpoints §6.3 sont **remplacés** par §11.5–§11.10.
>
> **§8 (points d'attention)** : ne référence aucun statut de commande obsolète → **inchangé**. Les seules règles à réaffirmer pour la V3 : (a) toute mutation de statut = transaction + `order_events` ; (b) le cron d'expiration ne concerne plus que `CREATED`/`PAYMENT_PENDING`.

### 11.1 Cycle de vie de la commande (9 étapes + 2 échecs)

```
CREATED → PAYMENT_PENDING → PAID → PRODUCT_WAITING → PRODUCT_RECEIVED → PREPARING → IN_DELIVERY → DELIVERED → COMPLETED
   │            │
   └────────────┴──────────→ PAYMENT_FAILED   (expiration 15 min, terminal)
   └────────────┴──────────→ CANCELLED        (annulation admin avant paiement, terminal)
```

| Statut | Signification | Déclencheur | Produit | Événements écrits |
|---|---|---|---|---|
| `CREATED` | Commande créée | `POST /api/orders` (transaction d'achat) | `RESERVED` (`reserved_until = now + 15 min`) | `NULL → CREATED` |
| `PAYMENT_PENDING` | Attente paiement acheteur | Même transaction d'achat (étape suivante) | `RESERVED` | `CREATED → PAYMENT_PENDING` |
| `PAID` | Paiement acheteur confirmé | `POST /api/admin/orders/:id/confirm-payment` | **`SOLD`** | `PAYMENT_PENDING → PAID` |
| `PRODUCT_WAITING` | Plateforme en attente de remise du produit | Enchaîné **dans la même transaction** que `PAID` | `SOLD` | `PAID → PRODUCT_WAITING` |
| `PRODUCT_RECEIVED` | Produit reçu par la plateforme | `POST /api/admin/orders/:id/mark-product-received` | `SOLD` | `PRODUCT_WAITING → PRODUCT_RECEIVED` |
| `PREPARING` | Contrôle / conditionnement | Enchaîné **dans la même transaction** que `PRODUCT_RECEIVED` | `SOLD` | `PRODUCT_RECEIVED → PREPARING` |
| `IN_DELIVERY` | En cours de livraison acheteur | `POST /api/admin/orders/:id/start-delivery` | `SOLD` | `PREPARING → IN_DELIVERY` |
| `DELIVERED` | Livré à l'acheteur | `POST /api/admin/orders/:id/mark-delivered` | `SOLD` | `IN_DELIVERY → DELIVERED` |
| `COMPLETED` | Commande terminée (terminal) | Enchaîné **dans la même transaction** que `DELIVERED` | `SOLD` | `DELIVERED → COMPLETED` |
| `PAYMENT_FAILED` | Paiement non confirmé / réservation expirée (terminal) | Cron + lazy expiry | `AVAILABLE` (libéré) | `PAYMENT_PENDING → PAYMENT_FAILED` |
| `CANCELLED` | Annulation avant paiement (terminal) | Action admin (pas de bouton utilisateur en V3) | `AVAILABLE` (libéré) | `CREATED/PAYMENT_PENDING → CANCELLED` |

**Décisions explicitement tranchées** (à confirmer chef de projet, §11.15) :
- **D-V3-1 — `PAID → PRODUCT_WAITING` automatique.** Aucune route ne cible `PRODUCT_WAITING` et `mark-product-received` exige ce statut : la seule façon d'atteindre l'état est de l'enchaîner après `PAID` dans la transaction `confirm-payment` (2 events). Symétrique des enchaînements `PRODUCT_RECEIVED→PREPARING` et `DELIVERED→COMPLETED` demandés.
- **D-V3-2 — Statut persistant à la création = `PAYMENT_PENDING`.** `CREATED` est un état **transitoire interne** (journalisé puis quitté dans la même transaction) ; c'est `PAYMENT_PENDING` qui est exposé par l'API après `POST /api/orders`. L'index d'unicité couvre **les deux** par sécurité.
- **D-V3-3 — `seller_payouts` indépendante.** `orders.status` ne pilote plus le paiement vendeur. Le payout reste suivi par la table `seller_payouts` (statut `PENDING`/`PAID` + `paid_at`/`paid_by`) pour la compta. Payer le vendeur **ne change pas** `orders.status` (donc **pas d'`order_event`** — voir D-V3-4).
- **D-V3-4 — Identité des events.** 1 changement de statut = exactement 1 ligne `order_events`. Un événement qui n'est **pas** un changement de statut (ex. payout vendeur) n'écrit **pas** d'`order_event` : il reste tracé dans `admin_actions` + `seller_payouts` + notifications.
- **D-V3-5 — Annulation avant paiement uniquement.** `CANCELLED` n'est atteignable que depuis `CREATED`/`PAYMENT_PENDING` (produit libéré). Après `PAID`, le produit est `SOLD` : une annulation/remboursement relève d'un flux dédié (hors périmètre V3). Le trigger le garantit en base.
- **D-V3-6 — Expiration uniquement avant paiement.** Le cron et la libération paresseuse ne traitent que `status ∈ {CREATED, PAYMENT_PENDING}`. Dès `PAID`, le produit est engagé : plus aucune expiration possible.

### 11.2 Mapping des statuts existants (V2 → V3)

| Ancien (`order_status` V2) | Nouveau (V3) | Justification |
|---|---|---|
| `WAITING_PAYMENT` | **`PAYMENT_PENDING`** | même sens (attente paiement) |
| `WAITING_SELLER_PAYMENT` | **`PAID`** | en V2, cet état = paiement acheteur déjà confirmé |
| `SELLER_PAID` | **`COMPLETED`** | en V2, vendeur payé = fin de cycle |
| `PAYMENT_FAILED` | **`PAYMENT_FAILED`** | inchangé |
| `COMPLETED` | **`COMPLETED`** | inchangé |
| `CANCELLED` | **`CANCELLED`** | inchangé |

À la migration, chaque commande existante reçoit **1 `order_event` de reprise** (`from_status NULL`, `note = 'Reprise historique — migration V3 (003)'`, `created_at = orders.created_at`) : l'historique fin V3 n'existe pas pour le passé, on ne l'invente pas.

### 11.3 DDL `003_order_events.sql` (fichier complet, prêt à intégrer)

> Chemin réel : `server/migrations/003_order_events.sql`. Exécuté **en une transaction** par `migrate.ts`. Compatible PG 15/16/17. `ALTER TYPE … ADD VALUE` en transaction est autorisé (PG12+) et **n'est pas utilisé** dans le même fichier (cf. docs PostgreSQL 16, `ALTER TYPE`).

```sql
-- ============================================================
-- ReVends — 003_order_events.sql  (PostgreSQL 15+)
-- ÉVOLUTION V3 : cycle de commande à 9 étapes + journal `order_events`.
-- Source : docs/architecture.md §11 (Évolution V3).
-- Prérequis : 001_init.sql + 002_seed_categories.sql déjà appliqués.
--
-- Exécution : migrate.ts enveloppe CHAQUE fichier dans BEGIN/COMMIT.
--   ⚠️ ALTER TYPE ... ADD VALUE est autorisé en transaction depuis PG12,
--      MAIS la valeur ajoutée n'est pas utilisable avant le COMMIT.
--      Ce fichier ne réutilise aucune valeur d'enum ajoutée → sûr.
-- ============================================================

-- ============================================================
-- 1. NOUVEL ENUM order_status (11 valeurs — cycle livraison V3)
-- ============================================================
-- Stratégie sûre (pas de DROP TYPE avant d'avoir détaché la colonne) :
--   create order_status_v2 → ALTER COLUMN ... TYPE ... USING(mapping)
--   → drop ancien type → rename v2 → order_status.
-- L'ancien type est référencé par : le DEFAULT de orders.status et deux
-- index partiels. On les détache AVANT l'ALTER, sinon dépendance bloquante.

-- 1.1 Détacher les dépendances de l'ancien type
DROP INDEX IF EXISTS uq_one_active_order_per_product;   -- recréé en §3 (périmètre élargi)
DROP INDEX IF EXISTS idx_orders_payouts;                -- obsolète : orders.status ne pilote plus le payout
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;    -- le DEFAULT référence l'ancien type

-- 1.2 Nouveau type
CREATE TYPE order_status_v2 AS ENUM (
    'CREATED',           -- commande créée (état transitoire interne, journalisé)
    'PAYMENT_PENDING',   -- en attente du paiement acheteur (réservation 15 min)
    'PAID',              -- paiement acheteur confirmé (produit → SOLD)
    'PRODUCT_WAITING',   -- en attente de remise du produit à la plateforme
    'PRODUCT_RECEIVED',  -- produit reçu par la plateforme
    'PREPARING',         -- produit en préparation (contrôle / conditionnement)
    'IN_DELIVERY',       -- en cours de livraison vers l'acheteur
    'DELIVERED',         -- livré à l'acheteur
    'COMPLETED',         -- commande terminée (terminal)
    'PAYMENT_FAILED',    -- paiement non confirmé / réservation expirée (terminal)
    'CANCELLED'          -- annulée (terminal)
);

-- 1.3 Migration des données existantes (mapping V2 → V3)
--   WAITING_PAYMENT        → PAYMENT_PENDING
--   WAITING_SELLER_PAYMENT → PAID            (paiement acheteur confirmé en V2)
--   SELLER_PAID            → COMPLETED       (vendeur payé = fin de cycle V2)
--   PAYMENT_FAILED         → PAYMENT_FAILED
--   COMPLETED              → COMPLETED
--   CANCELLED              → CANCELLED
ALTER TABLE orders
    ALTER COLUMN status TYPE order_status_v2
    USING (
        CASE status::text
            WHEN 'WAITING_PAYMENT'        THEN 'PAYMENT_PENDING'
            WHEN 'WAITING_SELLER_PAYMENT' THEN 'PAID'
            WHEN 'SELLER_PAID'            THEN 'COMPLETED'
            WHEN 'PAYMENT_FAILED'         THEN 'PAYMENT_FAILED'
            WHEN 'COMPLETED'              THEN 'COMPLETED'
            WHEN 'CANCELLED'              THEN 'CANCELLED'
            ELSE 'CANCELLED'   -- filet de sécurité : valeur inconnue → terminal sûr
        END
    )::order_status_v2;

ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'CREATED';

-- 1.4 Suppression de l'ancien type et reprise du nom canonique
DROP TYPE order_status;
ALTER TYPE order_status_v2 RENAME TO order_status;

-- ============================================================
-- 2. TABLE order_events — journal horodaté des changements de statut
-- ============================================================
-- Règle d'identité : 1 changement de statut = exactement 1 ligne.
-- from_status NULL = état initial (création). Toute mutation de statut
-- applicative DOIT insérer la ligne correspondante dans la même transaction.
CREATE TABLE order_events (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status order_status,                                      -- NULL = état initial
    to_status   order_status NOT NULL,
    actor       VARCHAR(10) NOT NULL CHECK (actor IN ('system', 'admin', 'user')),
    note        TEXT,                                              -- contexte libre (réf. paiement, motif…)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_events_order ON order_events(order_id, created_at, id);

-- Reprise de l'historique : 1 événement « migration » par commande existante.
-- (Les commandes créées après V3 écriront leurs 2 événements initiaux en service.)
INSERT INTO order_events (order_id, from_status, to_status, actor, note, created_at)
SELECT o.id, NULL, o.status, 'system', 'Reprise historique — migration V3 (003)', o.created_at
  FROM orders o;

-- ============================================================
-- 3. Réindexation anti-double-commande + file d'opérations logistiques
-- ============================================================
-- Ensemble « actif » (produit engagé) = de CREATED à DELIVERED inclus.
-- Une commande active bloque toute re-commande du même produit.
-- COMPLETED / PAYMENT_FAILED / CANCELLED libèrent l'index — en pratique seuls
-- CREATED / PAYMENT_PENDING sont réellement rejouables, car le produit passe
-- SOLD dès PAID (donc plus jamais AVAILABLE).
CREATE UNIQUE INDEX uq_one_active_order_per_product
    ON orders(product_id)
    WHERE status IN ('CREATED', 'PAYMENT_PENDING', 'PAID', 'PRODUCT_WAITING',
                     'PRODUCT_RECEIVED', 'PREPARING', 'IN_DELIVERY', 'DELIVERED');

-- File de suivi logistique admin (remplace idx_orders_payouts, obsolète).
CREATE INDEX idx_orders_delivery ON orders(created_at ASC, id)
    WHERE status IN ('PAID', 'PRODUCT_WAITING', 'PRODUCT_RECEIVED',
                     'PREPARING', 'IN_DELIVERY', 'DELIVERED');

-- ============================================================
-- 4. Garde-fou : matrice de transitions (défense en profondeur)
-- ============================================================
-- L'application DOIT pré-vérifier la transition et répondre 409 (statut actuel)
-- avant toute mutation ; ce trigger est le filet de sécurité base (SQLSTATE P0001)
-- qui rend une transition invalide impossible même en cas de bug applicatif.
CREATE OR REPLACE FUNCTION enforce_order_status_transition() RETURNS trigger AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;   -- pas un changement de statut : autorisé (ex. mise à jour d'autres colonnes)
    END IF;
    -- CANCELLED n'est atteignable qu'AVANT paiement (produit encore libérable).
    -- Après PAID le produit est SOLD : une annulation/remboursement relève d'un
    -- flux dédié hors périmètre V3 (voir architecture §11, point ouvert).
    IF NOT (
        (OLD.status = 'CREATED'          AND NEW.status IN ('PAYMENT_PENDING', 'PAYMENT_FAILED', 'CANCELLED')) OR
        (OLD.status = 'PAYMENT_PENDING'  AND NEW.status IN ('PAID', 'PAYMENT_FAILED', 'CANCELLED')) OR
        (OLD.status = 'PAID'             AND NEW.status = 'PRODUCT_WAITING') OR
        (OLD.status = 'PRODUCT_WAITING'  AND NEW.status = 'PRODUCT_RECEIVED') OR
        (OLD.status = 'PRODUCT_RECEIVED' AND NEW.status = 'PREPARING') OR
        (OLD.status = 'PREPARING'        AND NEW.status = 'IN_DELIVERY') OR
        (OLD.status = 'IN_DELIVERY'      AND NEW.status = 'DELIVERED') OR
        (OLD.status = 'DELIVERED'        AND NEW.status = 'COMPLETED')
    ) THEN
        RAISE EXCEPTION 'Transition de commande invalide : % -> %', OLD.status, NEW.status
            USING ERRCODE = 'P0001',
                  HINT = 'Matrice des transitions : docs/architecture.md §11.';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_status_transition
    BEFORE UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION enforce_order_status_transition();

-- ============================================================
-- 5. Extension notification_type (historique livraison V3)
-- ============================================================
-- Nouvelles notifications du cycle logistique. Valeurs ajoutées en fin
-- d'enum (pas de BEFORE/AFTER → pas de ralentissement de comparaison notable).
-- ⚠️ Ajoutées ici en transaction : ne PAS les insérer dans ce même fichier.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_product_waiting';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_product_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_preparing';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_in_delivery';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_delivered';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'order_completed';
```

### 11.4 Matrice de transitions (référence unique)

| From \ To | `PAYMENT_PENDING` | `PAID` | `PRODUCT_WAITING` | `PRODUCT_RECEIVED` | `PREPARING` | `IN_DELIVERY` | `DELIVERED` | `COMPLETED` | `PAYMENT_FAILED` | `CANCELLED` |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `CREATED` | ✅ | | | | | | | | ✅ | ✅ |
| `PAYMENT_PENDING` | | ✅ | | | | | | | ✅ | ✅ |
| `PAID` | | | ✅ | | | | | | | |
| `PRODUCT_WAITING` | | | | ✅ | | | | | | |
| `PRODUCT_RECEIVED` | | | | | ✅ | | | | | |
| `PREPARING` | | | | | | ✅ | | | | |
| `IN_DELIVERY` | | | | | | | ✅ | | | |
| `DELIVERED` | | | | | | | | ✅ | | |
| `COMPLETED` / `PAYMENT_FAILED` / `CANCELLED` | terminaux | | | | | | | | | |

```yaml
# Matrice de transitions V3 — source de vérité (trigger SQL + services)
transitions:
  CREATED:          [PAYMENT_PENDING, PAYMENT_FAILED, CANCELLED]
  PAYMENT_PENDING:  [PAID, PAYMENT_FAILED, CANCELLED]
  PAID:             [PRODUCT_WAITING]
  PRODUCT_WAITING:  [PRODUCT_RECEIVED]
  PRODUCT_RECEIVED: [PREPARING]
  PREPARING:        [IN_DELIVERY]
  IN_DELIVERY:      [DELIVERED]
  DELIVERED:        [COMPLETED]
  COMPLETED:        []
  PAYMENT_FAILED:   []
  CANCELLED:        []
# Règles d'or :
#  - toute transition = transaction + 1 order_event (from_status, to_status, actor)
#  - transition non listée → service 409 { error: { code: 'INVALID_TRANSITION', currentStatus } }
#  - le trigger SQL rejette en dernier recours (SQLSTATE P0001)
```

### 11.5 Journal `order_events` — règles d'écriture

- **Champ `actor`** : `'system'` (enchaînements automatiques, expiration), `'admin'` (actions admin), `'user'` (action utilisateur — pas d'usage en V3, réservé).
- **Création de commande** (transaction `createOrder`) : `INSERT orders (status='CREATED')` puis `UPDATE status='PAYMENT_PENDING'` (le trigger valide) + **2 events** :
  1. `(NULL → CREATED, system, 'Création de la commande')`
  2. `(CREATED → PAYMENT_PENDING, system, 'Paiement en attente')`
- **`confirm-payment`** : 2 events (`PAYMENT_PENDING→PAID`, `PAID→PRODUCT_WAITING`).
- **`mark-product-received`** : 2 events (`PRODUCT_WAITING→PRODUCT_RECEIVED`, `PRODUCT_RECEIVED→PREPARING`).
- **`start-delivery`** : 1 event (`PREPARING→IN_DELIVERY`).
- **`mark-delivered`** : 2 events (`IN_DELIVERY→DELIVERED`, `DELIVERED→COMPLETED`).
- **Expiration (cron/lazy)** : 1 event (`PAYMENT_PENDING→PAYMENT_FAILED`, system).
- **`seller-payout`** : **0 event** (pas de changement de statut, D-V3-4).
- **Lecture** : `GET /api/orders/:id` et `GET /api/admin/orders/:id` renvoient `events[]` triés par `created_at, id`.

> **Clarification d'interprétation.** La consigne « la conf de paiement crée l'event `PAYMENT_PENDING` » est ambiguë. Interprétation retenue (D-V3-2) : c'est la **transaction de création de commande** (qui place la commande en attente de paiement) qui écrit l'event `PAYMENT_PENDING` ; la **confirmation admin du paiement** (`confirm-payment`) écrit l'event `PAID`. Si la V3 attend un autre découpage, seul le service change — le DDL `order_events` est agnostique.

### 11.6 Anti-double-commande & cycle produit

- **Index unique partiel** `uq_one_active_order_per_product` sur `orders(product_id)` `WHERE status IN ('CREATED','PAYMENT_PENDING','PAID','PRODUCT_WAITING','PRODUCT_RECEIVED','PREPARING','IN_DELIVERY','DELIVERED')`.
  - Ensemble « actif » qui **bloque une re-commande** : de `CREATED` à `DELIVERED` inclus.
  - Libéré par `COMPLETED`, `PAYMENT_FAILED`, `CANCELLED`.
- **Verrou applicatif inchangé** : `SELECT … FOR UPDATE` sur `products` dans la transaction d'achat (§5.1 reste valide sur le principe ; seules les valeurs de statut changent).
- **Produit** : `RESERVED` à la création (`reserved_until = now + 15 min`) ; **`SOLD` au passage à `PAID`**. `reserved_at`/`reserved_until` sont remis à `NULL` quand le produit quitte `RESERVED` (contrainte `chk_reserved_pair` du 001).
- **Expiration** : uniquement tant que `orders.status ∈ {CREATED, PAYMENT_PENDING}` (cron `*/1` + lazy). Après `PAID`, plus d'expiration possible (D-V3-6). Sécurité anti-course conservée : `UPDATE … WHERE status = 'PAYMENT_PENDING'` + produit `RESERVED`.

### 11.7 Notifications

Extension de l'enum `notification_type` (6 valeurs ajoutées, en fin d'enum) :

| Nouveau type | Destinataire | Déclencheur |
|---|---|---|
| `order_product_waiting` | Acheteur | `PAID → PRODUCT_WAITING` (paiement confirmé, remise attendue) |
| `order_product_received` | Acheteur | `PRODUCT_WAITING → PRODUCT_RECEIVED` |
| `order_preparing` | Acheteur | `PRODUCT_RECEIVED → PREPARING` |
| `order_in_delivery` | Acheteur | `PREPARING → IN_DELIVERY` |
| `order_delivered` | Acheteur | `IN_DELIVERY → DELIVERED` |
| `order_completed` | Acheteur | `DELIVERED → COMPLETED` |

Types existants conservés : `order_created`, `payment_confirmed`, `article_reserved`, `reservation_expired`, `seller_paid`, `article_sold` (le payout vendeur notifie toujours via ces deux derniers).

### 11.8 Contrat API (pour l'api-designer — pas de code)

Convention inchangée : JSON, erreurs `{ error: { code, message } }`, session cookie. **Toute mutation = transaction + `order_events`.** Transition invalide → **409** `{ error: { code: 'INVALID_TRANSITION', message, currentStatus } }`.

| Méthode & route | Auth | Contrat |
|---|---|---|
| `GET /api/orders/:id` | buyer **ou** seller **ou** admin (sinon **404**) | Inclut `status` + `events[]`. **Confidentialité (RG 7.7)** : le vendeur voit le `display_name` public + les photos/nom de l'article, **jamais** le téléphone de l'acheteur ; l'acheteur voit l'état de réservation/livraison, **jamais** le téléphone du vendeur. Les sérialiseurs publics existants (`serializePublicUser`) garantissent déjà l'absence de `name/email/phone`. |
| `POST /api/admin/orders/:id/confirm-payment` | admin | body `{ method, reference? }`. Précondition `status = PAYMENT_PENDING`. Effets transactionnels : `→ PAID` (+ event), **`products.status = SOLD`**, `payments.status = PAID` + `paid_at`, **`→ PRODUCT_WAITING`** (+ event), création `seller_payouts (PENDING)` (compta), notification acheteur. 409 si déjà confirmée / expirée. |
| `POST /api/admin/orders/:id/mark-product-received` | admin | Précondition `status = PRODUCT_WAITING`. Effets : `→ PRODUCT_RECEIVED` (+ event) puis **`→ PREPARING`** (+ event). Notifications `order_product_received`, `order_preparing`. |
| `POST /api/admin/orders/:id/start-delivery` | admin | Précondition `status = PREPARING`. Effets : `→ IN_DELIVERY` (+ event), notification `order_in_delivery`. |
| `POST /api/admin/orders/:id/mark-delivered` | admin | Précondition `status = IN_DELIVERY`. Effets : `→ DELIVERED` (+ event) puis **`→ COMPLETED`** (+ event). Notifications `order_delivered`, `order_completed`. |
| `POST /api/admin/orders/:id/seller-payout` (ex-`pay-seller`) | admin | body `{ reference? }`. Précondition **réseau** : `orders.status ∈ {PRODUCT_RECEIVED, PREPARING, IN_DELIVERY, DELIVERED, COMPLETED}` **et** `seller_payouts.status = PENDING`. Effets : `seller_payouts → PAID` + `paid_at`/`paid_by`, `admin_actions`, notifications `seller_paid` + `article_sold`. **Ne change pas `orders.status`** (D-V3-3/4). |

> Routes à **retirer / rediriger** : l'ancienne `POST /api/admin/orders/:id/pay-seller` devient `seller-payout` (ou alias conservé côté routeur, à trancher par l'api-designer). `POST /api/admin/payouts/:id/pay` (V2, §6.3) est obsolète.

### 11.9 E1 — Auth unifiée : ce qui reste à faire

Côté **API/schéma : rien** (l'endpoint `POST /api/auth/login` est déjà unique et renvoie le `role` ; `users.role` existe). Reste **front + seed** :
1. **Supprimer `/admin/login`** côté front : route `web/src/App.tsx` (ligne 54) + page `web/src/pages/AdminLoginPage.tsx` + lien dans `LoginPage.tsx` (ligne 52) + redirection `RouteGuards.tsx` (ligne 52 → remplacer `/admin/login` par `/login`).
2. **Redirection par rôle après login** : `LoginPage`/`RegisterPage` font déjà `role === 'admin' ? '/admin' : …` — conserver, et garder `RequireAdmin` qui renvoie vers `/login`.
3. **Identifiants admin via config** : `ADMIN_EMAIL` / `ADMIN_PASSWORD` (déjà lus par `config.ts` et `seed.ts`). Le seed est idempotent (`ON CONFLICT (email) DO NOTHING`). Documenter dans le README déploiement.

### 11.10 Impacts services backend (à adapter — pas de code ici)

| Fichier | Impact |
|---|---|
| `services/orders.service.ts` | `createOrder` : `status='CREATED'` puis `'PAYMENT_PENDING'` + **2 `order_events`** ; `getOrderForParty` : ajouter `events[]`. |
| `services/admin.service.ts` | `confirmPayment` (nouvelle précondition + `SOLD` + 2 events), `paySeller` → `sellerPayout` (précondition réseau, plus de changement de statut), **`getStats`** : `pendingPayouts` = `SELECT COUNT(*) FROM seller_payouts WHERE status='PENDING'` (ne plus joindre sur `o.status='WAITING_SELLER_PAYMENT'`). |
| `services/expiry.service.ts` | Cibler `status IN ('CREATED','PAYMENT_PENDING')` ; écrire l'event `PAYMENT_PENDING→PAYMENT_FAILED`. |
| `services/notifications.service.ts` | Étendre l'union `NotificationType` avec les 6 nouveaux types. |
| `utils/serializers.ts` | `serializeOrderForParty` / `serializeAdminOrder` : ajouter `events[]` ; `status` renvoie les nouvelles valeurs. |
| `routes/admin.routes.ts` | Ajouter `mark-product-received`, `start-delivery`, `mark-delivered` ; re-mapper `pay-seller`. |
| `docs/api.md` + `docs/design-system.md` | Mettre à jour les enums/labels de statut (libellés UI) et les endpoints. |
| Front `web/` | Libellés de statut, badges, actions admin du cycle livraison ; suppression `/admin/login`. |

### 11.11 Ordre d'implémentation backend (recommandé)

1. **Appliquer `003_order_events.sql`** (`npm run db:migrate`) — DDL validé ici.
2. `notifications.service.ts` : étendre `NotificationType`.
3. `orders.service.ts` : création (`CREATED`→`PAYMENT_PENDING`, 2 events) + `events[]` en lecture.
4. `expiry.service.ts` : nouveau périmètre `{CREATED, PAYMENT_PENDING}` + event.
5. `admin.service.ts` : `confirmPayment`, `markProductReceived`, `startDelivery`, `markDelivered`, `sellerPayout`, `getStats`.
6. `admin.routes.ts` : exposer les 4 nouvelles routes ; re-mapper `pay-seller`.
7. `serializers.ts` : `events[]`.
8. `docs/api.md`, `design-system.md`, tests.
9. **Adapter les tests cassés** (§11.12) puis relancer `npm test`.

### 11.12 Tests existants impactés (à adapter)

Les tests ciblent la base dédiée `revends_test` et appliquent les migrations réelles (`test/bootstrap.ts` → `migrate()`), donc `003` s'y appliquera. Statuts V2 attendus → à remapper :

| Fichier de test | Références à adapter |
|---|---|
| `test/buy.test.ts` | `order.status === 'WAITING_PAYMENT'` (l. 37, 41, 119, 142) → **`PAYMENT_PENDING`**. |
| `test/expiry.test.ts` | `'WAITING_PAYMENT'` (l. 88) → **`PAYMENT_PENDING`** ; `PAYMENT_FAILED` (l. 53) inchangé. |
| `test/admin.test.ts` | filtre/statut `WAITING_PAYMENT` (l. 66, 71, 74) → **`PAYMENT_PENDING`**. |
| `test/payments.test.ts` | `WAITING_SELLER_PAYMENT` (l. 37, 44, 51, 132, 133, 135) → **`PAID`/`PRODUCT_WAITING`** ; flux `confirm-payment`/`pay-seller` à rejouer sur le nouveau cycle. |

Les autres suites (`auth`, `catalog`, `sell`, `notifications`, `limits`, `unit-utils`) ne référencent pas ces statuts → **a priori intactes**.

### 11.13 Points ouverts / risques (à trancher tôt)

```
🔥 BLOQUANT : docs/cahier-des-charges-v3.md ABSENT du dépôt au moment de la rédaction.
    → action : fournir le cahier V3 et rapprocher ses critères d'acceptation de §11.1
      (notamment l'enchaînement PAID→PRODUCT_WAITING, décision D-V3-1, et la règle
      d'annulation avant/après paiement D-V3-5).
⚠️ IMPORTANT : D-V3-1 (PAID→PRODUCT_WAITING automatique) — aucune route ne cible
    PRODUCT_WAITING et mark-product-received l'exige. Choix retenu : enchaînement
    dans la transaction confirm-payment. À confirmer avec le chef de projet.
⚠️ IMPORTANT : D-V3-5 — annulation/remboursement APRÈS paiement = hors périmètre V3
    (produit SOLD). Si le client l'exige, prévoir un flux dédié (nouveau statut/refund)
    plutôt que réutiliser CANCELLED.
⚠️ IMPORTANT : les 4 fichiers de tests V2 vont échouer tant qu'ils ne sont pas remappés
    (§11.12). Ne pas lancer `npm test` sur la base de dev sans adapter d'abord.
INFO : `idx_orders_payouts` supprimé (obsolète) ; remplacé par `idx_orders_delivery`.
INFO : l'ancienne route `POST /api/admin/payouts/:id/pay` (api.md §6.3) est obsolète.
INFO : le trigger `enforce_order_status_transition` est un filet de sécurité : les
    services doivent pré-vérifier pour produire un 409 propre (et non une erreur P0001).
INFO : `ALTER TYPE ... ADD VALUE` ne peut pas être utilisé dans la même transaction
    que son ajout — ne pas insérer de notification V3 dans 003 (respecté).
```

### 11.14 Preuve d'exécution (Postgres 16 jetable, `migrate.ts` réel)

**Protocole** : conteneur Docker `postgres:16-alpine` jetable (port hôte `55445`, nom `revends-pg-proof`), base `revends_proof`. Le vrai `migrate.ts` est exécuté depuis un **runner isolé** (`/tmp/opencode/revends-proof/run`, `node_modules` en lien symbolique, `.env` pointant sur la base jetable) — la base de dev `revends-postgres` (5433) n'est **jamais** touchée. `MIGRATIONS_DIR` pointe vers un dossier temporaire contenant d'abord `001+002`, puis `003` ajouté.

```
############ migrate.ts : 001+002 ############
  ✓ 001_init.sql
  ✓ 002_seed_categories.sql
2 migration(s) appliquée(s).
############ Données V2 (6 anciens statuts) ############
         status         | count
------------------------+-------
 WAITING_PAYMENT        |     1
 PAYMENT_FAILED         |     1
 WAITING_SELLER_PAYMENT |     1
 SELLER_PAID            |     1
 COMPLETED              |     1
 CANCELLED              |     1
############ migrate.ts : 003 ############
  ✓ 003_order_events.sql
1 migration(s) appliquée(s).
############ ASSERTIONS ############
PASS mapping V2->V3 (6/6)
PASS backfill order_events (6/6)
PASS enum order_status (11/11)
PASS index anti-double-commande présent
PASS default orders.status = 'CREATED'::order_status
PASS anti-double-commande (23505 uq_one_active_order_per_product)
PASS expiration libère l'index (re-commande acceptée)
PASS trigger rejette la transition (Transition de commande invalide : PAYMENT_FAILED -> PAID)
PASS chaîne complète 9 étapes -> COMPLETED
PASS 2 events initiaux (n=2)
PASS cascade ON DELETE order_events (n=0)
PASS contrainte actor (check_violation)
############ annulation après paiement (doit ÉCHOUER) ############
Transition de commande invalide : PAID -> CANCELLED
```

**État final vérifié** : `schema_migrations` = `001`, `002`, `003` ; `order_events` avec PK, index `(order_id, created_at, id)`, CHECK `actor`, FK `ON DELETE CASCADE` ; enum `order_status` à 11 valeurs dans l'ordre ; `orders.status` default `'CREATED'` ; triggers `trg_orders_number`, `trg_orders_updated`, `trg_orders_status_transition`.

### 11.15 Définition de « Done » (binaire)

- [x] Fichier `server/migrations/003_order_events.sql` créé, style du 001 (commentaires, contraintes nommées, CHECK explicites), aucune table supprimée, `002` intact.
- [x] `003` s'applique **proprement après `001+002`** via le vrai `migrate.ts` (transaction) sur Postgres 16 jetable.
- [x] Mapping des 6 anciens statuts vérifié sur données réelles (6/6).
- [x] `order_events` : structure, index, contrainte `actor`, cascade, backfill (6/6).
- [x] Anti-double-commande via le **nouvel index** prouvé (blocage 23505 + libération).
- [x] Chaîne complète des 9 étapes + 2 events initiaux + trigger de transitions prouvés.
- [x] Section §11 ajoutée à `architecture.md` (cycle, DDL, matrice YAML, impacts, ordre d'implémentation, tests cassés, risques).
- [x] Aucun code écrit dans `server/src` ni `web/src`.
- [ ] **Hors de mon périmètre / à faire par le backend** : application de `003`, adaptation des services, remap des 4 fichiers de tests, mise à jour `docs/api.md` et `design-system.md`, suppression front de `/admin/login`.

---

### 11.16 Évolution V4 — étape `SHIPPED` + revente vendeur `DUE` (supersede partiel de §11.1–§11.8)

> **Statut** : ajout du 2026-09-23 (`@backend`). Conformément à la convention d'historique (§11, encart), **§11.1–§11.8 restent la trace V3** ; le présent §11.16 **prévaut** là où il contredit la V3. Migrations : `server/migrations/006_order_shipped.sql` (valeurs d'enum seules) + `007_order_shipped_cycle.sql` (cycle/trigger/index) — applicables après `003`, en une transaction chacune par `migrate.ts` (005 inclus si présent).

**Changements de schéma (DDL 006 + 007) :**

| Objet | V3 (003) | V4 (006/007) |
|---|---|---|
| `order_status` | 11 valeurs (… `PREPARING`, `IN_DELIVERY` …) | **12 valeurs** : `SHIPPED` inséré **après** `PREPARING` |
| `payout_status` (table `seller_payouts`) | `PENDING` / `PAID` | `PENDING` / **`DUE`** / `PAID` (`DUE` inséré après `PENDING`) |
| `notification_type` | 15 valeurs (9 existantes + 6 du DDL 003) | **16 valeurs** : + `order_shipped` |
| `enforce_order_status_transition()` | `PREPARING → IN_DELIVERY` | **`PREPARING → SHIPPED`** et **`SHIPPED → IN_DELIVERY`** (les autres transitions du 003 inchangées, recréées via `CREATE OR REPLACE FUNCTION`) |
| `uq_one_active_order_per_product` | 9 statuts actifs `CREATED..DELIVERED` (sans `SHIPPED`) | recréé **avec `'SHIPPED'`** (10 statuts) — déposé puis recréé dans 007 (même prédicat, éviter un trou de couverture) |
| `idx_orders_delivery` | 9 statuts | recréé avec `'SHIPPED'` |

**Chaîne nominale V4 :**

```
CREATED → PAYMENT_PENDING → PAID → PRODUCT_WAITING → PRODUCT_RECEIVED → PREPARING → SHIPPED → IN_DELIVERY → DELIVERED → COMPLETED
```

**Impacts services/routes (Δ sur §11.8/§11.10) :**

| Élément | Δ V4 |
|---|---|
| `POST /admin/orders/:id/mark-shipped` | **Nouvelle route**, corps `{}`. Précondition `status = PREPARING`. Effets : `→ SHIPPED` (+ 1 event `(PREPARING→SHIPPED, admin)`), `admin_actions ('order.shipped')`, notification acheteur `order_shipped`. 409 `INVALID_TRANSITION` sinon. |
| `start-delivery` | Précondition `status = PREPARING` → **`status = SHIPPED`**. Event `(SHIPPED→IN_DELIVERY, admin)`. |
| `mark-delivered` | + `UPDATE seller_payouts SET status = 'DUE' WHERE order_id = … AND status = 'PENDING'` dans la même transaction (exigibilité, **pas** de paiement). |
| `seller-payout` | Précondition réseau V3 `orders.status ∈ {PRODUCT_RECEIVED,…,COMPLETED}` + `seller_payouts.status = PENDING` → **`orders.status ∈ {DELIVERED, COMPLETED}`** **et** `seller_payouts.status = 'DUE'`. Ordre des gardes : (1) payout absent ou `PAID` → `PAYOUT_NOT_PENDING` ; (2) statut commande hors `{DELIVERED, COMPLETED}` → `ORDER_NOT_ALLOWED` + `currentStatus` ; (3) payout ≠ `DUE` → `PAYOUT_NOT_PENDING` (défensif). Reste sans changement de `orders.status` ni d'`order_event` (D-V3-3/4). |
| `getStats` | + `payoutsDue` (`COUNT … status='DUE'`), `payoutsDueAmount` (`COALESCE(SUM(amount) FILTER (WHERE status='DUE'), 0)`), `orders` (COUNT FILTER par statut : `paymentPending, productWaiting, productReceived, preparing, shipped, inDelivery, delivered, completed`). Les 4 compteurs V3 (`users, pendingProducts, activeOrders, pendingPayouts`) restent. |
| Filtre `GET /admin/orders?payout=` | `pending`·`paid` → **`pending`·`due`·`paid`**. |
| `adminActionTypes` | + `'order.shipped'` (entre `delivery.started` et `order.delivered`). |

**Matrice de transitions YAML (Δ §11.4)** — lignes remplacées :

```yaml
PREPARING:        [SHIPPED]
SHIPPED:          [IN_DELIVERY]
```

**Preuves @backend (22/09/2026)** : `npm run db:migrate` → `006` + `007` appliquées sur la BDD de dev ; enum `order_status` à 12 valeurs, `payout_status` à 3 valeurs (`DUE` après `PENDING`), `notification_type` à 16 (15 + `order_shipped`) ; trigger recréé avec `PREPARING→SHIPPED` + `SHIPPED→IN_DELIVERY` ; index partiels avec `'SHIPPED'`. `npm run typecheck` ✓, `npm run build` ✓, `npm test` ✓ (12 suites, 185 tests, 0 échec).