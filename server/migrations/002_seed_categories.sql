-- ============================================================
-- ReVends — 002_seed_categories.sql  (D7 : 5 catégories + sous-catégories)
-- IDs explicites pour stabilité des FK. Source : architecture.md §4.
-- ============================================================

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