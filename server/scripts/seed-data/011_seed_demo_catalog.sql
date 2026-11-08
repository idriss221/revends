/* =====================================================================
   ReVends — seed catalogue de démonstration (script manuel)

   ⚠️ PAS une migration : ce fichier n'est pas dans `migrations/` parce que
   `migrate()` rejoue tout ce répertoire, y compris dans la base de TEST
   remise à zéro avant chaque suite. Il polluait alors chaque run
   (+25 articles démo dans `revends_test`).

   Appliqué par `npm run seed:demo` (scripts/seed-demo-catalog.ts) sur le
   primary de CHAQUE shard. Idempotent (ON CONFLICT DO NOTHING).

   Contenu : 1 admin de modération, 4 vendeurs, 25 articles AVAILABLE
   (16 à ≤ 25 000 FCFA), 50 lignes d'images → photos locales de la
   maquette hébergées dans web/public/catalog/ (voir section 3).
   ===================================================================== */

-- ============================================================================
-- ReVends — 011_seed_demo_catalog.sql
--
-- Catalogue de démonstration : vendeurs + articles publiés (status AVAILABLE)
-- afin que l'accueil affiche de vraies cards dans « Les nouveautés » et
-- « Trouvailles à petits prix » (au lieu de skeletons sans style).
--
-- ⚠️ `products.category_id` référence une SOUS-catégorie (parent_id NOT NULL)
--    d'après PRODUCT_FROM (`JOIN categories sc ... JOIN categories c ON sc.parent_id`).
--    Les ids 6..22 de 002_seed_categories.sql sont les sous-catégories.
--
-- Idempotent : ON CONFLICT DO NOTHING sur les slugs produits / emails vendeurs.
-- S'exécute sur le PRIMAIRE de chaque shard (run_migrations), jamais sur replica.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Compte de modération + vendeurs de démonstration.
--    Le compte admin 9000 signe les approbations (contrainte chk_approval_pair :
--    approved_at et approved_by doivent être tous deux NULL ou tous deux rENSEIGNÉS).
--    Les mots de passe sont des hashes factices : non utilisables pour se connecter.
-- ---------------------------------------------------------------------------
INSERT INTO users (id, display_name, name, email, phone, password_hash, role, accepted_cgu)
VALUES
  (9000, 'RéVends Admin', 'RéVends Admin',        'admin.demo@revends.demo',  '+22507000000', '$2b$12$invalidhashdemodemo0000000000000000000000000000000000', 'admin', TRUE),
  (9001, 'Awa Diop',      'Awa Diop',            'awa.diop@revends.demo',    '+22507000001', '$2b$12$invalidhashdemodemo0000000000000000000000000000000000', 'user', TRUE),
  (9002, 'Kouassi Mensah', 'Kouassi Mensah',     'kouassi.m@revends.demo',   '+22507000002', '$2b$12$invalidhashdemodemo0000000000000000000000000000000000', 'user', TRUE),
  (9003, 'Fatou Bamba',   'Fatou Bamba',         'fatou.bamba@revends.demo', '+22507000003', '$2b$12$invalidhashdemodemo0000000000000000000000000000000000', 'user', TRUE),
  (9004, 'Yao N’Guessan', 'Yao N’Guessan',       'yao.nguessan@revends.demo','+22507000004','$2b$12$invalidhashdemodemo0000000000000000000000000000000000', 'user', TRUE)
ON CONFLICT (email) DO NOTHING;

SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 1));

-- ---------------------------------------------------------------------------
-- 2. Articles publiés — 24 pièces réparties sur 6 univers.
--    8 pièces « apples » (prix <= 25 000 FCFA) pour « Trouvailles à petits prix ».
--    Les pièces neuves portent old_price pour alimenter le badge de réduction.
-- ---------------------------------------------------------------------------
INSERT INTO products
  (owner_id, category_id, name, slug, description, condition, price, old_price,
   location, status, approved_at, approved_by, brand, model, age_years, view_count, created_at)
VALUES
  -- Mode / Vêtements (sous-cat 6)
  (9001,  6, 'Manteau long en laine camel',        'manteau-laine-camel',
   'Manteau droit en pure laine, coupe droite, doublé jersey. Très bon état, porté quelques fois. Dry clean uniquement.',
   'Très bon état', 45000, 65000, 'Cocody', 'AVAILABLE', now(), 9000, 'Zara', 'Manteau laine', 3, 142,  now() - interval '2 days'),
  (9002,  6, 'Robe fleurie coton seaside',         'robe-fleurie-seaside',
   'Robe midi en coton léger, imprimé floral. Très peu portée, aucune tache.',
   'Neuf', 22000, NULL, 'Plateau', 'AVAILABLE', now(), 9000, 'Sandro', 'Robe midi', 1, 88,  now() - interval '1 day'),
  (9003,  6, 'Chemise en lin écru',                'chemise-lin-ecru',
   'Chemise en lin lavé, coupe droite. Parfaite pour la mi-saison.',
   'Bon état', 18000, NULL, 'Yopougon', 'AVAILABLE', now(), 9000, NULL, NULL, 2, 61,  now() - interval '5 hours'),
  (9004,  6, 'Jean denim brut taille haute',        'jean-denim-brut',
   'Jean 501 denim brut, non délavé. Taille 38. Neuf avec étiquette.',
   'Neuf', 28000, 35000, 'Marcory', 'AVAILABLE', now(), 9000, 'Levi''s', '501', 1, 205, now() - interval '3 days'),
  -- Mode / Chaussures (sous-cat 7)
  (9001,  7, 'Baskets cuir blanches pointure 42',  'baskets-cuir-blanches-42',
   'Baskets en cuir pleine fleur, semelle d''usure. Pointure 42. Très bon état.',
   'Très bon état', 24000, NULL, 'Cocody', 'AVAILABLE', now(), 9000, 'Skechers', NULL, 2, 119, now() - interval '9 hours'),
  (9003,  7, 'Sandales cuir tressé pointure 38',   'sandales-tressees-38',
   'Sandales à brides en cuir tressé, très légères. Pointure 38.',
   'Bon état', 12000, 17000, 'Plateau', 'AVAILABLE', now(), 9000, NULL, NULL, 3, 74,  now() - interval '30 hours'),
  (9004,  7, 'Escarpins noirs vernis pointure 39', 'escarpins-noirs-vernis-39',
   'Escarpins vernis patenté, très peu portés. Pointure 39.',
   'Neuf', 21000, NULL, 'Yopougon', 'AVAILABLE', now(), 9000, NULL, NULL, 1, 57,  now() - interval '4 days'),
  -- Mode / Sacs (sous-cat 8)
  (9002,  8, 'Sac à main cuir caramel',            'sac-main-cuir-caramel',
   'Sac à main en cuir pleine fleur, doublure tissu, fermoir doré. Très bon état.',
   'Très bon état', 32000, 45000, 'Cocody', 'AVAILABLE', now(), 9000, NULL, NULL, 2, 98,  now() - interval '6 hours'),
  (9003,  8, 'Sac à dos urbain noir',             'sac-dos-urbain-noir',
   'Sac à dos 20L en tissu résistant, compartiment matelassé pour laptop.',
   'Bon état', 15000, NULL, 'Plateau', 'AVAILABLE', now(), 9000, NULL, NULL, 2, 133, now() - interval '20 hours'),
  -- Électronique / Téléphones (sous-cat 13)
  (9001, 13, 'iPhone 12 64 Go midnight',           'iphone-12-64go-midnight',
   'iPhone 12 64 Go, écran sans fissure, batterie 88%. Boîtier et câble d''origine.',
   'Très bon état', 320000, 380000, 'Cocody', 'AVAILABLE', now(), 9000, 'Apple', 'iPhone 12', 3, 421, now() - interval '1 day'),
  (9002, 13, 'Samsung Galaxy S21_fe 128 Go',       'galaxy-s21fe-128go',
   'Galaxy S21 FE 128 Go, état impeccable, coque d''origine incluse.',
   'Neuf', 185000, NULL, 'Plateau', 'AVAILABLE', now(), 9000, 'Samsung', 'S21 FE', 2, 287, now() - interval '12 hours'),
  (9003, 13, 'Chargeur sans fil 15 W',             'chargeur-sans-fil-15w',
   'Chargeur à induction 15 W avec câble USB-C. Fonctionne parfaitement.',
   'Neuf', 8500, 12000, 'Yopougon', 'AVAILABLE', now(), 9000, NULL, NULL, 1, 166, now() - interval '3 days'),
  -- Électronique / Ordinateurs (sous-cat 14)
  (9004, 14, 'MacBook Air 13" M1 8 Go 256 Go',     'macbook-air-13-m1-256go',
   'MacBook Air M1, 8 Go RAM, 256 Go SSD. Cycle batterie 87%. Très bon état.',
   'Très bon état', 425000, 550000, 'Cocody', 'AVAILABLE', now(), 9000, 'Apple', 'MacBook Air M1', 3, 512, now() - interval '5 days'),
  (9002, 14, 'Clavier mécanique AZERTY',            'clavier-mecanique-azerty',
   'Clavier mécanique AZERTY, switches rouges, RGB. Boîtier aluminium.',
   'Neuf', 19000, NULL, 'Plateau', 'AVAILABLE', now(), 9000, NULL, NULL, 1, 93,  now() - interval '15 hours'),
  -- Maison / Mobilier (sous-cat 10)
  (9003, 10, 'Fauteuil en rotin tressé',            'fauteuil-rotin-tresse',
   'Fauteuil en rotin naturel, structure solide. Housse d''origine removée pour nettoyage.',
   'Bon état', 55000, 75000, 'Cocody', 'AVAILABLE', now(), 9000, NULL, NULL, 5, 140, now() - interval '8 days'),
  (9001, 10, 'Table d''appoint en bois massif',     'table-appoint-bois-massif',
   'Table d''appoint en bois massif, plateauciré 50 cm. Très bon état.',
   'Très bon état', 23000, NULL, 'Plateau', 'AVAILABLE', now(), 9000, NULL, NULL, 4, 71,  now() - interval '40 hours'),
  -- Maison / Décoration (sous-cat 11)
  (9004, 11, 'Miroir rond chêne diamètre 80 cm',   'miroir-rond-chene-80',
   'Miroir rond sur cadre chêne massif. Très bon état, verre impeccable.',
   'Très bon état', 16000, 22000, 'Yopougon', 'AVAILABLE', now(), 9000, NULL, NULL, 4, 88,  now() - interval '2 days'),
  (9002, 11, 'Lampe d''appoint lin et chêne',      'lampe-appoint-lin-chene',
   'Lampe d''appoint, abat-jour lin naturel, piètement chêne. Fonctionne parfaitement.',
   'Neuf', 14000, NULL, 'Cocody', 'AVAILABLE', now(), 9000, NULL, NULL, 2, 105, now() - interval '26 hours'),
  -- Maison / Cuisine (sous-cat 12)
  (9003, 12, 'Service de table 18 pièces',         'service-table-18pieces',
   'Service 18 pièces en grès émaillé, motif à géométrie. Jamais utilisé.',
   'Neuf', 25000, NULL, 'Plateau', 'AVAILABLE', now(), 9000, NULL, NULL, 1, 64,  now() - interval '36 hours'),
  (9001, 12, 'Machine à café à piston chromée',    'machine-cafe-piston-chromee',
   'Machine à piston chromée, 350 ml. Très bon état, joints neufs.',
   'Très bon état', 18000, 24000, 'Cocody', 'AVAILABLE', now(), 9000, NULL, NULL, 3, 122, now() - interval '7 days'),
  -- Loisirs / Livres (sous-cat 19)
  (9004, 19, 'Lot de 12 romans français',           'lot-12-romans-francais',
   'Lot de 12 romans français en bon état, lus une fois. Pages.complete.',
   'Bon état', 12000, NULL, 'Yopougon', 'AVAILABLE', now(), 9000, NULL, NULL, 2, 47,  now() - interval '4 days'),
  (9002, 19, 'Coffret 3 bandes dessinées',         'coffret-3-bd',
   'Coffret de 3 bandes dessinées en édition prestige. État neuf sous blister.',
   'Neuf', 9000, NULL, 'Plateau', 'AVAILABLE', now(), 9000, NULL, NULL, 1, 38,  now() - interval '50 hours'),
  -- Loisirs / Sport (sous-cat 21)
  (9003, 21, 'Roue d''entraînement pliable',        'roue-entrainement-pliable',
   'Roue d''entraînement pliable, frein magnétique. Parfaite pour un appartement.',
   'Très bon état', 38000, 45000, 'Cocody', 'AVAILABLE', now(), 9000, NULL, NULL, 1, 96,  now() - interval '6 days'),
  (9004, 21, 'Tapis de yoga antidérapant 6 mm',     'tapis-yoga-antiderapant',
   'Tapis de yoga 183x61 cm, épaisseur 6 mm, matière naturels. Très bon état.',
   'Très bon état', 11000, NULL, 'Plateau', 'AVAILABLE', now(), 9000, NULL, NULL, 2, 55,  now() - interval '22 hours'),
  -- Loisirs / Jeux (sous-cat 20)
  (9001, 20, 'Jeu de société de stratégie',        'jeu-societe-strategy',
   'Jeu de société de stratégie pour 2 à 4 joueurs. Boîte complète, notice incluse.',
   'Très bon état', 16000, 22000, 'Cocody', 'AVAILABLE', now(), 9000, NULL, NULL, 3, 84,  now() - interval '18 hours')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Images
-- ---------------------------------------------------------------------------
-- Chaque article reçoit 2 photos : principale (position 1) et secondaire
-- de survol / galerie (position 2).
--
-- **Photos de la maquette** (`Bureau/main/assets/data.js`, RV.PRODUCTS) :
-- téléchargées dans `web/public/catalog/<produit-maquette>-<n>.jpg` et
-- servies par le front (same-origin, aucune dépendance réseau, CSP
-- `img-src 'self'` respectée). Un même visuel maquette est réutilisé par
-- plusieurs articles démo du même univers quand la maquette n'a pas
-- d'équivalent exact (ex. : 2 articles smartphones pour 1 visuel).
--
-- Le front résout ces chemins tels quels (`resolveImageUrl`) : ils ne sont
-- PAS préfixés par /uploads/products/. En cas d'échec, `SiteImage` bascule
-- sur l'illustration SVG de secours.
-- ---------------------------------------------------------------------------

-- 3.a Insertion (bases fraîches) — idempotent : uq_product_position
--     (product_id, position) fait sauter les lignes déjà présentes.
INSERT INTO product_images (product_id, path, is_primary, position)
SELECT p.id, v.path, TRUE, 1
FROM products p
JOIN (VALUES
  ('manteau-laine-camel', 1, '/catalog/manteau-long-en-laine-1.jpg'),
  ('robe-fleurie-seaside', 1, '/catalog/pull-maille-creme-1.jpg'),
  ('chemise-lin-ecru', 1, '/catalog/t-shirt-coton-blanc-1.jpg'),
  ('jean-denim-brut', 1, '/catalog/veste-en-jean-delavee-1.jpg'),
  ('baskets-cuir-blanches-42', 1, '/catalog/sneakers-cuir-creme-1.jpg'),
  ('sandales-tressees-38', 1, '/catalog/bottines-en-cuir-1.jpg'),
  ('escarpins-noirs-vernis-39', 1, '/catalog/escarpins-noirs-1.jpg'),
  ('sac-main-cuir-caramel', 1, '/catalog/sac-a-main-en-cuir-1.jpg'),
  ('sac-dos-urbain-noir', 1, '/catalog/sac-a-dos-en-toile-1.jpg'),
  ('iphone-12-64go-midnight', 1, '/catalog/smartphone-128-go-1.jpg'),
  ('galaxy-s21fe-128go', 1, '/catalog/smartphone-128-go-1.jpg'),
  ('chargeur-sans-fil-15w', 1, '/catalog/montre-connectee-1.jpg'),
  ('macbook-air-13-m1-256go', 1, '/catalog/casque-audio-sans-fil-1.jpg'),
  ('clavier-mecanique-azerty', 1, '/catalog/montre-connectee-1.jpg'),
  ('fauteuil-rotin-tresse', 1, '/catalog/fauteuil-chine-1.jpg'),
  ('table-appoint-bois-massif', 1, '/catalog/lampe-de-table-terracotta-1.jpg'),
  ('miroir-rond-chene-80', 1, '/catalog/miroir-mural-dore-1.jpg'),
  ('lampe-appoint-lin-chene', 1, '/catalog/lampe-de-table-terracotta-1.jpg'),
  ('service-table-18pieces', 1, '/catalog/miroir-mural-dore-1.jpg'),
  ('machine-cafe-piston-chromee', 1, '/catalog/fauteuil-chine-1.jpg'),
  ('lot-12-romans-francais', 1, '/catalog/lot-de-romans-1.jpg'),
  ('coffret-3-bd', 1, '/catalog/lot-de-romans-1.jpg'),
  ('roue-entrainement-pliable', 1, '/catalog/appareil-photo-compact-1.jpg'),
  ('tapis-yoga-antiderapant', 1, '/catalog/guitare-acoustique-1.jpg'),
  ('jeu-societe-strategy', 1, '/catalog/lot-de-romans-1.jpg')
) AS v(slug, position, path) ON v.slug = p.slug
ON CONFLICT DO NOTHING;

INSERT INTO product_images (product_id, path, is_primary, position)
SELECT p.id, v.path, FALSE, 2
FROM products p
JOIN (VALUES
  ('manteau-laine-camel', 2, '/catalog/manteau-long-en-laine-2.jpg'),
  ('robe-fleurie-seaside', 2, '/catalog/pull-maille-creme-2.jpg'),
  ('chemise-lin-ecru', 2, '/catalog/t-shirt-coton-blanc-2.jpg'),
  ('jean-denim-brut', 2, '/catalog/veste-en-jean-delavee-2.jpg'),
  ('baskets-cuir-blanches-42', 2, '/catalog/sneakers-cuir-creme-2.jpg'),
  ('sandales-tressees-38', 2, '/catalog/bottines-en-cuir-2.jpg'),
  ('escarpins-noirs-vernis-39', 2, '/catalog/escarpins-noirs-2.jpg'),
  ('sac-main-cuir-caramel', 2, '/catalog/sac-a-main-en-cuir-2.jpg'),
  ('sac-dos-urbain-noir', 2, '/catalog/sac-a-dos-en-toile-2.jpg'),
  ('iphone-12-64go-midnight', 2, '/catalog/smartphone-128-go-2.jpg'),
  ('galaxy-s21fe-128go', 2, '/catalog/smartphone-128-go-2.jpg'),
  ('chargeur-sans-fil-15w', 2, '/catalog/montre-connectee-2.jpg'),
  ('macbook-air-13-m1-256go', 2, '/catalog/casque-audio-sans-fil-2.jpg'),
  ('clavier-mecanique-azerty', 2, '/catalog/montre-connectee-2.jpg'),
  ('fauteuil-rotin-tresse', 2, '/catalog/fauteuil-chine-2.jpg'),
  ('table-appoint-bois-massif', 2, '/catalog/lampe-de-table-terracotta-2.jpg'),
  ('miroir-rond-chene-80', 2, '/catalog/miroir-mural-dore-2.jpg'),
  ('lampe-appoint-lin-chene', 2, '/catalog/lampe-de-table-terracotta-2.jpg'),
  ('service-table-18pieces', 2, '/catalog/miroir-mural-dore-2.jpg'),
  ('machine-cafe-piston-chromee', 2, '/catalog/fauteuil-chine-2.jpg'),
  ('lot-12-romans-francais', 2, '/catalog/lot-de-romans-2.jpg'),
  ('coffret-3-bd', 2, '/catalog/lot-de-romans-2.jpg'),
  ('roue-entrainement-pliable', 2, '/catalog/appareil-photo-compact-2.jpg'),
  ('tapis-yoga-antiderapant', 2, '/catalog/guitare-acoustique-2.jpg'),
  ('jeu-societe-strategy', 2, '/catalog/lot-de-romans-2.jpg')
) AS v(slug, position, path) ON v.slug = p.slug
ON CONFLICT DO NOTHING;

-- 3.b Rattrapage des bases déjà seedées — idempotent.
--     Les anciennes lignes pointaient vers des photos Unsplash distantes
--     sans rapport avec l'article ; on les recale sur les photos locales
--     (même article, même position).
UPDATE product_images pi
SET path = v.path
FROM products p
JOIN (VALUES
  ('manteau-laine-camel', 1, '/catalog/manteau-long-en-laine-1.jpg'),
  ('robe-fleurie-seaside', 1, '/catalog/pull-maille-creme-1.jpg'),
  ('chemise-lin-ecru', 1, '/catalog/t-shirt-coton-blanc-1.jpg'),
  ('jean-denim-brut', 1, '/catalog/veste-en-jean-delavee-1.jpg'),
  ('baskets-cuir-blanches-42', 1, '/catalog/sneakers-cuir-creme-1.jpg'),
  ('sandales-tressees-38', 1, '/catalog/bottines-en-cuir-1.jpg'),
  ('escarpins-noirs-vernis-39', 1, '/catalog/escarpins-noirs-1.jpg'),
  ('sac-main-cuir-caramel', 1, '/catalog/sac-a-main-en-cuir-1.jpg'),
  ('sac-dos-urbain-noir', 1, '/catalog/sac-a-dos-en-toile-1.jpg'),
  ('iphone-12-64go-midnight', 1, '/catalog/smartphone-128-go-1.jpg'),
  ('galaxy-s21fe-128go', 1, '/catalog/smartphone-128-go-1.jpg'),
  ('chargeur-sans-fil-15w', 1, '/catalog/montre-connectee-1.jpg'),
  ('macbook-air-13-m1-256go', 1, '/catalog/casque-audio-sans-fil-1.jpg'),
  ('clavier-mecanique-azerty', 1, '/catalog/montre-connectee-1.jpg'),
  ('fauteuil-rotin-tresse', 1, '/catalog/fauteuil-chine-1.jpg'),
  ('table-appoint-bois-massif', 1, '/catalog/lampe-de-table-terracotta-1.jpg'),
  ('miroir-rond-chene-80', 1, '/catalog/miroir-mural-dore-1.jpg'),
  ('lampe-appoint-lin-chene', 1, '/catalog/lampe-de-table-terracotta-1.jpg'),
  ('service-table-18pieces', 1, '/catalog/miroir-mural-dore-1.jpg'),
  ('machine-cafe-piston-chromee', 1, '/catalog/fauteuil-chine-1.jpg'),
  ('lot-12-romans-francais', 1, '/catalog/lot-de-romans-1.jpg'),
  ('coffret-3-bd', 1, '/catalog/lot-de-romans-1.jpg'),
  ('roue-entrainement-pliable', 1, '/catalog/appareil-photo-compact-1.jpg'),
  ('tapis-yoga-antiderapant', 1, '/catalog/guitare-acoustique-1.jpg'),
  ('jeu-societe-strategy', 1, '/catalog/lot-de-romans-1.jpg'),
  ('manteau-laine-camel', 2, '/catalog/manteau-long-en-laine-2.jpg'),
  ('robe-fleurie-seaside', 2, '/catalog/pull-maille-creme-2.jpg'),
  ('chemise-lin-ecru', 2, '/catalog/t-shirt-coton-blanc-2.jpg'),
  ('jean-denim-brut', 2, '/catalog/veste-en-jean-delavee-2.jpg'),
  ('baskets-cuir-blanches-42', 2, '/catalog/sneakers-cuir-creme-2.jpg'),
  ('sandales-tressees-38', 2, '/catalog/bottines-en-cuir-2.jpg'),
  ('escarpins-noirs-vernis-39', 2, '/catalog/escarpins-noirs-2.jpg'),
  ('sac-main-cuir-caramel', 2, '/catalog/sac-a-main-en-cuir-2.jpg'),
  ('sac-dos-urbain-noir', 2, '/catalog/sac-a-dos-en-toile-2.jpg'),
  ('iphone-12-64go-midnight', 2, '/catalog/smartphone-128-go-2.jpg'),
  ('galaxy-s21fe-128go', 2, '/catalog/smartphone-128-go-2.jpg'),
  ('chargeur-sans-fil-15w', 2, '/catalog/montre-connectee-2.jpg'),
  ('macbook-air-13-m1-256go', 2, '/catalog/casque-audio-sans-fil-2.jpg'),
  ('clavier-mecanique-azerty', 2, '/catalog/montre-connectee-2.jpg'),
  ('fauteuil-rotin-tresse', 2, '/catalog/fauteuil-chine-2.jpg'),
  ('table-appoint-bois-massif', 2, '/catalog/lampe-de-table-terracotta-2.jpg'),
  ('miroir-rond-chene-80', 2, '/catalog/miroir-mural-dore-2.jpg'),
  ('lampe-appoint-lin-chene', 2, '/catalog/lampe-de-table-terracotta-2.jpg'),
  ('service-table-18pieces', 2, '/catalog/miroir-mural-dore-2.jpg'),
  ('machine-cafe-piston-chromee', 2, '/catalog/fauteuil-chine-2.jpg'),
  ('lot-12-romans-francais', 2, '/catalog/lot-de-romans-2.jpg'),
  ('coffret-3-bd', 2, '/catalog/lot-de-romans-2.jpg'),
  ('roue-entrainement-pliable', 2, '/catalog/appareil-photo-compact-2.jpg'),
  ('tapis-yoga-antiderapant', 2, '/catalog/guitare-acoustique-2.jpg'),
  ('jeu-societe-strategy', 2, '/catalog/lot-de-romans-2.jpg')
) AS v(slug, position, path) ON v.slug = p.slug
WHERE pi.product_id = p.id
  AND pi.position = v.position
  AND pi.path IS DISTINCT FROM v.path;
