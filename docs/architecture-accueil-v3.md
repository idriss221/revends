# Architecture « Accueil V3 » — Spécification technique

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente (Côte d'Ivoire) |
| **Chantier** | Accueil V3 : refonte de l'accueil en page de découverte |
| **Auteur** | @architecte |
| **Version** | 1.0 — à valider par @chef-de-projet (écarts ouverts §10) |
| **Sources** | `docs/cahier-des-charges-v4-accueil.md` (v0.9 + arbitrages 23/09/2026), `docs/api.md`, `docs/design-system.md`, code réel `server/src/*` et `web/src/*` |
| **Statut migration** | `migrations/008_accueil_v3.sql` — **prouvée** (001→008 appliqués sur Postgres 16 scratch, vérifié) |

---

## 1. Périmètre et règle d'or

Le chantier transforme l'accueil (`web/src/pages/HomePage.tsx`) en page de découverte (carrousel → catégories → vues récentes → sections produits → recommandations → footer) et délègue recherche & catégories à des pages dédiées. **Règle d'or (CA-NR) : aucune route, aucun contrat de réponse, aucun composant partagé existant n'est supprimé ou renommé sans compatibilité.**

Ce document verrouille : la migration 008, le contrat d'API étendu, le nouveau périmètre frontend, et les risques. Il **ne contient pas** de code applicatif (le backend/le front suivent ce contrat).

---

## 2. Décisions d'architecture (A-01 … A-15)

| # | Décision | Choix | Justification / conséquence |
|---|---|---|---|
| A-01 | **Noms des sections** | `recent \| discount \| popular \| promo \| newest \| discover` | Alignement sur le **contrat publié** (§7.1, RG-PROD-6, §8 « Voir plus » : URLs `/search?section=discount…`). L'énoncé de mission citait d'autres libellés — écart documenté §10-1. Perte : aucun libellé : les titres FR restent côté front (D-ACC-5). |
| A-02 | **Seuil « Promotions »** | `promo` = `old_price IS NOT NULL AND discount_pct >= 15` (RG-PROD-6, SEC-4) | L'énoncé de mission (promo = old_price NOT NULL seul) contredit RG-PROD-6 → c'est la règle de gestion qui gagne. Écart §10-4. |
| A-03 | **`ids` (vues récentes)** | borné à **20** (CA-ACC-71), réponse **dans l'ordre de la liste**, produits non AVAILABLE ignorés | Le contrat dit ≤ 20 ; les vues récentes ≤ 8 (CA-ACC-34) entrent dedans. L'énoncé de mission disait 12 → écart §10-3. Ordre garanti par re-tri JS côté service (déterministe, indépendant de l'ordre SQL). |
| A-04 | **`not_in`** | paramètre dédié, ≤ 100 ids, exclusion `id <> ALL(…)` | Dédoublonnage des sections (PO-ACC-3) : l'accueil compose ses sections séquentiellement en passant l'union des ids déjà affichés → sections pleines, zéro chevauchement visible. |
| A-05 | **`section` vs `sort`** | **mutuellement exclusifs → 400** (zod `superRefine`) | Contrat §7.1. `sort` devient `optional` dans le schéma, le défaut `recent` est appliqué dans le service (comportement observable inchangé → non-régression CA-NR-03). |
| A-06 | **Filtre `location` et `brand`** | **ILIKE partiel** (comme RG-PROD-5 / §7.1) | Le dropdown PO-ACC-2 envoie la valeur exacte issue des valeurs distinctes ; l'ILIKE partiel inclut en bonus les sous-localités (« Abidjan » matche « Abidjan - Cocody »). Valeur trimmée, max 100 chars. |
| A-07 | **Localisations pour le filtre** | **endpoint dédié `GET /api/products/locations`**, déclaré **AVANT** `GET /:identifier` | Propre (cacheable, dédié au dropdown), routé explicitement avant la route dynamique (risque d'ordre résolu à la racine, §9-R1). Renvoie `{ locations: string[] }` : valeurs distinctes de `products.location` (status AVAILABLE), tri alpha, max 200. |
| A-08 | **Bannières — seed** | **Pas de seed dans la migration.** Seed côté code (`db/seed.ts → seedBannersIfEmpty()`), **exécuté au démarrage serveur**, **uniquement si la table est vide** (`ON CONFLICT (position) DO NOTHING`) | Les migrations ne portent que de la structure ; un seed en migration serait gravé (impossible à éditer par le futur CRUD admin, PO-ACC-4) et lié à la table `schema_migrations` (1 seule application). Le seed code est idempotent et n'écrase jamais les données admin futures (garde `COUNT(*) = 0`). Le contenu exact (titres, liens) reste défini par @chef-de-projet (PO-ACC-4) : il vit dans une constante du code, pas dans les migrations. |
| A-09 | **`view_count`** | incrément **+1 atomique** `UPDATE products SET view_count = view_count + 1 WHERE id = $1 AND status IN ('AVAILABLE','RESERVED') RETURNING view_count`, **best-effort** (échec non-fatal, loggé) | CA-ACC-58 (2 consultations → +2 vérifiable). PENDING/REJECTED 404 déjà → jamais incrémentés (§7.1). Un UPDATE monostatement est atomique — pas besoin de `withTransaction`. Le `RETURNING` permet de renvoyer le compteur frais dans la fiche. |
| A-10 | **Contact vendeur** | `POST /api/products/:id/contact` — `requireUser` (convention existante : rôle 'user' uniquement), corps `{ message: string 10..2000, email?: string ≤255 }`, **201 `{ ok: true }`**, notification interne `product.contact` via `insertNotification` **dans une transaction** (`withTransaction`), 400 si demandeur = vendeur | PO-ACC-1 option (b). Le `email` optionnel vient de CA-ACC-57 (email d'échange, préfilled) et est concaténé au message dans la notification. **`users.phone` jamais exposé (D2)** — la réponse ne contient que `{ ok: true }`. Admin → 403 (requireUser), assumé. |
| A-11 | **`discover`** | **stable par jour** : `ORDER BY md5(current_date::text || p.id::text), p.id` | PO-ACC-6 (« date + modulo id ») : déterministe, stable à chaque refresh du jour, change le lendemain, sans table ni état. Coût : tri complet des AVAILABLE (acceptable à l'échelle marché ; note perf §8-P4). |
| A-12 | **localStorage** | `revends:recently-viewed` + `revends:favorites`, schémas §6.2 | D-ACC-4. Vues récentes max 8 sans doublons (CA-ACC-33/34), favoris = liste d'ids (CA-ACC-30). |
| A-13 | **Routes frontend** | `/` accueil sections ; `/search` (recherche + catalogue paginé = ex-rôle accueil) ; `/category/:slug` ; `/catalogue/:slug` conservée | D-ACC-6/7. Redirection `/?q=…` → `/search?q=…` dans HomePage (filet, CA-ACC-24). |
| A-14 | **Footer** | composant `components/layout/Footer.tsx`, **inclus par page** (accueil, search, category, catalogue, panier, login, register) | D-ACC-8 + CA-ACC-65. Les pages « dashboard » privées gardent leur layout (Sidebar/DashboardLayout) — le footer ne touche pas aux flux privés. |
| A-15 | **Composants accueil** | `ProductSection` générique (titre + requête + grille + « Voir plus ») pour les 6 sections, les vues récentes et « Recommandé pour vous » | CA-ACC-43 : structure de rendu extensible vers un futur moteur de recommandation. |

**Écarts potentiels avec l'énoncé de la mission : voir §10 (à arbitrer par @chef-de-projet).**

---

## 3. Migration `008_accueil_v3.sql`

Fichier : `revends/server/migrations/008_accueil_v3.sql` — pur SQL, appliqué par `npm run db:migrate` (chaque fichier une fois, transactionnel, table `schema_migrations`).

Contenu :

1. **`products.old_price INTEGER NULL`** + `CONSTRAINT products_old_price_gt_price CHECK (old_price IS NULL OR old_price > price)` + `CONSTRAINT products_old_price_max CHECK (old_price IS NULL OR old_price <= 10000000)` — D-ACC-2, RG-PROD-2.
2. **`products.view_count INTEGER NOT NULL DEFAULT 0`** + `CONSTRAINT products_view_count_nonneg CHECK (view_count >= 0)` — D-ACC-3, RG-PROD-3.
   + **`CREATE INDEX idx_products_view_count ON products(view_count DESC, id) WHERE status = 'AVAILABLE'`** — même pattern que les index prix (001 §products) ; sert `sort=popular` et `section=popular`.
3. **Table `banners`** : `id BIGSERIAL PK`, `title VARCHAR(120) NOT NULL`, `subtitle VARCHAR(255)`, `image_path VARCHAR(255)` (URL relative locale `/categories/…` ou `/uploads/…`, NULL = bannière sans image, CA-ACC-09), `link_url VARCHAR(500)` (route interne ou URL externe, NULL = non cliquable), `position SMALLINT NOT NULL UNIQUE` (contrainte nommée `banners_position_unique`), `active BOOLEAN NOT NULL DEFAULT TRUE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. **Pas d'index partiel sur active** : à cette échelle (≤ dizaines de lignes) la contrainte UNIQUE(position) couvre l'ORDER BY et le filtre active est trivial (décision documentée dans la migration).
4. **`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'product.contact'`** — requis car `notifications.type` est un ENUM Postgres (001). Pattern identique à 003/006. Valeur utilisable **après** commit de 008 (règle PG, déjà appliquée pour SHIPPED en 006→007).

**DOWN** : noté en commentaire au fil des blocs (DROP CONSTRAINT/DROP COLUMN/DROP INDEX/DROP TABLE ; `ALTER TYPE … ADD VALUE` non réversible sans recréation du type — documenté).

**Prouvé** le 23/09/2026 : chaîne `001 → 007 → 008` appliquée sur Postgres 16 (base scratch), colonnes/contraintes/index/table/enum vérifiés, et rejet effectif vérifié (`old_price ≤ price` → violation `products_old_price_gt_price`, `view_count = -3` → violation `products_view_count_nonneg`).

---

## 4. Modèle de données (état après 008)

```
products
  + old_price   INTEGER NULL        -- > price si renseigné, ≤ 10 000 000 (RG-PROD-2)
  + view_count  INTEGER NOT NULL DEFAULT 0  -- ≥ 0, incrémenté +1/consultation publique (RG-PROD-3)

banners (nouvelle)
  id BIGSERIAL PK · title VARCHAR(120) NOT NULL · subtitle VARCHAR(255) NULL
  image_path VARCHAR(255) NULL · link_url VARCHAR(500) NULL
  position SMALLINT NOT NULL UNIQUE · active BOOLEAN NOT NULL DEFAULT TRUE
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()

notifications — type ENUM + 'product.contact' (aucun changement de colonne)
```

Point de vérité : une seule base (SQLite/Postgres partagé — ici Postgres, inchangé). Aucune donnée dupliquée côté client : `oldPrice`/`viewCount` viennent de la BDD (RG-PROD-7), jamais calculés dans le front (seul `discountPct` y est calculé, RG-PROD-4).

---

## 5. Contrat API backend

### 5.1 `GET /api/products` — extension (rétrocompatible, CA-NR-03/CA-ACC-71)

Le schéma zod `catalogQuerySchema` (validation.ts) est étendu — tous les paramètres nouveaux sont **optionnels** :

| Paramètre | Type / bornes | Comportement |
|---|---|---|
| `q` | string ≤ 120 (inchangé) | **Étendu** (RG-PROD-5) : `p.name`, `p.description`, `p.brand`, `p.location`, `c.name` (catégorie), `sc.name` (sous-catégorie) — ILIKE `%terme%`, terme trimmé. |
| `category_id` | nombre (inchangé) | racine → sous-cats incluses (`sc.id IN (SELECT id FROM categories WHERE parent_id = …)`) ; sous-cat → `p.category_id = …` (comportement existant conservé). |
| `subcategory_id` | nombre (nouveau) | `AND sc.id = $n` — cible précise, se combine avec `category_id`. |
| `price_min` / `price_max` | entiers ≥ 0 (nouveau) | `price_min ≤ price ≤ price_max` ; `price_max < price_min` → 400 (zod refine). |
| `condition` | enum 5 valeurs FR (nouveau) | `p.condition = $n` (valeurs : `Neuf, Très bon état, Bon état, Correct, À réparer` — URL-encodées). |
| `location` | string ≤ 100, trimmé (nouveau) | `p.location ILIKE %valeur%` (A-06). |
| `brand` | string ≤ 100, trimmé (nouveau) | `p.brand ILIKE %valeur%` (A-06). |
| `sort` | `recent \| price_asc \| price_desc \| popular` (étendu) | `popular` → `ORDER BY p.view_count DESC, p.id`. Défaut `recent` appliqué dans le service (A-05). |
| `section` | `recent \| discount \| popular \| promo \| newest \| discover` (nouveau) | Preset §5.2. **Exclusif avec `sort` → 400.** |
| `ids` | liste séparée par virgules, **≤ 20**, entiers (nouveau) | `p.id = ANY($ids)` **+ status AVAILABLE uniquement** ; réponse **dans l'ordre de la liste** (re-tri JS) ; pagination ignorée (`page=1`, `perPage=len(ids)` renvoyés) ; ids introuvables/invalides ignorés. |
| `not_in` | liste séparée par virgules, **≤ 100**, entiers (nouveau) | `p.id <> ALL($ids)` ; s'applique aussi au COUNT. |
| `page` / `per_page` | inchangés (per_page ≤ 48, défaut 12) | ignorés si `ids` présent. |

Règle globale inchangée : **status = 'AVAILABLE' uniquement** (RG-PROD-8). Réponse : `{ items, page, perPage, total, totalPages }` (schéma inchangé).

### 5.2 Semantique des sections (presets backend)

| `section` | WHERE ajouté | ORDER BY exact | Équiv. « Voir plus » front (contrat §8) |
|---|---|---|---|
| `recent` | — | `p.created_at DESC, p.id` | `/search?sort=recent` |
| `discount` | `p.old_price IS NOT NULL` | `(1 - p.price::numeric / p.old_price) DESC, p.id` | `/search?section=discount` |
| `popular` | — | `p.view_count DESC, p.id` | `/search?sort=popular` |
| `promo` | `p.old_price IS NOT NULL AND ROUND((1 - p.price::numeric / p.old_price) * 100) >= 15` | `(1 - p.price::numeric / p.old_price) DESC, p.id` | `/search?section=promo` |
| `newest` | `p.created_at >= now() - interval '14 days'` | `p.created_at DESC, p.id` | `/search?section=newest` |
| `discover` | — | `md5(current_date::text || p.id::text), p.id` (stable/jour, A-11) | `/search?section=discover` |

Interaction filtres/section : les filtres (`q`, `category_id`, `subcategory_id`, `price_min/max`, `condition`, `location`, `brand`, `not_in`) se **combinent en AND** avec le WHERE du preset ; seul `sort` est interdit. Ex. `section=promo&category_id=3&price_max=50000` fonctionne.

### 5.3 Nouveau service `getCatalog` — signature cible (contrat de refactorisation)

```ts
interface CatalogQuery {
  q?: string; categoryId?: number; subcategoryId?: number;
  priceMin?: number; priceMax?: number; condition?: string;
  location?: string; brand?: string;
  sort?: 'recent' | 'price_asc' | 'price_desc' | 'popular';
  section?: 'recent' | 'discount' | 'popular' | 'promo' | 'newest' | 'discover';
  ids?: number[]; notIn?: number[];
  page: number; perPage: number;   // défauts posés par le schéma
}
getCatalog(opts: CatalogQuery): Promise<{ items; page; perPage; total; totalPages }>
```

Construction SQL suivante (recommandations) :

1. Tableau `where: string[]` initialisé à `["p.status = 'AVAILABLE'"]` ; `params: unknown[]` — **pattern existant conservé** (la jointure `sc`/`c` du PRODUCT_SELECT sert déjà les filtres catégorie).
2. Filtres ajoutés dans l'ordre du schéma (q → category → subcategory → prix → condition → location → brand → notIn).
3. `ids` : bascule sur un chemin dédié (WHERE ids + AVAILABLE), puis réordonnancement en JS selon l'ordre reçu (map id→ligne, puis assemblage dans l'ordre des ids demandés — garantit la réponse « dans l'ordre de la liste », A-03).
4. `orderBy` : `popular` ajouté ; `section` remplace tout `sort` (déjà exclusif côté schéma).
5. `COUNT(*)` avec le même `where` (hors ids), pagination inchangée.

Cas particuliers verrouillés :
- `ids` + autre filtre : l'énoncé du contrat reste « `ids` et uniquement la disponibilité » — les autres filtres sont **ignorés** quand `ids` est présent (contrat simple pour vues récentes). Documenter dans api.md.
- `per_page` par défaut : 12, inchangé. L'accueil passe explicitement `per_page=10` (CA-ACC-22).

### 5.4 `GET /api/products/locations` (nouveau)

- **Ordonner la déclaration AVANT `GET /:identifier`** (risque R1 §9) : `products.routes.ts` — `locations` serait sinon interprété comme un slug → 404/sélecteur mort.
- SQL : `SELECT DISTINCT location FROM products WHERE status = 'AVAILABLE' AND location <> '' ORDER BY location ASC LIMIT 200`.
- Réponse : `{ locations: string[] }` (camelCase, champ unique `locations`).
- Public, sans auth. Filtre `location` du catalogue = ILIKE partiel (A-06) : le dropdown peut ainsi renvoyer la valeur exacte.

### 5.5 `GET /api/banners` (nouveau)

- Nouveau routeur `server/src/routes/banners.routes.ts` (choix net : fichier dédié, comme categories/products) + service `server/src/services/banners.service.ts` (`listActiveBanners()`).
- Montage dans `server/src/app.ts` : `app.use('/api/banners', bannersRouter);` (bloc API publique, après `/api/categories`).
- SQL : `SELECT id, title, subtitle, image_path, link_url, position FROM banners WHERE active = TRUE ORDER BY position` (+ `created_at` si utile).
- Réponse (contrat §7.1) :
```json
{ "banners": [ { "id": 1, "title": "…", "subtitle": "…|null",
                 "image": { "url": "/categories/hero.jpg" } | null,
                 "linkUrl": "/search?q=…|null", "position": 1 } ] }
```
- Côté front, `linkUrl` commençant par `/` → navigation React Router interne ; sinon lien externe (`target="_blank"`). `url` locale résolue via `resolveImageUrl` existant (gère `/categories/…` et `/uploads/…`).
- Liste vide / erreur → la section carrousel est masquée (CA-ACC-07), jamais d'écran bloquant.

### 5.6 `GET /api/products/:identifier` — incrément de vues

Dans `getPublicProduct` (products.service.ts), après la résolution du produit public (statut AVAILABLE/RESERVED — PENDING/REJECTED 404 avant) :

```sql
UPDATE products SET view_count = view_count + 1
 WHERE id = $1 AND status IN ('AVAILABLE', 'RESERVED')
 RETURNING view_count
```

- Atomicité : un seul UPDATE (pas de transaction multi-étapes nécessaire).
- Best-effort : `try/catch` avec log, **jamais une 500 de la fiche** pour un compteur (résilience).
- Assigner le `RETURNING` dans la ligne produit → la réponse `serializeProductDetail` porte `viewCount` à jour (CA-ACC-58 vérifiable : 2 GET → +2).

### 5.7 `POST /api/products/:id/contact` (nouveau, PO-ACC-1)

- Déclaré dans `products.routes.ts` (l'endpoint vit avec le produit ; pas de `/me/…` car l'expéditeur n'est pas le propriétaire de la ressource).
- `requireUser` (middleware existant — un admin reçoit 403, convention conservée).
- Schéma zod `contactSellerSchema` : `{ message: z.string().trim().min(10).max(2000), email: z.string().email().max(255).optional() }`.
- Pipeline service `contactSeller(userId, productId, input)` :
  1. `withTransaction` : `SELECT id, owner_id, status, name FROM products WHERE id = $1 FOR UPDATE`.
  2. 404 `PRODUCT_NOT_FOUND` si introuvable **ou** statut ∉ {AVAILABLE, RESERVED} (RG-PROD-8 : PENDING/REJECTED/SOLD ne sont pas contactables).
  3. 400 `CONTACT_SELF` si `owner_id === userId` (bouton front désactivé, mais le serveur est l'autorité).
  4. `insertNotification(client, owner_id, 'product.contact', `Nouveau message à propos de « ${name} »`, message + (email ? `\nContact : ${email}` : ''))` — **dans la même transaction** (pattern N1 existant).
  5. Retour `{ ok: true }`.
- Statut : **201 Created** (une ressource — la notification — est créée). Réponse minimale `{ ok: true }`.
- **D2** : `users.phone` du vendeur n'apparaît nulle part (ni requête, ni réponse, ni notification).
- Durcissement recommandé : `rateLimit({ windowMs: 10 * 60 * 1000, max: 30 })` (middleware existant, bypass test déjà géré) — endpoint spamable.
- Typage : ajouter `'product.contact'` à l'union `NotificationType` (notifications.service.ts).
- 400 automatique de zod (message trop court/long, email invalide) → format `VALIDATION_ERROR` existant.

---

## 6. Contrat frontend

### 6.1 Routes `web/src/App.tsx`

| Route | Page | Notes |
|---|---|---|
| `/` | `HomePage` (réécrite) | Carrousel + catégories + vues récentes + sections + recommandé + footer. **Si `?q=` non vide → `<Navigate to="/search?q=…" replace />`** (CA-ACC-24, D-ACC-6). |
| `/search` | `SearchPage` (nouvelle) | Tous les paramètres catalogue (§5.1) dans l'URL : `q`, `category_id`, `subcategory_id`, `price_min`, `price_max`, `condition`, `location`, `brand`, `sort`, `section`, `page`. Sans `q` = catalogue paginé (ex-rôle accueil, CA-ACC-46). |
| `/category/:slug` | `CategoryPage` (nouvelle) | Résolution `slug → sous-catégorie racine` via `GET /api/categories` (D-ACC-7) ; 404 site si slug inconnu/inactif (CA-ACC-15) ; requête `category_id=<racine>` (sous-cats incluses) ; bandeau + titre + « X articles » (CA-ACC-14/16). |
| `/catalogue/:slug` | `ProductPage` (conservée) | + oldPrice/badge, favori, contact vendeur, viewCount, écriture vues récentes (§6.4). |

Cibles « Voir plus » des sections (contrat §8 du cahier) : reprises telles quelles dans `ProductSection` (§ 5.2).

### 6.2 localStorage — schémas (A-12)

Clé `revends:recently-viewed` — JSON tableau, **max 8, dédupliqué par `id`, plus récent en tête** (CA-ACC-33/34), survit au rechargement et à la déconnexion (CA-ACC-39) :

```json
[ { "id": 42, "slug": "iphone-12", "name": "iPhone 12", "price": 250000,
    "oldPrice": 300000, "imageUrl": "/uploads/products/….jpg",   // null autorisé
    "categoryId": 1,     // RACINE (déjà exposée par ProductCardItem.category.id)
    "ts": 1759000000000 } ]
```

- Écrit à la consultation d'une fiche (`ProductPage`, après succès du fetch — upsert en tête, tronque à 8). `categoryId` = racine fournie par la carte/détail (le backend expose déjà `category.id` = racine via `categorySection`).
- Affichage : **toujours reconstruit depuis `GET /api/products?ids=<ids>`, jamais le snapshot local** (CA-ACC-37). Les ids absents de la réponse (supprimés/indisponibles) sont retirés du stockage (CA-ACC-38).

Clé `revends:favorites` — JSON tableau d'ids : `[42, 57]` (CA-ACC-30). Persistant, sans doublon. Aucune limite stricte (page « Mes favoris » hors périmètre). Clic cœur → toggle, **sans navigation** (CA-ACC-30).

Hooks : `web/src/hooks/useRecentlyViewed.ts` (get/add/touch/removeStale, dédupe, cap 8) et `web/src/hooks/useFavorites.ts` (isFavorite/toggle/list).

### 6.3 Composants à créer / à faire évoluer

Nouveaux (`web/src/`) :
- `components/home/BannerCarousel.tsx` — auto-rotation 5 s (±1 s), pause hover/focus, flèches (aria-label « Bannière précédente/suivante »), pastilles cliquables, hauteur 420/300 px, bannières sans image OK (CA-ACC-01..09).
- `components/home/ProductSection.tsx` — **générique** : `{ title, params, hrefVoirPlus, excludeIds }` → lance `api.products({...params, per_page: 10, not_in: excludeIds})`, masque si < 4 items (CA-ACC-20), grille ≤ 10 (CA-ACC-22), bouton « Voir plus ».
- `components/home/HomeSections.tsx` — compose les 6 sections dans l'ordre du tableau §5.2 **avec dédoublonnage progressif** (PO-ACC-3) : état interne `seenIds`, chaque section passe `not_in=seenIds` puis ajoute les siennes ; ≥ 4 sections affichées (CA-ACC-17) ; « Vus récents » + « Recommandé pour vous » réutilisent ProductSection.
- `components/home/RecentViews.tsx` — section vues récentes (6 max, CA-ACC-35), masquée si vide (CA-ACC-36).
- `components/catalog/FiltersPanel.tsx` — filtres sous-catégorie (dropdown), prix min/max, état, localisation (dropdown depuis `GET /api/products/locations` + option « Toutes les localisations », PO-ACC-2), marque ; tri 4 options (CA-ACC-51) ; badges retirables ; URL reflète tout (CA-ACC-52) ; toute modif → page 1 (CA-ACC-53). Réutilisé par SearchPage et CategoryPage.
- `components/catalog/CategoryPanel.tsx` — « Voir toutes les catégories » : racines + sous-catégories actives, clic → `/category/<slug-racine>?subcategory_id=<id>` (CA-ACC-13).
- `components/catalog/FavoriteButton.tsx` — cœur plein/contour, `stopPropagation`, aucune navigation.
- `components/layout/Footer.tsx` — 3 colonnes (Catégories réelles via `GET /api/categories`, Acheter, Vendre), liens existants uniquement (CA-ACC-66/67), empilé < 640 px (CA-ACC-68).

Évolutions :
- `components/catalog/ProductCard.tsx` — **carte compacte** : ancien prix barré + badge « -X % » si `oldPrice > price` (RG-PROD-4), cœur favori (coin supérieur droit), compteur de vues si `viewCount > 0` (CA-ACC-28), lien stretch conservé (CA-ACC-31), bouton panier + flash vert conservés à l'identique (CA-ACC-32). Grille 5/ligne ≥ 1280px, 2/ligne ≤ 640px (CA-ACC-25), images uniformes `object-cover` (CA-ACC-26), fallback `FALLBACK_PHOTO` (CA-ACC-29).
- `components/catalog/CategoryCards.tsx` — tuiles **liens** → `/category/<slug>` (CA-ACC-12), hauteur uniforme (±4 px), « Voir toutes les catégories » (CA-ACC-10/11/13).
- `pages/ProductPage.tsx` — prix barré/badge, favori synchronisé (CA-ACC-56), modale contact (message + email préfilled ; bouton désactivé si propriétaire ; toast « Message envoyé au vendeur », CA-ACC-57), vues (CA-ACC-58), « Vous aimerez aussi » conservé (exclut le produit courant, ≤ 8, CA-ACC-59).
- `components/layout/Navbar.tsx` — **1 seul changement fonctionnel** : `submit` → `/search?q=` (CA-ACC-44, D-ACC-6) ; champ pré-rempli depuis le `?q=` courant (mécanisme existant).

### 6.4 Librairies & types

- `web/src/lib/types.ts` : `ProductCardItem` += `brand: string \| null; oldPrice: number \| null; viewCount: number` ; `ProductDetail` += `oldPrice: number \| null; viewCount: number` (+ `brand` déjà présent) ; nouveaux types `Banner`, `BannerImage`, `ProductsQuery` (params API), `LocationsResponse` (miroir contrat §5).
- `web/src/lib/api.ts` : `api.products()` accepte les nouveaux params (build query string) ; `api.banners()`, `api.productLocations()`, `api.contactSeller(id, { message, email? })`.
- `web/src/lib/format.ts` : helper `discountPct(price, oldPrice)` = `round((1 - price / oldPrice) * 100)` (RG-PROD-4) + tests (`format.test.ts`).
- Pas de nouvelle dépendance front/back (A-15 : React Router v7 + TanStack Query existants suffisent).

---

## 7. Ordre des déclarations dans `products.routes.ts` (verrouillage)

```ts
productsRouter.get('/', ...)                 // catalogue (existant)
productsRouter.get('/locations', ...)        // NOUVEAU — AVANT /:identifier (A-07, R1)
productsRouter.get('/:identifier', ...)      // fiche + incrément view_count
productsRouter.post('/', ...)                // création (existant)
productsRouter.post('/:id/contact', ...)     // NOUVEAU (contact) — aucune collision de méthode
productsRouter.put('/:id', ...)              // existant
productsRouter.delete('/:id', ...)           // existant
```

---

## 8. Points d'attention et risques (non-régression)

| # | Risque | Impact | Mitigation |
|---|---|---|---|
| R1 | **Ordre des routes Express** : `GET /locations` attrapé par `GET /:identifier` (slug "locations") | Endpoint filtre mort / 404 trompeur | Déclaration explicite AVANT `/:identifier` (§7). Test d'intégration `GET /api/products/locations` → 200 et liste. |
| R2 | **`PRODUCT_SELECT` étendu** (`old_price`, `view_count`) — consommateurs : `orders.service` (ORDER summaries), `buildOwnerProduct`, `buildAdminProduct`, `getPublicProduct`, `listOwnProducts` | Sérialiseurs qui ne connaissent pas les nouvelles colonnes → TS error ou champs perdus | `ProductRow` (serializers.ts) gagne `old_price: number \| null` et `view_count: number` ; les sérialiseurs existants construisent leurs objets champ par champ (aucun spread destructeur) → ajout **additif**, non bloquant. Vérif : `npm run typecheck` + tests existants. |
| R3 | **Seed banners ni migration, ni écrasement admin** | Bannières absentes en prod si le seed n'est pas exécuté, ou seed qui écrase les données admin | `seedBannersIfEmpty()` appelé au démarrage (index.ts) **avant** `listen`, garde `COUNT(*) banners = 0`, `ON CONFLICT (position) DO NOTHING`. Jamais de data dans les migrations (A-08). |
| R4 | **Redirection `/?q=`** (CA-ACC-24) | Boucle/boucle de redirection, perte de query | `<Navigate replace />` dans HomePage sur `q` non vide AVANT tout rendu de sections ; Navbar n'envoie plus jamais `/?q=`. |
| R5 | **`category_id` racine inclus sous-cats** (pattern existant `sc.id IN (…)`) | Le nouveau `subcategory_id` doit rester cohérent (sous-cat d'une racine) | Combinaison AND simple ; si sous-catégorie non liée à la racine → résultat vide naturel (pas d'erreur). Contractuel : CategoryPage n'envoie `subcategory_id` que depuis le panneau catégories (CA-ACC-13). |
| R6 | **`section` + `sort` exclusifs** vs défaut `sort='recent'` | 400 inattendu sur `section=X&sort` absent | `sort` devient optionnel dans le schéma, défaut dans le service (A-05) ; la présence explicite de `sort` avec `section` → 400 par superRefine. CA-NR-03 vérifié par les tests existants (`GET /api/products` sans paramètre = identique). |
| R7 | **`view_count` best-effort** | Compteur faux si UPDATE échoue, ou fiche en 500 | try/catch + log serveur ; jamais bloquant pour la fiche. |
| R8 | **Rétrocompatibilité `serializeProductCard`** | `oldPrice`/`viewCount`/`brand` ajoutés → champ manquant chez un consommateur supposant l'ancienne forme | Ajout **additif** uniquement (front types.ts gagne les champs en optionnel-compatible : `oldPrice: number \| null` etc.). CA-NR-01..06. |
| R9 | **`q` étendu (brand, location, catégories)** | Résultats recherche plus larges qu'avant | Comportement voulu (CA-ACC-45) ; borné par max 120 chars + échappement paramétré (pas d'injection, CA-ACC-48). |
| P1 | Perf `sort=popular` : index manquant | Seq scan sur gros catalogue | Index `idx_products_view_count` (008) — même pattern que prix. |
| P2 | Perf filtres `location`/`brand` ILIKE | Seq scan (pas d'index trgm sur ces colonnes) | Accepté à l'échelle actuelle ; si besoin, index GIN trgm dédiés plus tard (hors périmètre V4). |
| P3 | Perf `discover` (md5 sort) | Tri complet des AVAILABLE à chaque requête | Accepté (catalogue ≤ dizaines de milliers) ; borné par `LIMIT perPage`. |
| P4 | Contacter le vendeur = spam | Notification flood du vendeur | rateLimit (30/10 min/IP) recommandé sur la route (§5.7) + message borné 10..2000. |
| P5 | **En-têtes Téléphone (D2)** | fuite du vendeur | `contactSeller` ne sélectionne que `owner_id/status/name` ; la notification ne contient que message+email du demandeur ; sérialiseur vendeur inchangé (PublicUser sans phone). |

**Fichiers backend impactés** : `migrations/008_accueil_v3.sql` (nouveau), `routes/products.routes.ts`, `routes/banners.routes.ts` (nouveau), `app.ts`, `services/products.service.ts`, `services/banners.service.ts` (nouveau), `services/notifications.service.ts` (type), `utils/validation.ts`, `utils/serializers.ts`, `db/seed.ts`, `index.ts`.

**Fichiers frontend impactés** : `App.tsx`, `pages/HomePage.tsx`, `pages/SearchPage.tsx`+`CategoryPage.tsx` (nouveaux), `pages/ProductPage.tsx`, `components/layout/Navbar.tsx` + `Footer.tsx` (nouveau), `components/catalog/ProductCard.tsx`, `CategoryCards.tsx`, `CategoryPanel.tsx`+`FiltersPanel.tsx`+`FavoriteButton.tsx` (nouveaux), `components/home/*` (nouveaux), `hooks/useRecentlyViewed.ts`+`useFavorites.ts` (nouveaux), `lib/api.ts`, `lib/types.ts`, `lib/format.ts` (+ tests).

---

## 9. Ordre d'implémentation recommandé

1. **Migration 008** + `db:migrate` (prouvée) + `seedBannersIfEmpty` (A-08).
2. **Backend contrat** : serializers (ProductRow + card/detail), validation (catalogQuerySchema + contactSchema), `getCatalog` étendu (sections + filtres + ids), incrément vues, `locations`, `banners`, `contact`. Typecheck + tests existants verts (CA-QA-01).
3. **Types & client front** : types.ts, api.ts, format.ts (discountPct + tests).
4. **Pages dédiées** : SearchPage (avec FiltersPanel), CategoryPage → décharge HomePage.
5. **Accueil** : BannerCarousel, HomeSections (ProductSection + dédoublonnage), RecentViews, Recommandé, Footer, redirection `/?q=`.
6. **Fiche produit** : ancien prix/badge, favori, contact, vues, vues récentes.
7. **Recette** : grille CA-ACC-xx (D1→D7), CA-NR 01..06, parcours NAV CA-QA-02.

---

## 10. Écarts ouverts — à arbitrer par @chef-de-projet

1. **Noms de section** : l'énoncé de mission citait `best_offers|promotions|new` ; le contrat publié (§7.1/RG-PROD-6/§8) verrouille `discount|promo|newest` et **cette spé suit le contrat** (A-01). À confirmer ou renommer explicitement (coût : répercuter dans les URLs « Voir plus » §8 et le schéma zod).
2. **Forme `image` des bannières** : mission = `imagePath` (champ plat) ; contrat §7.1 = `image: { url } \| null`. Spé suit le contrat (A-08). À confirmer.
3. **Borne `ids`** : mission = 12 ; contrat CA-ACC-71 = 20. Spé = 20 (A-03) — les vues récentes (8) et favoris locaux s'y logent.
4. **Seuil `promo`** : mission = simple `old_price NOT NULL` ; RG-PROD-6/SEC-4 = `discount_pct >= 15`. Spé = ≥ 15 % (A-02).
5. **Admin et contact vendeur** : `requireUser` (rôle 'user' strict, convention existante) → un admin reçoit 403. Si un admin doit pouvoir contacter un vendeur, passer à `requireAuth`. Assumé comme tel.
6. **Contenu du seed banners** (PO-ACC-4) : titres/liens exacts fournis par @chef-de-projet — la constante de seed les accueille ; structure prête (3 bannières).

---

## 11. Preuve de validité (verifie-toujours)

- 23/09/2026 : `008_accueil_v3.sql` appliqué **après 001..007** sur Postgres 16 (base scratch `revends_arch_test`, supprimée ensuite) — statut OK pour les 8 fichiers.
- Vérifié en SQL direct : colonnes/contraintes (`products_old_price_gt_price`, `products_old_price_max`, `products_view_count_nonneg`), index `idx_products_view_count`, table `banners` (PK + `banners_position_unique` + colonnes), enum `notification_type` contient `product.contact`.
- Vérifié le **rejet** : INSERT avec `old_price = 4000 < price = 5000` → violation de contrainte ; `view_count = -3` → violation.
- La chaîne complète (001→008) ne laisse aucune erreur — la base dev existante recevra 008 via `npm run db:migrate` sans toucher à 001..007.