# Audit backend & base de données — ReVends

- **Date** : 2026-10-27
- **Périmètre** : API Express 5, persistance PostgreSQL, pipeline média
  (upload → stockage → BDD → URL → affichage), nginx et volumes Docker.
- **Cible principale** : `http://127.0.0.1:8080` (nginx → `revends_api1/2/3`)
- **Cible fonctionnelle** : `http://127.0.0.1:4002` (instance e2e, `revends_e2e`)
- **Mode** : **lecture seule**. Aucun `DROP`/`TRUNCATE`/`UPDATE`/`DELETE` sur la
  base de dev `revends`, aucune migration créée, aucun fichier source modifié.
  Les seuls artefacts d'écriture ont été créés sur `revends_e2e` (instance 4002,
  `MAIL_ENABLED=false`, `RATE_LIMIT_DISABLED=true`), qui est la base de recette.
- **Auditeur** : audit automatisé + revue de code manuelle.

> **Avertissement de sincérité** : cet audit n'est pas exhaustif. Il couvre les
> contrôles listés en §1 et §10. Les éléments non testés / bloqués sont
> explicitement listés en §11. Aucune conclusion ne doit être extrapolée à un
> environnement non observé (notamment la production Render, non accessible ici).
> Aucun secret (mot de passe, jeton) n'est affiché dans ce document.

---

## 1. Synthèse

| Statut | Nombre |
| --- | ---: |
| PASS | 31 |
| FAIL | 12 |
| PARTIAL | 5 |
| **Total contrôles** | **48** |

**Trois défauts fonctionnels majeurs (P1) confirmés par des preuves reproductibles :**

1. **`MIN_PHOTOS = 3` contredit le contrat « 1..4 photos »** et **verrouille
   l'édition de tout article ayant moins de 3 photos**. Sur `revends_e2e`, **408
   articles** en statut éditable (363 `AVAILABLE` + 45 `REJECTED`) n'ont qu'une
   seule photo : toute modification (même du seul prix) échoue en
   `400 PHOTO_MISSING`. En dev, **les 25 produits** ont exactement 2 photos.
2. **Les paramètres photo documentés (`remove_photo_ids`, `photo_order`) sont
   ignorés** : le code attend `removePhotoIds`/`photoOrder` (camelCase). Un client
   conforme au contrat reçoit `200` sans qu'aucune photo ne soit supprimée
   (« no-op silencieux »).
3. **Les photos utilisateurs ne sont jamais servies par l'entrée publique nginx
   (`:8080`) : 100 % des `/uploads/*.png` renvoient 404**, à cause d'une
   `location ~*` prioritaire qui court-circuite `location /uploads/`.

**Deux défauts de persistance média (P1/P2) :**

4. **La suppression de fichier pointe vers le mauvais répertoire** :
   `resolveUploadPath()` résout `uploads/products/x` contre `process.cwd()`
   (`/app`) alors que les fichiers vivent dans `/data/uploads/products`. `unlink`
   échoue silencieusement (`.catch(() => {})`) → **440 fichiers orphelins**
   (6,1 Mo de volume, dont 439 préexistants).
5. **Le soft-delete (vendeur comme admin) ne purge aucun fichier** et les images
   d'un produit supprimé restent **publiquement accessibles en HTTP 200**.

---

## 2. Cartographie des environnements

| Base | Hôte:port | Projet compose | Utilisée par | Rôle |
| --- | --- | --- | --- | --- |
| `revends` | `127.0.0.1:5440` | `revends` / service `postgres` | `revends_api1..3` | **Base de dev live** (source de vérité) |
| `revends_e2e` | `127.0.0.1:5440` | `revends` / service `postgres` | `revends_api_e2e` (`:4002`) | Base de recette / e2e |
| `revends` | `127.0.0.1:5433` | `server` / `revends-postgres` | (aucune instance ReVends active) | **Base stale** — dérive d'environnement |
| `revends_test` | `127.0.0.1:5433` | `server` / `revends-postgres` | `npm test` local | Base des tests (transitoire) |

Preuves :

- `docker exec revends_api1 getent hosts postgres` → `172.30.0.3` = `revends_postgres`
  (mappé sur `5440`), alors que `revends-postgres` (`5433`) appartient au réseau
  `server`.
- `revends_api1` : `DATABASE_URL=postgres://revends:***@postgres:5432/revends`,
  `UPLOAD_DIR=/data/uploads/products`.
- `revends_api_e2e` : `DATABASE_URL=…@postgres:5432/revends_e2e`, même `UPLOAD_DIR`.
- Les 4 conteneurs API partagent le volume `revends_revends_uploads` monté sur
  `/data/uploads/products`.

**Conclusion** : la « base de dev » est `revends` sur **5440**. La base
`revends` sur **5433** est une base d'un autre projet compose, restée en arrière
(non migrée), à ne pas confondre (voir P2-3).

---

## 3. Schéma de la base

### 3.1 Tables (schéma `public`, 16 objets)

| Table | Rôle |
| --- | --- |
| `users` | comptes (rôle `user`/`admin`, OAuth, `password_changed_at`) |
| `products` | articles (statut, prix, `old_price`, `view_count`, soft-delete) |
| `product_images` | photos d'un article (`path`, `position`, `is_primary`) |
| `categories` | arbre catégories/sous-catégories (`parent_id`) |
| `orders` | commandes (`order_number`, `amount`, `quantity`, `price`) |
| `payments` | paiements liés aux commandes |
| `order_events` | journal d'états des commandes |
| `cart` / `favorites` | panier / favoris |
| `notifications` | notifications utilisateur |
| `banners` | bandeaux d'accueil |
| `admin_actions` | journal des actions admin |
| `seller_payouts` | versements vendeurs |
| `session` | sessions Express (`connect-pg-simple`) |
| `password_reset_tokens` | jetons de réinitialisation (migration 012) |
| `schema_migrations` | registre des migrations appliquées |

### 3.2 Enums

| Enum | Valeurs |
| --- | --- |
| `product_status` | `PENDING, AVAILABLE, RESERVED, SOLD, REJECTED` |
| `product_condition` | `Neuf, Très bon état, Bon état, Correct, À réparer` |
| `order_status` | `CREATED, PAYMENT_PENDING, PAID, PRODUCT_WAITING, PRODUCT_RECEIVED, PREPARING, SHIPPED, IN_DELIVERY, DELIVERED, COMPLETED, PAYMENT_FAILED, CANCELLED` |
| `payment_status` | `PENDING, PAID, FAILED` |
| `payment_method` | `MOBILE_MONEY, CASH, BANK_TRANSFER, OTHER` |
| `payout_status` | `PENDING, DUE, PAID` |
| `user_role` | `user, admin` |
| `notification_type` | 18 valeurs (`article_submitted`, `order_*`, `seller_paid`, …) |

Extensions : `pg_trgm 1.6`, `plpgsql 1.0`.

### 3.3 Contraintes et index de `product_images`

```
product_images_pkey            PRIMARY KEY (id)
product_images_position_check  CHECK (position >= 1 AND position <= 4)
product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
uq_product_position            UNIQUE (product_id, position)
uq_one_primary_per_product     UNIQUE (product_id) WHERE is_primary
```

> **Constat** : aucune contrainte ne garantit `is_primary ⇔ position = 1`. Cet
> invariant n'est maintenu que **par le code** (`normalizePrimaryImage`,
> `products.repository.ts:291-292`), pas par la base (P3-3).

### 3.4 Migrations

| Environnement | Migrations appliquées | 012 présente ? |
| --- | ---: | :---: |
| `5440/revends` | 11 | ✅ |
| `5440/revends_e2e` | 11 | ✅ |
| `5433/revends` (stale) | 10 | ❌ |
| `5433/revends_test` | 11 | ✅ |

Fichiers présents dans `server/migrations/` : `001` → `010`, puis **`012`**
(`011` manquant, trou de numérotation). `schema_migrations` ne contient que
`filename` + `applied_at` : **aucun checksum**, donc aucune détection de
modification d'une migration déjà appliquée (P3-1).

---

## 4. Intégrité des données par base

### 4.1 Volumétrie

| Table | `5440/revends` (dev) | `5440/revends_e2e` | `5433/revends` (stale) | `5433/revends_test` |
| --- | ---: | ---: | ---: | ---: |
| products | 25 | 561 | 33 | 20 |
| product_images | 50 | 692 | 50 | 60 |
| users | 33 | 1055 | 8 | 26 |
| orders | 0 | 150 | 0 | 5 |
| payments | 0 | 150 | 0 | 5 |
| order_events | 0 | 804 | 0 | 13 |
| cart | 0 | 33 | 1 | 0 |
| favorites | 0 | 0 | 1 | 0 |
| notifications | 0 | 2191 | 0 | 54 |
| banners | 3 | 3 | 3 | 0 |
| categories | 22 | 22 | 22 | 22 |
| session | 0 | 0 | 4 | 26 |

### 4.2 Contrôles A1 → A13

| Contrôle | dev (5440) | e2e | stale (5433) | test |
| --- | :---: | :---: | :---: | :---: |
| A1 produits vivants sans image | 0 | 0 | **8 (AVAILABLE)** | 0 |
| A2 images sans produit | 0 | 0 | 0 | 0 |
| A3 prix incohérents (`<500`, `≤0`, `old≤price`, remise >90 %) | 0 | 0 | 0 | 0 |
| A4 doublons de slug (exact / casse) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| A5 orphelins FK (8 relations) | 0 | 0 | 0 | 0 |
| A6 totaux commandes cohérents | n/a (0) | ✅ | n/a (0) | ✅ |
| A6c paiements cohérents (date/montant) | n/a | ✅ | n/a | ✅ |
| A7 soft-delete incohérent (SOLD/RESERVED) | 0 | 0 | 0 | 0 |
| A9 `sans_primaire` / `multi_primaire` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| A9b `is_primary` ≠ `position 1` | 0 | 0 | 0 | 0 |
| A11 dernier `order_event` = statut | n/a | 0 incohérent | n/a | 0 |
| A12 commande sans event | n/a | 0 | n/a | 0 |
| A13 `PENDING` avec `approved_at` | 0 | 0 | 0 | 0 |
| A8 sessions expirées | 0/0 | 0/0 | **4/4** | 0/26 |

**Anomalie unique d'intégrité** : `5433/revends` contient **8 produits `AVAILABLE`
sans aucune image** (ids 1 à 8 : iPhone 13 Pro, MacBook Air M2, Veste en cuir,
Canapé 3 places, Vélo VTT, Écran 27" 4K, Robe été, Machine à laver). Aucune autre
incohérence détectée sur les 4 bases.

### 4.3 Distribution du nombre de photos par article vivant

| `n` photos | dev (5440) | e2e (par statut) |
| ---: | ---: | --- |
| 0 | 0 | 0 |
| 1 | 0 | `AVAILABLE` 363, `SOLD` 47, `REJECTED` 45 = **455** |
| 2 | **25** | 0 |
| 3 | 0 | `AVAILABLE` 30, `RESERVED` 10, `PENDING` 2, `SOLD` 5, `REJECTED` 5 = 52 |
| ≥ 4 | 0 | 0 |

> **Conséquence directe du `MIN_PHOTOS = 3`** : 363 + 45 = **408 articles** de
> `revends_e2e` sont dans un statut modifiable mais n'ont qu'une photo → toute
> mise à jour échoue (P1-1). En dev, **les 25 produits** ont 2 photos → idem.

### 4.4 Chemins d'images en base

| Base | `uploads/*` | `/catalog/*` | `http(s)://` | chemins distincts |
| --- | ---: | ---: | ---: | ---: |
| `5440/revends` | 0 | 50 | 0 | 36 |
| `5440/revends_e2e` | 692 | 0 | 0 | 692 |
| `5433/revends` | 0 | 50 | 0 | 36 |
| `5433/revends_test` | 60 | 0 | 0 | 60 |

Les bases dev/stale utilisent des images éditoriales `/catalog/*.jpg` (partagées
entre produits : 50 lignes pour 36 fichiers), servies par nginx depuis
`/usr/share/nginx/html/catalog` (44 fichiers présents). La base e2e et la base de
test utilisent des uploads `uploads/products/<uuid>.<ext>`.

---

## 5. Pipeline média (upload → stockage → BDD → URL → affichage)

Scénario exécuté sur `:4002` (base `revends_e2e`) avec un compte réel
`audit-media+1793059507@example.com` (id 1055). Le fichier `pipeline-run.out` et
`pipeline2-run.out` contiennent les traces brutes.

| # | Étape / cas | Attendu (contrat) | Observé | Statut |
| ---: | --- | --- | --- | :---: |
| 1 | `POST /api/auth/register` | `201` + session | `201 {"id":1055}` | ✅ |
| 2 | `POST /api/products` 0 photo | `400 PHOTO_MISSING` | `400 PHOTO_MISSING` « au moins 3 photos » | ✅ (mais message faux) |
| 3 | `POST` 1 photo | `201` (contrat 1..4) | **`400 PHOTO_MISSING`** | ❌ |
| 4 | `POST` 2 photos | `201` (contrat 1..4) | **`400 PHOTO_MISSING`** | ❌ |
| 5 | `POST` 3 photos | `201` | `201` (id 676, 3 images) | ✅ |
| 6 | `POST` 5 photos | `400 PHOTO_LIMIT` | `400 PHOTO_LIMIT` « Maximum 4 » | ✅ |
| 7 | `POST` fichier > 5 Mo | `400 PHOTO_TOO_LARGE` | `400 PHOTO_TOO_LARGE` | ✅ |
| 8 | `POST` texte renommé `.jpg` | `400 PHOTO_INVALID_TYPE` | `400 PHOTO_INVALID_TYPE` | ✅ |
| 9 | `POST` JPEG réel déclaré `text/plain` | accepté (magic bytes) | `201` (id 677) | ✅ |
| 10 | Écriture disque | fichier dans `UPLOAD_DIR` | `FILE OK /data/uploads/products/…jpg` | ✅ |
| 11 | BDD `product_images` | 1 ligne / photo, positions 1..n | 3 lignes, `is_primary` position 1 | ✅ |
| 12 | URL publique renvoyée | `/uploads/products/<uuid>.<ext>` | conforme | ✅ |
| 13 | `GET` public avant approbation | `404` | `404` | ✅ |
| 14 | Approbation admin | `200` + `AVAILABLE` | `200`, `approved_by=1` | ✅ |
| 15 | `GET` public après approbation | `200` | `200` | ✅ |
| 16 | `GET /uploads/...` via **:4002** | `200 image/jpeg` | `200 image/jpeg` (3/3) | ✅ |
| 17 | `GET /uploads/...` via **:8080** | `200` | **`404 text/html`** (3/3) | ❌ |
| 18 | `PUT` `remove_photo_ids` (snake_case documenté) | suppression | `200` mais **4 images conservées** | ❌ |
| 19 | `PUT` `removePhotoIds` (camelCase réel) | — | `200`, **3 images** (suppression effective) | ✅ (hors contrat) |
| 20 | Fichier après suppression DB | supprimé du disque | **toujours présent** | ❌ |
| 21 | `HEAD` image restante | `200 image/jpeg` | `200` | ✅ |
| 22 | `DELETE` admin produit | `204` | `204` (+ répétition `204`) | ✅ |
| 23 | `GET` public produit supprimé | `404` | `404` | ✅ |
| 24 | Image d'un produit supprimé encore servie | ne devrait pas / à trancher | **`200`** | ❌ |

**Vérification HTTP exhaustive complémentaire** :

- 50/50 chemins `/catalog/*` de la base dev → **`200`** sur `:8080`.
- Échantillon 60/60 `uploads/*` de la base e2e → **`200`** sur `:4002`.
- Échantillon 20/20 `uploads/*` de la base e2e → **`404`** sur `:8080`.

---

## 6. Fichiers ↔ base de données

### 6.1 Volume partagé `/data/uploads/products`

| Indicateur | Valeur |
| --- | ---: |
| Fichiers présents | **1132** (1118 `.png`, 14 `.jpg`) |
| Taille totale | 6,1 Mo |
| Fichiers illisibles | 0 |
| Fichiers référencés en base **et** présents | **692** (tous les uploads e2e) |
| Fichiers du volume **non référencés** (orphelins) | **440** (439 `.png`, 1 `.jpg`) |
| Références `uploads/*` **absentes** du volume | 60 (base `revends_test`, fichiers dans `/tmp`) |

Bilan : `692 (référencés présents) + 440 (orphelins) = 1132`.

Les 60 références de `revends_test` pointent vers
`/tmp/revends-test-uploads-<pid>/uploads/products` (cf. `test/env.ts:55`) : elles
ne sont **pas** censées exister dans le volume Docker, ce n'est pas une anomalie
mais une isolation de test.

### 6.2 Fichiers morts embarqués dans l'image de `revends_api1`

`/app/uploads/products` contient **33 fichiers `.jpg` de 8 octets** (en-tête JPEG
tronqué), datés du build, **référencés par aucune base**. Ils ne sont pas servis
(`express.static` sert `/data/uploads`), mais polluent l'image (P3-4).

### 6.3 Cause racine des orphelins

`resolveUploadPath` (`products.service.ts:119-121`) :

```ts
function resolveUploadPath(publicPath: string): string {
  return path.resolve(process.cwd(), publicPath); // /app/uploads/products/... (FAUX)
}
```

Les fichiers sont écrits dans `config.uploadDir` = `/data/uploads/products`
(`config.ts:240`, `UPLOAD_DIR` absolu), mais relus par `unlink` via
`process.cwd()` = `/app`. **Deux répertoires différents.** Comme l'appel est
protégé par `.catch(() => {})` (`products.service.ts:124` et `:473`), l'échec est
totalement silencieux.

---

## 7. Plans d'exécution (EXPLAIN ANALYZE, BUFFERS)

Requêtes du catalogue (`queryCatalogPage`, `products.repository.ts:421-509`) :

| Requête | dev (5440) | e2e (561 produits) | Plan | Verdict |
| --- | ---: | ---: | --- | --- |
| Q1 `popular` + `price_max` | 1,40 ms | 0,73 ms | Index Scan `idx_products_view_count` | ✅ |
| Q2 `discover` | 1,21 ms | **3,84 ms** | **Seq Scan** `products` + `users`, puis top-N heapsort | ❌ non borné |
| Q3 `COUNT(*)` catalogue | 0,35 ms | 1,00 ms | **Seq Scan** `products` + Hash Join | ❌ non borné |
| Q4 recherche `q=%phone%` | 1,16 ms | **7,43 ms** | **Seq Scan** + `Join Filter` sur **6 colonnes** `ILIKE` ; `idx_products_name_trgm` **inutilisé** | ❌ |
| Q5 fiche produit | 0,19 ms | 0,34 ms | Index Scan `products_pkey` | ✅ |
| Q6 images produit | 0,30 ms | 0,09 ms | Index Scan `uq_product_position` | ✅ |

Index `products` disponibles : `idx_products_catalog (created_at DESC, id) WHERE
AVAILABLE`, `idx_products_category`, `idx_products_discount_ratio`,
`idx_products_moderation`, `idx_products_name_trgm (gin name)`,
`idx_products_owner_deleted`, `idx_products_price_asc/desc`,
`idx_products_view_count`, `products_pkey`, `products_slug_key`.

Analyse :

- **Q2 `discover`** trie sur `((id + floor(epoch/86400)) % 997)` : expression non
  indexable → parcours complet + tri top-N à chaque page. Coût linéaire avec le
  nombre d'articles.
- **Q3 `COUNT(*)`** refait le même parcours complet à chaque page (les deux
  requêtes partent en parallèle, `products.repository.ts:500-506`).
- **Q4 `ILIKE`** porte sur `name, description, brand, location, sc.name, c.name`.
  Seul `name` a un index trigram ; l'OR multi-colonnes empêche son usage → scan
  complet. Sur e2e, `idx_products_name_trgm` affiche `idx_scan = 0`.

À l'échelle actuelle (25 à 561 lignes) les temps restent < 8 ms, mais le coût est
**linéaire et non borné** : ces plans deviendront le goulot à quelques milliers
d'articles (P2-2).

---

## 8. Anomalies et correctifs proposés

> Aucun correctif n'a été appliqué (mission lecture seule). Les correctifs sont
> proposés pour l'équipe.

### P1-1 — `MIN_PHOTOS = 3` contredit le contrat et verrouille l'édition

- **Preuves**
  - `server/src/middleware/upload.ts:9` → `export const MIN_PHOTOS = 3;`
  - `server/src/services/products.service.ts:175` → rejet à la création si
    `files.length < 3`.
  - `server/src/services/products.service.ts:448` → rejet à la mise à jour si
    `totalAfter < 3` ; **`applyPhotoChanges` est appelée à chaque `PUT`**, même
    sans changement de photo (`:419`).
  - Le commentaire du code lui-même dit l'inverse :
    `products.service.ts:430` → « Garantie : de 1 à 4 photos en sortie ».
  - Contrat : `docs/api.md:987` (« 1 à 4 fichiers »), `:1007` (« 1..4 »),
    `:1102` (« Contrainte finale : 1..4 photos »).
  - Observé : `POST` 1 et 2 photos → `400 PHOTO_MISSING` ; 408 articles e2e et
    25 produits dev uneditable.
- **Impact** : impossible de publier une annonce avec 1 ou 2 photos (cas normal
  d'un particulier) ; impossible de modifier le prix d'un article existant ayant
  1-2 photos.
- **Correctif proposé** : `MIN_PHOTOS = 1`. Aligner le message d'erreur, les
  tests `sell.test.ts`/`soft-delete.test.ts` et vérifier que `PHOTO_LIMIT` reste
  à 4.

### P1-2 — Les champs photo documentés sont ignorés (snake_case vs camelCase)

- **Preuves**
  - Contrat : `docs/api.md:1099-1100` → `remove_photo_ids` / `photo_order`.
  - Schéma réel : `server/src/utils/validation.ts:145-171` →
    `removePhotoIds` / `photoOrder` (camelCase) uniquement, sans prétraitement
    snake_case.
  - Route : `server/src/routes/products.routes.ts:77` →
    `photoOpsSchema.parse(req.body)` directement.
  - Observé : `PUT` avec `remove_photo_ids=[828]` → `200`, **4 images restantes**
    (no-op) ; avec `removePhotoIds=[832]` → `200`, **3 images** (effectif).
- **Impact** : un client conforme au contrat croit avoir supprimé une photo ; la
  donnée reste en base et le fichier reste public. Écart de contrat silencieux.
- **Correctif proposé** : accepter les deux orthographes (normaliser
  `remove_photo_ids → removePhotoIds`, `photo_order → photoOrder`) **ou** mettre
  à jour `docs/api.md` et le front. Ajouter un test d'intégration sur le
  snake_case.

### P1-3 — nginx ne sert jamais `/uploads/*` (404)

- **Preuves**
  - `server/nginx/nginx.conf:107` →
    `location ~* \.(png|jpg|jpeg|gif|ico|svg|…)$ { … }` (regex, sans proxy).
  - `server/nginx/nginx.conf:131` → `location /uploads/ { proxy_pass … }`
    **sans `^~`**. En nginx, une regex est évaluée avant un préfixe non-`^~` :
    c'est la regex qui gagne.
  - `server/src/app.ts:181-189` sert `/uploads` depuis
    `path.resolve(config.uploadDir, '..')` (= `/data/uploads`) — correct côté API.
  - `/usr/share/nginx/html/uploads` **n'existe pas** dans le conteneur nginx.
  - Observé : 20/20 `uploads/*.png` → `404` sur `:8080` ; 3/3 dans le pipeline.
- **Impact** : sur le stack Docker auto-hébergé (`:8080`/`:443`), **toutes les
  photos d'annonces sont cassées** dans le front (URL relative `/uploads/...`).
  En production Render, le front est un service statique avec
  `VITE_API_URL=https://revends-api.onrender.com` (`render.yaml:153-154`) et les
  `/uploads` sont préfixés vers l'API (qui les sert directement) : le bug ne s'y
  manifeste pas **tant que** `VITE_API_URL` est défini. Il s'agit donc d'un défaut
  de la topologie nginx locale/self-hosted.
- **Correctif proposé** : passer `location /uploads/` en `location ^~ /uploads/`
  (le `^~` empêche l'évaluation des regex), ou exclure `/uploads/` de la regex
  (`location ~* ^/(?!uploads/).*\.(png|…)$`). Vérifier ensuite 200 sur `:8080`.

### P1-4 — La suppression de fichier cible le mauvais répertoire

- **Preuves**
  - `products.service.ts:119-121` (`resolveUploadPath` → `process.cwd()`) vs
    `config.ts:240` (`uploadDir = /data/uploads/products`).
  - `products.service.ts:124` et `:473` : `unlink(...).catch(() => {})`.
  - `docker exec revends_api1 pwd` → `/app` ; `/data/uploads/products` contient
    les vrais fichiers ; `/app/uploads/products` ne contient que 33 fichiers
    morts du build.
  - Observé : après `removePhotoIds`, l'image disparaît de la BDD mais
    `FICHIER ENCORE PRESENT: /data/uploads/products/…jpg`.
  - 440 orphelins dans le volume.
- **Impact** : fuite disque illimitée, fichiers conservés indéfiniment, RGPD
  (données potentiellement personnelles dans les photos) non respecté.
- **Correctif proposé** : résoudre via `path.resolve(config.uploadDir, '..', publicPath)`
  ou stocker le chemin absolu/`basename` et rejoindre `config.uploadDir`.
  Remplacer `.catch(() => {})` par un log d'erreur (`logger.warn`) pour ne plus
  masquer les échecs. Puis purger les 440 orphelins après revue.

### P2-1 — Le soft-delete ne purge rien et les images supprimées restent publiques

- **Preuves**
  - `admin.service.ts:160` → `await softDeleteProduct(...)`, aucune purge.
  - `products.repository.ts:344-346` → `UPDATE products SET deleted_at = now()`.
  - Observé : `DELETE admin` → `204`, `GET` public → `404`, mais
    `GET /uploads/products/<image du produit supprimé>` → **`200`**.
- **Impact** : un article retiré (vente, modération, demande RGPD) reste
  partiellement exposé via son URL d'image si elle est connue.
- **Correctif proposé** : lors du soft-delete (vendeur et admin), supprimer les
  fichiers du disque (après correction P1-4) et/ou ajouter un contrôle
  d'autorisation sur `/uploads` (servir via une route qui vérifie
  `deleted_at IS NULL` / le statut). Documenter la politique de rétention.

### P2-2 — Recherche et comptage non indexés (Seq Scan non bornés)

- **Preuves** : §7 (Q2 `discover` 3,84 ms en Seq Scan + top-N ; Q3 `COUNT(*)` en
  Seq Scan ; Q4 `ILIKE` multi-colonnes 7,43 ms, `idx_products_name_trgm`
  `idx_scan = 0`). Code : `products.repository.ts:430`, `:433-439`, `:483`,
  `:500-506`, `:409-414`.
- **Impact** : dégradation linéaire ; à 10 000+ articles, pages lentes et charge
  CPU/IO.
- **Correctif proposé** :
  - `discover` : matérialiser un `discover_rank` (colonne ou vue matérialisée)
    et indexer, ou borner par un échantillon (`TABLESAMPLE`) ;
  - `COUNT(*)` : cache court (Redis) ou `EXPLAIN`-driven count estimé ;
  - recherche : index GIN trigram sur `name` **et** `brand`, et/ou une colonne
    `search_vector` (`tsvector`) avec `unaccent`, puis `websearch_to_tsquery`.

### P2-3 — Base `5433/revends` stale : migration 012 absente, 8 produits sans image

- **Preuves** : `schema_migrations` sans `012_password_reset.sql` ;
  `password_reset_tokens` absente (`to_regclass` → vide) ; 8 produits `AVAILABLE`
  sans image ; 4 sessions toutes expirées (20/10/2026).
- **Impact** : si une instance pointait par erreur sur cette base, « mot de passe
  oublié » échouerait (`relation "password_reset_tokens" does not exist`) et 8
  annonces s'afficheraient sans visuel. C'est aujourd'hui une dérive
  d'environnement (aucune instance ReVends active ne l'utilise).
- **Correctif proposé** : documenter/décommissionner la base stale, ou la migrer
  (012) et la re-seeder si elle doit rester. Ajouter un contrôle de démarrage qui
  vérifie que toutes les migrations du dossier sont appliquées.

### P3-1 — `schema_migrations` sans checksum + trou `011`

- **Preuves** : colonnes `filename`, `applied_at` seulement ; dossier sans `011`.
- **Impact** : une migration modifiée après coup n'est pas détectée ; le trou
  rend l'historique ambigu.
- **Correctif proposé** : ajouter `checksum` (SHA-256 du fichier) vérifié au boot ;
  renommer/justifier l'absence de `011`.

### P3-2 — Sessions expirées non purgées

- **Preuves** : `5433/revends` → 4 sessions, `expire` max = 20/10/2026 (7 jours
  avant l'audit), 4/4 expirées.
- **Impact** : croissance lente de `session` (négligeable aujourd'hui).
- **Correctif proposé** : tâche de purge périodique (`DELETE FROM session WHERE
  expire < now()`), ou vérifier la config `connect-pg-simple` (`pruneSessionInterval`).

### P3-3 — `is_primary ⇔ position = 1` non garanti par la base

- **Preuves** : §3.3 ; invariant maintenu uniquement par
  `normalizePrimaryImage` (`products.repository.ts:291-292`).
- **Impact** : une écriture hors service (script, admin SQL) peut désynchroniser
  l'image principale.
- **Correctif proposé** : ajouter un `CHECK ((is_primary) = (position = 1))` ou un
  trigger, après nettoyage des données existantes (elles sont cohérentes : 0
  anomalie A9/A9b).

### P3-4 — Artefacts de test embarqués dans l'image `revends_api1`

- **Preuves** : `/app/uploads/products` = 33 `.jpg` de 8 octets, 0 référencés.
- **Impact** : bruit, image plus lourde, confusion de diagnostic.
- **Correctif proposé** : exclure `uploads/` du contexte Docker
  (`.dockerignore`) et reconstruire l'image.

### P3-5 — Aucune borne BDD sur le nombre de photos (hors `position <= 4`)

- **Preuves** : §3.3 ; `MAX_PHOTOS` n'est appliqué que par multer
  (`upload.ts:10`, `errors.ts:144`) et `applyPhotoChanges` (`:449`).
- **Impact** : une insertion directe peut dépasser 4 photos.
- **Correctif proposé** : contrainte applicative suffisante, ou trigger de garde.

---

## 9. Tests exécutés

Commandes conformes à la procédure (serveur, base `revends_test` sur 5433,
`--test-concurrency=1 --test-force-exit`) :

| Fichier | Résultat | Traces |
| --- | --- | --- |
| `test/sell.test.ts` | **36 pass / 0 fail** | `test-sell.log` |
| `test/catalog.test.ts` | **19 pass / 0 fail** | `test-catalog.log` |
| `test/soft-delete.test.ts` | **19 pass / 0 fail** | `test-soft-delete.log` |
| `test/unit-repository-layer.test.ts` | **17 pass / 0 fail** | `test-unit-repo.log` |

**Total : 91/91 PASS.** `unit-repository-layer.test.ts` a été **rejoué pendant
cet audit** pour confirmer l'état courant :

```
# tests 17
# suites 6
# pass 17
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 695.052535
```

> Note : les tests font un `DROP SCHEMA public` sur `revends_test` (garde-fou
> `test/bootstrap.ts`), jamais sur `revends`. C'est pourquoi la base
> `revends_test` a été re-seedée (20 produits, 26 users) pendant l'audit.

Les 91 tests passent **malgré** les défauts P1 ci-dessus : ils ne couvrent ni le
cas 1-2 photos conforme au contrat, ni le snake_case, ni l'accessibilité des
uploads via nginx, ni la purge disque.

---

## 10. Couverture / non couvert

### Couvert

- Schéma complet, enums, contraintes, index, migrations (4 bases).
- Intégrité relationnelle A1→A13 sur 4 bases (lecture seule).
- Pipeline média complet sur `revends_e2e` (création, validation, approbation,
  mise à jour, soft-delete, suppression de photo).
- Fichiers ↔ BDD (volume partagé, orphelins, fichiers morts d'image).
- Plans d'exécution EXPLAIN (ANALYZE, BUFFERS) catalogue.
- 91 tests ciblés.

### Non couvert / limites

- **Production Render non testée** (pas d'accès réseau/DB) : la conclusion sur
  P1-3 est conditionnée à `VITE_API_URL` défini (cf. `render.yaml:153`).
- **Montée en charge réelle** non testée : les EXPLAIN portent sur 25 à 561
  lignes, pas sur des dizaines de milliers.
- **Concurrence** (deux `PUT` simultanés, double suppression admin) non testée.
- **Volume `revends_revends_uploads`** inspecté via `revends_api1` uniquement ;
  les 3 autres réplicas partagent le même volume mais n'ont pas été comparés
  fichier par fichier.
- **RGPD / rétention** non évalués au-delà de la présence de fichiers.

---

## 11. Artefacts de preuve

Répertoire `/tmp/opencode/media-audit/` :

| Fichier | Contenu |
| --- | --- |
| `integrity-dev-live.txt` | Intégrité `5440/revends` |
| `integrity-e2e.txt` | Intégrité `5440/revends_e2e` |
| `integrity.sql` | Requêtes A1→A13 |
| `explain-dev.txt` / `explain-e2e.txt` | Plans Q1→Q7 |
| `pipeline-run.out` / `pipeline2-run.out` | Traces du pipeline média |
| `vol2.txt` | 1132 fichiers du volume |
| `orphans2.txt` | 440 orphelins |
| `e2e.paths.txt`, `test.paths.txt`, `revends.paths.txt`, `stale.paths.txt` | Chemins par base |
| `test-*.log` | Sorties des 4 suites |
| `fixtures/` | JPEG/PNG de test |

Artefacts créés sur `revends_e2e` (laissés en place, soft-deleted) :
utilisateur **1055** (`audit-media+1793059507@example.com`) ; produits **676,
677, 678, 679** (tous `deleted_at` non nul, 3/3/4/3 images, 13 lignes
`product_images`, 13 fichiers `.jpg` + 1 fixture dans le volume).

---

## 12. Ordre de correction recommandé

1. **P1-1** `MIN_PHOTOS = 1` (débloque 408 annonces + la création 1-2 photos).
2. **P1-2** accepter/normaliser `remove_photo_ids`/`photo_order` (ou corriger le
   contrat) + test.
3. **P1-4** corriger `resolveUploadPath` + logger les échecs, puis purger les 440
   orphelins.
4. **P1-3** `location ^~ /uploads/` dans nginx + test HTTP 200 sur `:8080`.
5. **P2-1** purge/contrôle d'accès des images au soft-delete.
6. **P2-2** indexation `discover`/`count`/recherche.
7. **P2-3 / P3-*** hygiène (base stale, checksum migrations, purge sessions,
   contraintes, image Docker).
