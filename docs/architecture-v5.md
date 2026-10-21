# Architecture V5 — « Sprint Performance & Pro »

**Auteur** : @architecte · **Date** : 2026-09-27 · **Statut** : prêt pour implémentation
**Sources** : `docs/cahier-des-charges-v5.md` (125 CA), `docs/api.md` v2.2, `docs/architecture-accueil-v3.md`, code réel `server/src/`, `web/src/`, `server/migrations/001..008`.
**Environnement de mesure** : PostgreSQL 16.15 sur `127.0.0.1:5433`, jeu reproductible du cahier §9 (50 000 produits, 5 000 commandes, 40 000 notifications, 5 000 paiements, 3 335 payouts).

> Ce document **corrige** plusieurs affirmations du cahier devenues fausses (§1), et **tranche** les décisions laissées à l'architecte (§2.4, §4.4, §6.2, §7.2). Chaque affirmation performance est adossée à une mesure reproductible (§9).

---

## 1. Corrections factuelles (vérifiées avant conception)

| # | Énoncé du cahier / ma première version | Réalité mesurée | Conséquence |
|---|---|---|---|
| **F11** | CA-V5-065 : garde sur « commande active » dont statuts `CREATED, PAYMENT_PENDING, PRODUCT_WAITING, PRODUCT_RECEIVED, PREPARING, SHIPPED, IN_DELIVERY, DELIVERED` | L'enum `order_status` **n'a que 6 valeurs** : `WAITING_PAYMENT, PAYMENT_FAILED, WAITING_SELLER_PAYMENT, SELLER_PAID, COMPLETED, CANCELLED` (`001_init.sql`) | ⚠️ Écrire la liste du cahier = **`invalid input value for enum` → HTTP 500**. La définition retenue est le **complément de la liste terminale du cahier lui-même**, qui est correcte et déjà utilisée par le code : `NOT IN ('COMPLETED','CANCELLED','PAYMENT_FAILED')` (`admin.service.ts:63`). |
| **F12** | CA-V5-071/074 : « 7N » par commande, « les 8 endpoints » | `loadOrderParts` = **8** requêtes (order, product, buyer, seller, payment, payout, events) et le tableau CA-V5-071 compte **9** lignes | Budgets de référence corrigés : `2+8N` et `2+3N` (mesuré §6.1). |
| **F13** | `serializePublicUser(..., {sales:true})` | `users` n'a **aucune colonne `sales`** ; `loadUser` fait `SELECT *` → `row.sales ?? 0` → **`sales: 0` partout** | `test/unit-utils.test.ts:47` fige `sales === 0`. Le refactor §6 **ne doit pas** « corriger » ce comportement : il casserait un test et le contrat (CA-V5-074). Signalé comme dette, hors périmètre. |
| **F14** | 009 : « aucune régression de performance n'est possible » (commentaire que j'avais écrit) | **Faux.** Un index partiel dont le prédicat contient `deleted_at IS NULL` est **inutilisable** par une requête qui ne filtre pas `deleted_at` | Mesuré sur 50 000 produits : sans le filtre `deleted_at`, le catalogue passe de **0,205 ms à 22,564 ms (×106)** et la modération de **0,471 ms à 16,579 ms (×35)**, 1 881 pages lues au lieu de 3. Contrainte de déploiement dur : **009 et le code C4 sont une unité indissociable** (§2.4). |
| **F15** | — | Toute requête authentifiée coûte **3 requêtes** de `express-session` (`SELECT sess`, `SELECT users WHERE id`, `UPDATE session SET expire`, `rolling: true`) | Le compteur de CA-V5-071 **doit exclure ces 3 requêtes**, sinon aucun budget n'est atteignable sur les 6 endpoints authentifiés (`2+3` ≥ `≤2`). Contrat d'instrumentation : §6.3. |

---

## 2. Migration `009_soft_delete_perf.sql`

### 2.1 SQL complet (DDL exécutable, ordre de référence)

Source canonique : `server/migrations/009_soft_delete_perf.sql` (commentaires étendus, sections `DOWN`). Reproduction intégrale ci-dessous — aucune instruction omise ni réordonnée.

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'article_deleted';
DROP INDEX IF EXISTS idx_products_catalog;
CREATE INDEX idx_products_catalog ON products(created_at DESC, id)
    WHERE status = 'AVAILABLE' AND deleted_at IS NULL;
DROP INDEX IF EXISTS idx_products_price_asc;
CREATE INDEX idx_products_price_asc ON products(price ASC, id)
    WHERE status = 'AVAILABLE' AND deleted_at IS NULL;
DROP INDEX IF EXISTS idx_products_price_desc;
CREATE INDEX idx_products_price_desc ON products(price DESC, id)
    WHERE status = 'AVAILABLE' AND deleted_at IS NULL;
DROP INDEX IF EXISTS idx_products_moderation;
CREATE INDEX idx_products_moderation ON products(created_at ASC)
    WHERE status IN ('PENDING', 'REJECTED') AND deleted_at IS NULL;
DROP INDEX IF EXISTS idx_products_view_count;
CREATE INDEX idx_products_view_count ON products(view_count DESC, id)
    WHERE status = 'AVAILABLE' AND deleted_at IS NULL;
DROP INDEX IF EXISTS idx_products_discount_ratio;
CREATE INDEX idx_products_discount_ratio
    ON products (((old_price - price) * 1.0 / old_price) DESC, id)
    WHERE status = 'AVAILABLE' AND deleted_at IS NULL
      AND old_price IS NOT NULL AND old_price > price;
DROP INDEX IF EXISTS idx_orders_buyer_recent; DROP INDEX IF EXISTS idx_orders_buyer;
CREATE INDEX idx_orders_buyer_recent ON orders(buyer_id, created_at DESC, id DESC);
DROP INDEX IF EXISTS idx_orders_seller_recent; DROP INDEX IF EXISTS idx_orders_seller;
CREATE INDEX idx_orders_seller_recent ON orders(seller_id, created_at DESC, id DESC);
DROP INDEX IF EXISTS idx_notifications_unread;
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
DROP INDEX IF EXISTS idx_products_owner_deleted; DROP INDEX IF EXISTS idx_products_owner;
CREATE INDEX idx_products_owner_deleted ON products(owner_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS idx_orders_status_recent;
CREATE INDEX idx_orders_status_recent ON orders(status, created_at DESC, id DESC);
```

### 2.2 Ce qui est ajouté, et pourquoi (CA-V5-082)

| Index | Requête réelle servie | Mesure (50 k) |
|---|---|---|
| `idx_products_discount_ratio` | sections `best_offers` / `promotions` — `ORDER BY ((old_price - price) * 1.0 / old_price) DESC` | **39,628 ms → 0,176 ms (×225)**, 1 881 → 8 pages |
| `idx_orders_buyer_recent` | `listBuyerOrders` : `WHERE buyer_id = $1 ORDER BY created_at DESC, id DESC` | 6,461 ms → **2,968 ms** (4 525 commandes), Sort éliminé |
| `idx_orders_seller_recent` | `listSellerOrders` (symétrique) | même plan que ci-dessus |
| `idx_notifications_unread` | badge non-lues + « tout marquer lu » | **4,828 ms → 2,196 ms (×2,2)**, 196 → 13 pages, Index Only Scan `Heap Fetches: 0` |
| `idx_products_owner_deleted` | `listOwnProducts` : `WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC, id DESC` (perPage=20) | **2,054 ms → 0,333 ms (×6,2)**, 261 → 8 pages, Sort éliminé ⚠️ gain lié à `LIMIT` (à 200 → 1,545 ms ; `perPage ≤ 48`) |
| `idx_orders_status_recent` | `listAdminOrders?status=` : `WHERE status=$1 ORDER BY created_at DESC, id DESC` | **0,166 ms → 0,095 ms**, 66 → 3 pages, Index Only Scan |

⚠️ `idx_products_discount_ratio` **couple** l'index à l'expression d'un `ORDER BY`. L'expression doit rester **rigoureusement identique** (mêmes parenthèses, même `* 1.0`) dans `products.service.ts` ; toute réécriture rend l'index muet **sans erreur**. → extraire l'expression dans une constante exportée par le service, et la figer ici.

### 2.3 Candidats rejetés (mesure à l'appui — PRUDENCE)

| Candidat | Résultat mesuré | Décision |
|---|---|---|
| `idx_orders_status_recent (status, updated_at DESC)` | aucun ORDER BY réel ne trie sur `updated_at` → index muet | **Rejeté** — mais le même index sur `(status, created_at DESC, id DESC)` **est retenu** (§2.2) : l'erreur de colonne, pas le concept, motivait le rejet |
| `idx_payouts_status (status, created_at)` | **absent du plan** : l'`EXISTS` de `listAdminOrders?payout=` est servi par l'index UNIQUE `seller_payouts_order_id_key`, qui filtre le statut en 0,4 ms ; et l'agrégat de `getStats` fait Seq Scan (1,863 ms), qu'aucun index ne servait | **Rejeté** (preuve au niveau du plan, pas du timing) |
| `idx_payments (status)` | aucune requête ne filtre `payments` par `status` seul | **Rejeté** |
| `idx_orders (buyer_id, status)` / `(seller_id, status)` | aucune requête réelle ne filtre par `status` sur ces axes | **Rejeté** |
| `idx_orders_buyer` / `idx_orders_seller` (nu, de 001) | strictement redondants : `(buyer_id, …)` est un préfixe de `idx_orders_buyer_recent` | **Supprimés** par 009 (économie d'écriture à chaque INSERT/UPDATE) |

### 2.4 ⚠️ Décision D1 — contrainte de déploiement (à acter par @chef-de-projet)

`products.deleted_at` + les 6 index produits forment un tout. Deux variantes, **mesurées** sur 50 000 produits dont 5 % supprimés :

| Variante | Prédicat d'index | Requête **avec** `deleted_at IS NULL` | Requête **sans** (code pré-C4) | Verdict |
|---|---|---|---|---|
| **A** (retenue, conforme à l'énoncé) | `WHERE status='AVAILABLE' AND deleted_at IS NULL` | **0,205 ms** (Index Only Scan, 3 pages) | **22,564 ms** ⚠️ (Seq Scan + Sort, 1 881 pages) | ×106 ; **casse si 009 est appliqué seul** |
| **B** (variante sûre) | `WHERE status='AVAILABLE'` (inchangé) | 0,215 ms (Index Scan + filtre résiduel, 58 pages) | 0,225 ms ✅ (modération : 0,542 ms ✅) | **+5 %** vs A, index 1 096 kB au lieu de 1 016 kB, **zéro fenêtre de régression** |

**Décision retenue : A**, parce que `Railway`/`Fly` applique les migrations **au démarrage du nouveau code** (code C4 actif *avant* 009 → ordre sûr). **Contrainte écrite dans la migration (§5 du fichier)** : ne jamais appliquer 009 sur un environnement servant le code pré-C4. Si le déploiement exige migration-d'abord : appliquer 009 **sans sa section 3**, déployer C4, puis rejouer la section 3.

⚠️ **Révision de l'arbitrage (mesures rejouées) — à confirmer par @chef-de-projet.** Une version antérieure de ce document annonçait « B : +63 % ». **C'était faux** : le surcoût réel de B est de **+5 %** (le filtre résiduel ne retire que 10 lignes sur 58 avec 5 % de produits supprimés), très en deçà du seuil de +15 % de CA-V5-075. B est donc aujourd'hui **l'option la plus sûre au regard du risque de déploiement** et son coût est négligeable ; A reste implémentée car l'énoncé l'impose, et elle est meilleure à très grande échelle (`Heap Fetches: 0`, 3 pages au lieu de 58). **Si le processus de déploiement n'est pas garanti, basculer sur B est la décision rationnelle** : elle supprime un risque ×35–×106 pour 5 % de performance sur une seule requête.

### 2.5 Garanties de la migration

- **Aucun `DROP TYPE`** : `'product.contact'` est **conservé** en base et devient inutilisé (ARB-V5-08, CA-V5-099). Retirer une valeur d'un enum PG imposerait de réécrire le type.
- **Idempotence** : `ADD COLUMN IF NOT EXISTS` + `ADD VALUE IF NOT EXISTS` + `DROP INDEX IF EXISTS` avant chaque `CREATE` (PG n'a pas `CREATE INDEX IF NOT EXISTS`).
- `ALTER TYPE … ADD VALUE` est autorisé en transaction depuis PG12 mais **utilisable seulement après COMMIT** — même règle que 006/008. 009 n'insère aucune notification → sûr.
- **Vérifié** : appliquée sur base neuve après 001–008, puis rejouée **3×** sans erreur ; `information_schema`/`pg_indexes` contrôlés (colonne, enum complet, prédicats, pas de doublon).

---

## 3. Modélisation — suppression logique

- `products.deleted_at TIMESTAMPTZ` **nullable, sans default**. `NULL` = vivant.
- **Orthogonal à `status`** (D1) : la suppression **ne modifie pas** `products.status`. Un produit supprimé garde son statut métier pour que l'historique des commandes et les statistiques restent exacts (CA-V5-058).
- **Techniquement obligatoire** (F4) : `orders.product_id` référence `products(id)` **sans `ON DELETE`** → un hard delete d'un produit commandé est impossible en base.
- `'article_deleted'` ajouté à `notification_type` (D5). `'article_rejected'` et `'product.contact'` ne sont **pas** réutilisés.
- **Restauration = opération de base, jamais d'UI** (CA-V5-064) :
  `UPDATE products SET deleted_at = NULL WHERE id = $1;`

---

## 4. C4 — Où poser `deleted_at IS NULL` (28 points de lecture, revue exhaustive)

CA-V5-063 exige la liste complète. `grep -rn "FROM products\|JOIN products" server/src/` → **28 occurrences**, réparties en 3 catégories.

### 4.1 Catégorie A — filtre **obligatoire** (visibilité catalogue / listes / stats)

| Fichier:Ligne | Lecture |
|---|---|
| `products.service.ts:388` | `getCatalog` — page du catalogue (toutes sections/tris) + son `countWhere` |
| `products.service.ts:269` | mode `ids` (`p.id = ANY($1::bigint[])`) |
| `products.service.ts:407`, `:417` | `getPublicProduct` (recharge après réservation expirée) → **404** si supprimé |
| `products.service.ts:539` | `listOwnProducts` |
| `products.service.ts:548` | compteurs `GROUP BY status` de `listOwnProducts` (doit rester cohérent avec `total = items.length`) |
| `admin.service.ts:61` | compteur file de modération `status='PENDING'` |
| `admin.service.ts` (count + page de `listAdminProducts`) | recherche admin (filtres + tri) |
| `admin.service.ts` (détail produit admin) | fiche admin : un produit supprimé sort du set de travail ; la traçabilité reste dans `admin_actions` |

→ Une seule façon de ne rien oublier : `PRODUCT_SELECT` reçoit un `AND p.deleted_at IS NULL` **par défaut**, et les 2 lectures `FROM products WHERE …`/`WHERE slug` non-JOIN sont modifiées à la main (table ci-dessus = liste de contrôle pour la revue).

### 4.2 Catégorie B — écritures et verrous : filtrer **pour garantir le 404 atomique**

`expiry.service.ts` (×4), `products.service.ts` (×5 `FOR UPDATE`, dont l'ancien `deleteProduct`), `orders.service.ts` (`FOR UPDATE`), `admin.service.ts` (`FOR UPDATE`).

Ces lectures verrouillent une ligne **à l'intérieur d'une transaction** : y ajouter `deleted_at IS NULL` est sûr et donne le **404 dans la même transaction** que l'écriture (pas de TOCTOU). Règle : **toute prise de verrou est précédée de la même condition** ; le job d'expiration saute simplement un produit supprimé (et ne peut pas de toute façon coxister : `RESERVED` implique une commande active, donc la garde §4.4 l'interdit).

### 4.3 Catégorie C — lecture d'historique : filtre **exonéré, délibérément**

`orders.service.ts:59` (`loadOrderParts` → `PRODUCT_SELECT … WHERE p.id = $1`) et les 6 `JOIN products` d'`admin.service.ts` (détail/liste commande).

**Pourquoi l'exonération est un choix, pas un oubli** : filtrer ici rendrait **inaccessible une commande historique** dont le produit a été supprimé (`GET /api/orders/:id` → 404, fiche commande admin cassée) — régression bien plus grave qu'une lecture non filtrée. Un produit supprimé **doit** rester résolvable par l'historique ; il est en revanche **inaccessible publiquement** (catégorie A). Le `productSummary` d'une commande ne montre que `id, name, slug, image` — pas de violation. **Cette exemption est écrite ici pour être opposable en revue.**

### 4.4 `deleteProductAsAdmin` — algorithme (D3, D7, CA-V5-061…065)

`DELETE /api/admin/products/:id` → **204** sans corps. Déjà protégé par `adminRouter.use(requireAdmin)` (`app.ts`) → `requireAdmin` **n'est pas à réappliquer** (D9).

```
BEGIN
  1. SELECT * FROM products p WHERE p.id = $1 AND p.deleted_at IS NULL FOR UPDATE
     → 0 ligne : 404 PRODUCT_NOT_FOUND
  2. SELECT 1 FROM orders
       WHERE product_id = $1
         AND status NOT IN ('COMPLETED','CANCELLED','PAYMENT_FAILED')   -- cf. F11
     LIMIT 1
     → trouvé : 409 PRODUCT_HAS_ACTIVE_ORDER « lié à une commande en cours »
  3. UPDATE products SET deleted_at = now() WHERE id = $1
  4. INSERT admin_actions (admin_id, action, target_type, target_id, details)
       -- action = 'product.delete' (D3 : la suppression est traçable)
COMMIT
→ (hors transaction) notification 'article_deleted' au vendeur
→ (hors transaction) email §7
```

**ARBITRAGE DU CHEF DE PROJET (29/09/2026)** : le comportement **`204` idempotent** (204 puis 204) est **confirmé et opposable** — décision alignée sur CA-V5-056 (critère testable) ; le `404` reste réservé au produit **inexistant** (`PRODUCT_NOT_FOUND`). Implémentation vérifiée par `test/soft-delete.test.ts` et l'audit doc/impl. Cette note remplace la précédente note `@backend`.

- **Idempotence** : produit déjà supprimé → **204** (pas de changement d'horodatage) ; jamais 409, jamais double notification.
- **Droits du vendeur après suppression** (CA-V5-062) : `PUT /api/products/:id` sur un produit supprimé → **404** (le filtre de l'écriture suffit ; aucune règle « compte bloqué »). Le compte reste actif, ses nouveaux produits restent acceptés (CA-V5-069).
- **Front** : action « Supprimer » sur **chaque** ligne de `AdminArticlesPage` (D6), **désactivée + motif affiché** si le produit a une commande active (D6, CA-V5-065). Il faut donc exposer ce fait : ajouter `hasActiveOrder` au sérialiseur produit admin (champ **additif** — autorisé par CA-V5-074 qui porte sur les 9 endpoints de *liste*, pas sur la fiche admin) pour éviter un appel de plus par ligne.
- **`DELETE /api/products/:id` côté vendeur : route retirée** (F5) → 4 tests de `sell.test.ts` (`:231`, `:243`, `:248`, `:262`) sont **réécrits** vers `DELETE /api/admin/products/:id`, pas supprimés en silence (CA-V5-054, CA-V5-112).

---

## 5. C6 — Retrait du contact vendeur (exhaustif)

`grep -rn "contact"` → **retirer 12 sites**, **conserver 2 faux positifs**.

**Serveur**

| Fichier | Retirer |
|---|---|
| `routes/products.routes.ts:7` | import `contactSchema` |
| `routes/products.routes.ts:13` | import `contactSeller` |
| `routes/products.routes.ts:66-78` | la route `POST /:id/contact` + son rate limit dédié |
| `services/products.service.ts:458-527` | `contactSeller` (2 `CONTACT_SELF`, notification `product.contact`) |
| `utils/validation.ts:301-309` | `contactSchema` |
| `services/notifications.service.ts:26-28` | `'product.contact'` dans l'union `NotificationType` |

**Web**

| Fichier | Retirer |
|---|---|
| `lib/types.ts:398-406` | `ContactPayload`, `ContactResponse` |
| `lib/api.ts:23-24`, `:178-184` | imports + méthode `contactSeller` |
| `pages/ProductPage.tsx:50-51, 109-129, 313-350` | états, handler, `<Modal>` « Contacter » |
| `lib/api.test.ts:177-194` | 2 tests `contactSeller` (adapter le `describe` ligne 163) |
| `test/accueil-v3.test.ts:433-568` | **12** cas `it()` (F1), pas 13 |

**À NE PAS toucher** (faux positif) : `components/layout/Footer.tsx:27,30` — l'adresse de contact publique `contact@revends.ci` n'a rien à voir avec la fonctionnalité retirée.
**Rétrocompatibilité** : la route disparaît → **410/404**. Retrait assumé, l'énoncé le demande. `'product.contact'` **reste en base** (§2.5).

---

## 6. C5 — Suppression des N+1

### 6.1 Budgets : mesurés puis cibles

`scripts/measure-queries.ts` instrumente `pool.query` sur le jeu du cahier §9. Colonnes « total » = **avec** les 3 requêtes de session ; « métier » = hors session (F15).

| Endpoint | Budget CA-V5-071 | Actuel `per_page=1` | Actuel `per_page=48` | **Cible métier** | Forme |
|---|---|---|---|---|---|
| `GET /api/products` | ≤ 3 | 3 | 50 | **3** ✅ | 2 + N |
| `GET /api/products?ids=` | ≤ 2 | 2 | 11 | **2** ✅ | 1 + N |
| `GET /api/products/:identifier` | ≤ 5 | 5 | 5 | **5** ✅ | constante |
| `GET /api/me/products` | ≤ 2 | 17 | 17 | **2** ✅ | 2 + N |
| `GET /api/admin/products` | ≤ 3 | 41 | 41 | **3** ✅ | 2 + 3N |
| `GET /api/admin/orders` | ≤ 4 | 101 | 101 | **3** ✅ | 2 + **8**N |
| `GET /api/me/orders` | ≤ 3 | 484 | 484 | **2** ✅ | 1 + **8**N |
| `GET /api/me/sales` | ≤ 3 | 100 | 100 | **2** ✅ | 1 + **8**N |
| `GET /api/admin/stats` | ≤ 3 | 10 | 10 | **≤ 3** ✅ | constante |

Toutes les cibles tiennent le budget **et** sont indépendantes de `per_page` (CA-V5-072). Décomposition prouvée par `scripts/dump-sql.ts` : `getStats` = **7** requêtes métier, `listOwnProducts` = 2 + N, `admin/orders` = 1 + 12×8 + 1.

### 6.2 Décision D2 — stratégie de batch (`@architecte`)

Le cahier laisse le choix (CA-V5-073). Règle unique : **1 requête = 1 `SELECT` du pool, quel que soit le nombre de lignes.**

1. **Images** — remplacer la boucle `loadPrimaryImage`/`loadImages` par `WHERE product_id = ANY($1::bigint[])` puis indexation en mémoire. 1 requête au lieu de N.
2. **Produits par jointure** — `getCatalog`, `listOwnProducts`, `listAdminProducts` : le `count` et la page partagent le **même** `whereClause` → `Promise.all([count, page])` sur `pool` (hors transaction, autorisé). Les images Part A (1 requête). → **3**.
3. **`listOwnProducts` ≤ 2** — fusionner produits + compteurs par statut dans **une** requête via CTE scalaire :
   `WITH c AS (SELECT COUNT(*) total, COUNT(*) FILTER (WHERE status='PENDING') pending, … FROM products WHERE owner_id=$1 AND deleted_at IS NULL) SELECT <PRODUCT_SELECT>, c.* FROM products p … CROSS JOIN c WHERE …` + 1 requête images. `CROSS JOIN` sur 1 ligne ne multiplie rien, et `c.total` remplace `items.length` (identique : la liste n'est pas paginée).
4. **Commandes** — le gain vient de savoir **quelles parties chaque vue consomme** (audit des sérialiseurs) : le `SELECT` de page joint `orders ⋈ products ⋈ categories` + image primaire (`LATERAL` / `DISTINCT ON`) + `payments` + `seller_payouts`, et les utilisateurs partent dans **une** requête `WHERE id = ANY($1)` indexée par id.

| Vue | Consomme | Inutile | Requêtes cibles |
|---|---|---|---|
| `serializeBuyerOrderSummary` | order, product, image, **seller**, payment | buyer, payout, events | 1 JOIN + 1 `users … ANY()` = **2** |
| `serializeSellerOrderSummary` | order, product, image, **buyer**, payment | seller, payout, events | 1 JOIN + 1 `users … ANY()` = **2** |
| `serializeAdminOrder` (liste) | order, product, image, buyer, seller, payment, payout | events | count + 1 JOIN + 1 `users … ANY()` = **3** |
5. **`loadOrderParts` reste inchangé** (8 requêtes, `< 10` = taille du pool). Il sert le **détail** (1 commande) et est appelé **dans une transaction de checkout** où le parallélisme est interdit (pg : un seul client ne peut pas avoir 2 requêtes en vol, commentaire `orders.service.ts:56-58`). **Ne pas le modifier** — c'est la garantie de CA-V5-073.
6. **`getStats` 7 → 3** (F9 : déjà parallèle, donc « paralléliser » ne suffit pas). Les compteurs par statut partent dans **une** requête d'agrégation `GROUP BY status` avec `COUNT(*) FILTER` ; `pendingPayouts` + `payoutsDue` fusionnent en un `COUNT(*) FILTER (WHERE status=…) FILTER (WHERE status=…)` ; `payoutsDueAmount` reste dans la requête `seller_payouts` (garde `status='DUE'`). Résultat **numériquement identique** sur les 15 champs (CA-V5-081) — l'égalité stricte est le test.

### 6.3 Contrat d'instrumentation (indispensable pour CA-V5-071/072)

Le compteur doit **exclure** les 3 requêtes de session (F15), sinon aucun budget n'est atteignable sur `/api/me/*` et `/api/admin/*` (budget ≤ 2 vs 2+3). Règle : ne pas compter les requêtes dont le texte contient `"session"`, ni `SELECT * FROM users WHERE id = $1` issu de `requireUser`. Tester à `per_page = 1, 12, 48` et **assurer l'égalité des trois valeurs** (CA-V5-072).

### 6.4 Pièges de rétrocompatibilité (CA-V5-074)

- `serializeAdminUser` fait un **spread conditionnel** : `productCount` n'apparaît que si la ligne porte `product_count`. Il faut donc reproduire **exactement** la présence des compteurs : `listAdminOrders` → `loadUser` (**aucun** compteur) ; `getAdminOrderDetail` → `loadAdminUser` (**les deux**). Un `users … ANY()` unique qui ajoute `product_count` partout **changerait la charge utile** et casserait CA-V5-074.
- `productSummary.image` = objet image **complet** ; l'image de la carte catalogue = `{id, url}` seulement. Le chargeur batch doit renvoyer la ligne complète pour que les deux usages restent valides. **Ne pas « corriger » `sales: 0`** (F13) et **ne pas changer** l'ordre des 15 champs de `getStats`.

---

## 7. C7 — Cache HTTP et rate limit

### 7.1 Décision D3 — cache

Middleware global sur `/api`, **avant** les routes, dans `app.ts` :

- `Cache-Control: no-store` par défaut sur **toutes** les réponses `/api` (données authentifiées et publiques : catalogue, compteurs, notifications).
- **Deux exceptions** : `GET /api/categories` et `GET /api/banners` → `Cache-Control: public, max-age=60` (données quasi statiques, lecture publique, aucune donnée personnelle).
- Pas de `ETag`/`304` (hors périmètre, P5). Les assets statiques et le fallback SPA sont hors périmètre.

### 7.2 Décision D4 — rate limit global (D8)

`rateLimit({ windowMs: 60_000, max: 300 })` monté sur `/api`, **après** le limiteur d'auth (plus strict, `app.ts:63`) et exemptant `GET /api/health` et `GET /health`.

Points de vigilance vérifiés dans `middleware/rateLimit.ts` :
- les buckets sont **en mémoire et par instance** → non partagés entre instances ; acceptable à 1 instance Railway, à documenter si mise à l'échelle horizontale.
- le limiteur d'auth et le limiteur global ont des `Map` et des timers **séparés** → une requête `/api/auth/login` est comptée dans les deux ; c'est le plus strict qui s'applique. Pas de collision de clés.
- **le bypass `NODE_ENV=test` est existant et doit être préservé**, sinon la suite (235 tests) s'auto-limite.

---

## 8. C2 — Emails transactionnels

### 8.1 Contrat

```ts
// server/src/services/mail.service.ts
export interface MailerService { sendMail(to: string, subject: string, html: string, text: string): Promise<void>; }
```

- **Une seule dépendance** : `nodemailer` (+ `@types/nodemailer`). Aucun framework de template : `server/src/mail/templates.ts` exporte des **fonctions pures** `(ctx) => ({ subject, html, text })` — testables sans SMTP.
- **Transport** : prod = `createTransport(config.smtp)` ; dev/test = `jsonTransport` (aucun envoi réel). Driver injecté paresseux → `getMailer()`.
- **Env** (`config.ts` + `.env.example`) : `MAIL_ENABLED`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`.
- **Règle d'or : envoi TOUJOURS après le `COMMIT`**, jamais dans la transaction. Un rollback ne doit pas laisser d'email parti ; un commit ne doit pas dépendre du SMTP.

```ts
// services/orders.service.ts (exemple, paiement confirmé)
const client = await pool.connect();
try { await client.query('BEGIN'); /* … métier + notifications … */ await client.query('COMMIT'); }
catch (e) { await client.query('ROLLBACK'); throw e; }
finally { client.release(); }
void notifyByEmail({ userId: sellerId, template: 'orderPaidSeller', data: {...} }); // après COMMIT
```

- **Best-effort** : tout échec SMTP est `console.error` **logué et avalé** (aucun 5xx, aucune transaction ouverte). Envois groupés par `Promise.allSettled` sur plusieurs destinataires.

### 8.2 Les 8 événements

| # | Événement | Point d'insertion | Destinataire | Template |
|---|---|---|---|---|
| 1 | Bienvenue | `routes/auth.routes.ts` (après `register`, hors transaction) | nouvel inscrit | `welcome` |
| 2 | Article approuvé | `products.service.ts` (modération admin) | vendeur | `articleApproved` |
| 3 | Article refusé | `products.service.ts` (modération admin) | vendeur | `articleRejected` |
| 4 | Commande payée | `orders.service.ts` (passage `PAYMENT_PENDING` → `PAID`) | acheteur **et** vendeur | `orderPaidBuyer` / `orderPaidSeller` |
| 5 | Commande expédiée | `orders.service.ts` (`markShipped`) | acheteur | `orderShipped` |
| 6 | Commande livrée / terminée | `orders.service.ts` (`markDelivered` / clôture) | acheteur | `orderDelivered` |
| 7 | Reversement disponible | `admin.service.ts` (`markPayoutPaid`) | vendeur | `payoutAvailable` |
| 8 | Reversement payé | `admin.service.ts` | vendeur | `payoutPaid` |
| + | Réservation expirée | `expiry.service.ts` | acheteur **et** vendeur | `reservationExpired` |

→ **11 envois pour 9 déclencheurs** (1+1+1+2+1+1+1+1 pour les 8 lignes, +2 pour l'expiration) (les événements 4 et « réservation expirée » ont 2 destinataires). Le cahier en liste 8 : les 2 derniers sont le prolongement direct d'un service existant, à confirmer par @chef-de-projet (décision D5, §10).

---

## 9. Preuves et reproductibilité

```bash
cd server
# Base de mesure M-01 : 50 000 produits · 5 000 commandes · 20 001 notifications
psql -h 127.0.0.1 -p 5433 -U revends -d postgres -c 'CREATE DATABASE revends_v5perf OWNER revends'
for f in migrations/00*.sql; do psql -h 127.0.0.1 -p 5433 -U revends -d revends_v5perf -v ON_ERROR_STOP=1 --single-transaction -f "$f"; done
psql -h 127.0.0.1 -p 5433 -U revends -d revends_v5perf -v ON_ERROR_STOP=1 --single-transaction -f /tmp/opencode/perf-v5arch.sql
node --import tsx scripts/measure-queries.ts && node --import tsx scripts/dump-sql.ts   # §6.1 budgets + SQL exact
npm test                                       # 235/235 verts (node:test, pas vitest)
```

Résultats **vérifiés dans cette session** : **235/235** tests verts (`npm test`, 13 suites, base PostgreSQL 16.15) ; 009 appliquée sur base neuve après 001–008 puis rejouée **3×** sur base peuplée → code 0, uniquement des `NOTICE` ; `EXPLAIN (ANALYZE, BUFFERS)` sur 50 000 produits / 5 000 commandes / 20 001 notifications. Mesures retenues : `idx_products_discount_ratio` **×225**, `idx_products_owner_deleted` ×6,2, `idx_notifications_unread` ×2,2, `idx_orders_status_recent` 66 → 3 pages, régression pré-C4 bornée à ×106 / ×35 (§2.4).

---

## 10. Risques et décisions à acter

| # | Sujet | Décision attendue | Défaut si non tranché |
|---|---|---|---|
| **D1** | 009 avant ou après le code C4 (§2.4) | **A** (Railway : sûr) ou **B** (surface de risque nulle) | régression ×106 sur le catalogue et ×35 sur la modération si 009 est appliquée seule |
| **D8** | `npm test` cible la base de **développement** (`DATABASE_URL` de `.env` = `revends`), pas `revends_test` que le bootstrap crée puis ignore | faire pointer les tests sur `revends_test` | **chaque `npm test` efface la base de dev** (`DROP SCHEMA public CASCADE`) — constaté : tables absentes après un run |
| **D5** | 9ᵉ déclencheur email (« réservation expirée ») : dans le périmètre ou non | confirmer avec @chef-de-projet | 2 emails absents, ou 2 emails non prévus |
| **D6** | `hasActiveOrder` ajouté au sérialiseur produit admin (champ additif) pour désactiver l'action UI sans appel par ligne | valider | N+1 réintroduit sur `AdminArticlesPage` |
| **D7** | Correction de la dette `sales: 0` (F13) | **hors périmètre V5** (CA-V5-074) | ticket de dette à créer, sinon oublié |
| **D8** | Rate limit en mémoire, non partagé entre instances | documenter (1 instance) | limite ineffective si mise à l'échelle horizontale |

**Risques techniques principaux** : (1) oubli d'un `deleted_at IS NULL` → **28 points de lecture**, la table §4 est la liste de contrôle, un oubli est silencieux (CA-V5-063) ; (2) désynchronisation de l'expression de `idx_products_discount_ratio` → index muet sans erreur (§2.2) ; (3) ajout d'un `product_count` involontaire dans `serializeAdminUser` → charge utile modifiée (F13, §6.4) ; (4) application de 009 sur un environnement pré-C4 (F14, §2.4).
