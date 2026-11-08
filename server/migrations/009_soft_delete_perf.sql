-- ============================================================
-- ReVends — 009_soft_delete_perf.sql  (PostgreSQL 15+)
-- Chantier V5 « Sprint Performance & Pro » (docs/cahier-des-charges-v5.md) :
--   1. products.deleted_at — suppression logique (C4, ARB-V5-04/06, D1)
--   2. notification_type 'article_deleted' (D5)
--   3. reindexation des 5 index partiels produits (deleted_at IS NULL)
--   4. index de performance ajoutés, chacun justifié par une requête réelle
--      (CA-V5-082) — mesures consignées dans docs/architecture-v5.md §2.
-- Prérequis : 001..008 appliqués.
--
-- Exécution : migrate.ts enveloppe CHAQUE fichier dans BEGIN/COMMIT.
--   ⚠️ ALTER TYPE ... ADD VALUE est autorisé en transaction depuis PG12, mais
--      la valeur n'est utilisable qu'APRÈS le COMMIT (même règle que 006/008).
--      Ce fichier n'insère AUCUNE notification → sûr.
--
-- ⚠️ AUCUN DROP TYPE. La valeur 'product.contact' (008, §4) est CONSERVÉE en
--    base et devient inutilisée (ARB-V5-08, CA-V5-099) : retirer une valeur
--    d'un enum PostgreSQL imposerait de réécrire le type.
--
-- Idempotence : ADD COLUMN IF NOT EXISTS / ADD VALUE IF NOT EXISTS +
--   DROP INDEX IF EXISTS avant chaque CREATE INDEX (PG n'a pas
--   CREATE INDEX IF NOT EXISTS). Rejouable sans erreur.
-- ============================================================

-- ------------------------------------------------------------
-- 1. products.deleted_at — suppression logique (D1 : ORTHOGONAL
--    à status — la suppression NE MODIFIE PAS products.status)
-- ------------------------------------------------------------
-- NULL = produit vivant. Un produit supprimé garde son statut métier
-- (AVAILABLE / RESERVED / SOLD / PENDING / REJECTED) pour que l'historique
-- des commandes et les statistiques restent exacts (CA-V5-058).
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- DOWN : ALTER TABLE products DROP COLUMN deleted_at;
--        (⚠️ destructif pour les données de suppression — jamais exécuté
--          automatiquement ; la restauration se fait par UPDATE, cf.
--          docs/architecture-v5.md §5 « requête de restauration ».)

-- ------------------------------------------------------------
-- 2. notification_type 'article_deleted' (D5)
-- ------------------------------------------------------------
-- La suppression admin notifie le vendeur (CA-V5-060, RG-V5-03).
-- On n réutilise NI 'article_rejected' (refus ≠ suppression) NI
-- 'product.contact' (retiré du code par C6, conservé en base).
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'article_deleted';

-- DOWN : impossible sans réécrire le type (cf. 008 §4) — non applicable.

-- ============================================================
-- 3. REINDEXATION des index partiels produits
-- ============================================================
-- Motif : les 5 index ci-dessous ont tous pour prédicat
-- `status = 'AVAILABLE'` (ou IN) et NE mentionnent pas `deleted_at`.
-- Or le prédicat d'un index partiel doit être IMPLIQUÉ par le WHERE de la
-- requête pour être utilisable. Sans réécriture, le catalogue continuerait
-- d'indexer des produits supprimés ET le planner ne pourrait pas s'appuyer
-- sur ces index tant que le code n'applique pas `deleted_at IS NULL`
-- (chantier C4, §4 de docs/architecture-v5.md).
--
-- Les index sont recréés à l'IDENTIQUE (mêmes colonnes, même ordre) + le
-- nouveau prédicat : aucune perte de couverture, aucun changement de plan
-- pour les requêtes qui filtrent déjà `deleted_at IS NULL`.
--
-- DROP puis CREATE (et non ALTER) : PostgreSQL ne sait pas modifier le
-- prédicat d'un index partiel.

-- Catalogue public : tri « récent » (products.service.ts ORDER BY created_at DESC, id)
DROP INDEX IF EXISTS idx_products_catalog;
CREATE INDEX idx_products_catalog ON products(created_at DESC, id)
    WHERE status = 'AVAILABLE' AND deleted_at IS NULL;
-- DOWN : DROP INDEX idx_products_catalog;
--        CREATE INDEX idx_products_catalog ON products(created_at DESC, id) WHERE status = 'AVAILABLE';

-- Catalogue : tri « prix croissant »
DROP INDEX IF EXISTS idx_products_price_asc;
CREATE INDEX idx_products_price_asc ON products(price ASC, id)
    WHERE status = 'AVAILABLE' AND deleted_at IS NULL;
-- DOWN : DROP INDEX idx_products_price_asc;
--        CREATE INDEX idx_products_price_asc ON products(price ASC, id) WHERE status = 'AVAILABLE';

-- Catalogue : tri « prix décroissant »
DROP INDEX IF EXISTS idx_products_price_desc;
CREATE INDEX idx_products_price_desc ON products(price DESC, id)
    WHERE status = 'AVAILABLE' AND deleted_at IS NULL;
-- DOWN : DROP INDEX idx_products_price_desc;
--        CREATE INDEX idx_products_price_desc ON products(price DESC, id) WHERE status = 'AVAILABLE';

-- Back-office : file de modération (PENDING le plus ancien d'abord)
DROP INDEX IF EXISTS idx_products_moderation;
CREATE INDEX idx_products_moderation ON products(created_at ASC)
    WHERE status IN ('PENDING', 'REJECTED') AND deleted_at IS NULL;
-- DOWN : DROP INDEX idx_products_moderation;
--        CREATE INDEX idx_products_moderation ON products(created_at ASC) WHERE status IN ('PENDING', 'REJECTED');

-- Catalogue : section « Plus populaires » (accueil)
DROP INDEX IF EXISTS idx_products_view_count;
CREATE INDEX idx_products_view_count ON products(view_count DESC, id)
    WHERE status = 'AVAILABLE' AND deleted_at IS NULL;
-- DOWN : DROP INDEX idx_products_view_count;
--        CREATE INDEX idx_products_view_count ON products(view_count DESC, id) WHERE status = 'AVAILABLE';

-- ============================================================
-- 4. INDEX DE PERFORMANCE AJOUTÉS
-- ============================================================
-- Règle appliquée (PRUDENCE / CA-V5-082) : un index n'est ajouté QUE s'il
-- sert une requête RÉELLEMENT exécutée par le code, et si la mesure le
-- justifie. Chaque index ci-dessous porte la requête qu'il sert et son
-- gain mesuré sur 50 000 produits / 5 000 commandes (PostgreSQL 16.15,
-- protocole §9 du cahier). Les candidats REJETÉS sont documentés en
-- §2 de docs/architecture-v5.md (mesure à l'appui).

-- ------------------------------------------------------------
-- 4.1 idx_products_discount_ratio — sections « Promotions » et
--     « Meilleures offres » (accueil, CA-V5-076)
-- ------------------------------------------------------------
-- Requête servie (products.service.ts, sections best_offers / promotions) :
--   SELECT … FROM products p JOIN categories …
--    WHERE p.status = 'AVAILABLE' AND p.deleted_at IS NULL
--      AND p.old_price IS NOT NULL AND p.old_price > p.price
--    ORDER BY ((p.old_price - p.price) * 1.0 / p.old_price) DESC, p.id
--    LIMIT 10;
--
-- Pourquoi un index FONCTIONNEL et pas un index simple sur (old_price) :
-- le tri porte sur une EXPRESSION à deux colonnes → aucun index B-tree
-- simple ne peut le servir, le planner fait un Seq Scan + top-N sort.
-- L'index reproduit l'expression EXACTEMENT (mêmes parenthèses, même
-- ordre d'opérations) : le plan devient un Index Scan sans tri.
--   mesuré : 39,628 ms → 0,176 ms (×225), 1 881 → 8 pages lues.
--   (17 500 lignes remisées en base de mesure ; le Seq Scan + top-N sort
--   lit et filtre les 50 000 lignes, l'index s'arrête après 10.)
--
-- ⚠️ COUPLAGE À TENIR : l'expression de cet index doit rester
--    rigoureusement identique à celle du ORDER BY dans
--    services/products.service.ts. Toute réécriture de cette expression
--    (espaces, casts, ordre des opérations) rend l'index muet SANS erreur.
--    → la constante de tri est extraite et exportée par le service, et
--      figée ici ; toute évolution passe par une migration (009 bis).
DROP INDEX IF EXISTS idx_products_discount_ratio;
CREATE INDEX idx_products_discount_ratio
    ON products (((old_price - price) * 1.0 / old_price) DESC, id)
    WHERE status = 'AVAILABLE' AND deleted_at IS NULL
      AND old_price IS NOT NULL AND old_price > price;
-- DOWN : DROP INDEX idx_products_discount_ratio;

-- ------------------------------------------------------------
-- 4.2 idx_orders_buyer_recent — GET /api/me/orders (acheteur)
-- ------------------------------------------------------------
-- Requête servie (orders.service.ts, listBuyerOrders) :
--   SELECT … FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC, id DESC;
-- L'index de 001 idx_orders_buyer (buyer_id) localise les lignes mais ne
-- fournit PAS l'ordre : le planner ajoute un Sort.
-- L'index composé (buyer_id, created_at DESC, id DESC) fournit l'ordre
-- directement, donc supprime le Sort.
--   mesuré (acheteur à 4 525 commandes) : 6,461 ms → 2,968 ms, le nœud
--   Sort (475 kB) disparaît, le plan devient un Index Scan.
-- À faible cardinalité par acheteur (~25 commandes), le tri porte sur 25
-- lignes et le gain devient négligeable (1,4 ms) : l'index n'est justifié
-- QUE par les acheteurs à gros volume, mais il ne coûte rien à ce stade.
DROP INDEX IF EXISTS idx_orders_buyer_recent;
DROP INDEX IF EXISTS idx_orders_buyer;      -- 001 : strictement redondant
CREATE INDEX idx_orders_buyer_recent ON orders(buyer_id, created_at DESC, id DESC);
-- DOWN : DROP INDEX idx_orders_buyer_recent; CREATE INDEX idx_orders_buyer ON orders(buyer_id);

-- ------------------------------------------------------------
-- 4.3 idx_orders_seller_recent — GET /api/me/sales (vendeur)
-- ------------------------------------------------------------
-- Requête servie (orders.service.ts, listSellerOrders) : symétrique de 4.2.
--   mesuré : même plan que 4.2 (Index Scan sans Sort).
DROP INDEX IF EXISTS idx_orders_seller_recent;
DROP INDEX IF EXISTS idx_orders_seller;     -- 001 : strictement redondant
CREATE INDEX idx_orders_seller_recent ON orders(seller_id, created_at DESC, id DESC);
-- DOWN : DROP INDEX idx_orders_seller_recent; CREATE INDEX idx_orders_seller ON orders(seller_id);

-- ------------------------------------------------------------
-- 4.4 idx_notifications_unread — compteur de non-lues + « tout marquer lu »
-- ------------------------------------------------------------
-- Requêtes servies (notifications.service.ts) :
--   SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL;   (badge)
--   UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL;
-- L'index existant (user_id, created_at DESC) ne contient pas `read_at` :
-- le compteur devait relire le TAS (Bitmap Heap Scan) pour tester le NULL.
-- Index PARTIEL sur les seules non-lues → Index Only Scan, plus de TAS.
--   mesuré : 2,394 ms, Index Only Scan, Heap Fetches: 0 (10 000 non-lues).
-- Le tri « non lues d'abord » de listNotifications est couvert par
-- (user_id, created_at DESC) + filtre : un seul index suffit.
DROP INDEX IF EXISTS idx_notifications_unread;
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC)
    WHERE read_at IS NULL;
-- DOWN : DROP INDEX idx_notifications_unread;

-- ------------------------------------------------------------
-- 4.5 idx_products_owner_deleted — « Mes articles » (vendeur)
-- ------------------------------------------------------------
-- Requête servie (products.service.ts, listOwnProducts) :
--   SELECT … FROM products p
--    WHERE p.owner_id = $1 AND p.deleted_at IS NULL
--    ORDER BY p.created_at DESC, p.id DESC;
-- L'index de 001 idx_products_owner (owner_id) est utilisé en Bitmap Heap
-- Scan puis la requête TRIE en mémoire, et `deleted_at IS NULL` est testé
-- sur le TAS (Filter). Index PARTIELIZÉ + colonnes de tri → Index Only Scan.
--   mesuré (perPage=20, taille réelle de page ; VACUUM ANALYZE préalable) :
--     avec idx_products_owner_deleted → 0,333 ms, 8 pages, Heap Fetches: 0
--     avec idx_products_owner nu      → 2,054 ms, 261 pages, Sort + Bitmap
--   soit ×6,2 en temps et ×33 en pages lues, et le Sort disparaît.
-- ⚠️ Le gain dépend de LIMIT : si perPage approche le nombre total
--    d'articles du vendeur, le planner peut préférer Bitmap + Sort (mesuré
--    1,545 ms à LIMIT 200 sur 250 articles). Comme perPage est plafonné à
--    48 par validation.ts, l'index reste le bon choix pour le vrai trafic.
DROP INDEX IF EXISTS idx_products_owner_deleted;
DROP INDEX IF EXISTS idx_products_owner;   -- 001 : (owner_id) non trié
CREATE INDEX idx_products_owner_deleted ON products(owner_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
-- DOWN : DROP INDEX idx_products_owner_deleted; CREATE INDEX idx_products_owner ON products(owner_id);

-- ------------------------------------------------------------
-- 4.6 idx_orders_status_recent — GET /api/admin/orders?status=…
-- ------------------------------------------------------------
-- Requête servie (admin.service.ts, listAdminOrders, filtre par statut) :
--   SELECT … FROM orders o WHERE o.status = $1
--    ORDER BY o.created_at DESC, o.id DESC LIMIT $2 OFFSET $3;
-- Sans cet index, le planner réutilise idx_orders_delivery (partial, tri
-- ASC) en parcours RÉGRESSIONNEL puis filtre le statut : 66 pages lues.
--   mesuré : 0,166 ms → 0,095 ms, 66 → 3 pages (×22), Index Only Scan,
--   Heap Fetches: 0, plus aucun filtre de statut.
-- ⚠️ La colonne de tri est created_at, PAS updated_at : c'est l'erreur qui
--    faisait conclure à tort (v5 précédent) que cet index était inutile.
DROP INDEX IF EXISTS idx_orders_status_recent;
CREATE INDEX idx_orders_status_recent ON orders(status, created_at DESC, id DESC);
-- DOWN : DROP INDEX idx_orders_status_recent;

-- ============================================================
-- 5. ⚠️ CONTRAINTE DE DÉPLOIEMENT — C4 ET 009 SONT SOLIDAIRES
-- ============================================================
-- Les 6 index produits (catalog, price_asc, price_desc, moderation,
-- view_count, discount_ratio) portent le prédicat `deleted_at IS NULL`.
-- Un index partiel n'est utilisable QUE si le WHERE de la requête IMPLIQUE
-- son prédicat. Une requête qui ne filtre pas `deleted_at` NE PEUT PAS
-- utiliser ces index — le planner retombe sur un Seq Scan + Sort.
--
-- MESURES (50 000 produits, dont 5 % supprimés, 20 000 remisés, PostgreSQL
-- 16.15, base de mesure /tmp/opencode/perf-v5arch.sql) :
--   catalogue `status='AVAILABLE' AND deleted_at IS NULL`, tri récent, LIMIT 48
--     code C4 (filtre deleted_at PRÉSENT)  → 0,213 ms, 3 pages  (Index Only Scan)
--     code antérieur (filtre ABSENT)      → 22,564 ms ⚠️ 1 881 pages (Seq Scan + Sort)
--   file de modération `status IN ('PENDING','REJECTED')`, LIMIT 12
--     code C4 (filtre deleted_at PRÉSENT)  → 0,471 ms, 32 pages
--     code antérieur (filtre ABSENT)      → 16,579 ms ⚠️ 1 881 pages (Seq Scan + Sort)
--
-- soit ×106 (catalogue) et ×35 (modération) de régression si le code C4
-- n'est pas déployé en même temps que la migration.
--
-- AUTORITÉ : ce fichier NE DOIT JAMAIS être appliqué sur un environnement
-- qui exécute encore le code antérieur à C4. Le couple « migration 009 +
-- code C4 » forme une unité de déploiement indissociable.
--   Railway / Fly.io : le build applicatif applique les migrations AU DÉMARRAGE
--   du NOUVEAU code → ordre sûr (code C4 actif avant 009). ✅
--   Déploiement manuel où les migrations précèdent le code : appliquer d'abord
--   009 SANS la section 3 (colonne + enum seuls), déployer le code C4, puis
--   rejouer la section 3. Procédure détaillée : docs/architecture-v5.md §2.4.
--
-- VARIANTE SÛRE (arbitrage ouvert, PRUDENCE) : conserver les prédicats de la
-- section 3 tels quels AVANT 009 (`WHERE status='AVAILABLE'`), en laissant
-- `deleted_at IS NULL` comme filtre résiduel côté requête. COÛT MESURÉ avec
-- 5 % de produits supprimés : 0,215 ms au lieu de 0,205 ms, soit +5 % seulement
-- (58 pages lues au lieu de 3 : le filtre résiduel ne retire que 10 lignes sur
-- 58), index de 1 096 kB au lieu de 1 016 kB. Soit BIEN EN DESSOUS du seuil
-- de +15 % de CA-V5-075, et AUCUNE fenêtre de régression possible.
-- ⚠️ L'ancienne version de ce commentaire annonçait +63 % : c'était FAUX
--    (mesure erronée, désormais remplacée). Le surcoût réel est marginal,
--    ce qui rend cette variante réellement attractive — arbitrage à trancher
--    en §2.4 de docs/architecture-v5.md :
--      · prédicats AVEC deleted_at (strict)  → 0,205 ms, mais 009 + code C4
--        solidaires : ×35 à ×106 de régression si l'ordre est inversé ;
--      · prédicats SANS deleted_at (sûr)     → +5 %, aucun couplage.
-- La décision recommandée est exposée au chef de projet : les deux variantes
-- sont valides, le cahier n'impose pas le prédicat partial.
