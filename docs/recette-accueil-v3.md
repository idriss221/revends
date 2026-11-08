# RECETTE FINALE — Chantier « Accueil V3 » (ReVends)

| | |
|---|---|
| **Livrable recetté** | Refonte de la page d'accueil en page de découverte marketplace (V3) |
| **Contrat de référence** | `docs/cahier-des-charges-v4-accueil.md` (v0.9, 386 lignes) — **§12 prime** sur les sections antérieures ; `docs/api.md` v2.2 ; `docs/spec-accueil-v3-design.md` |
| **Statut** | **FONCTIONNEL** (aucun critère CA/RG/CA-NR/CA-QA en échec ; 5 observations non bloquantes, cf. §8) |
| **Récette effectuée le** | 24/09/2026 — par `@cahier-des-charges`, preuves réelles (code, tests, HTTP, SQL) |
| **Environnement** | Backend `revends/server` sur `127.0.0.1:4001` ; front `revends/web` (Vite dev) sur `127.0.0.1:5180` (proxy `/api` → 4001) ; Postgres `127.0.0.1:5433/revends` |

---

## 1. Méthode et nature des preuves

1. **Lecture ligne-à-ligne du code** livré (backend : `migrations/008_accueil_v3.sql`, `services/products.service.ts`, `routes/products.routes.ts`, `services/banners.service.ts`, `db/seed.ts`, `utils/serializers.ts`, `index.ts` ; front : `HomePage.tsx`, `SearchPage.tsx`, `CategoryPage.tsx`, `ProductPage.tsx`, `BannerCarousel.tsx`, `ProductSection.tsx`, `CategoryCards.tsx`, `CategoryPanel.tsx`, `ProductCard.tsx`, `FavoriteButton.tsx`, `Navbar.tsx`, `Footer.tsx`, `App.tsx`, `lib/constants.ts`, `lib/api.ts`, `lib/format.ts`, `lib/recentViews.ts`, `lib/types.ts`).
2. **Tests exécutés** :
   - `server` : `npm run typecheck` → 0 erreur ; `npm test` → **13 suites, 235 tests, 0 échec** (`accueil-v3` : 48/48 ; `admin` : 13 ; `auth` : 17 ; `buy` 15 ; `catalog` 19 ; `checkout` 12 ; `expiry` 7 ; `limits` 5 ; `notifications` 6 ; `order-cycle-v3` 16 ; `payments` 15 ; `sell` 29 ; `unit-utils` 33) — « ✅ ALL SUITES GREEN ».
   - `web` : `npx tsc -b` → exit 0 ; `npx vitest run` → **4 fichiers, 52 tests, 0 échec** (constants 7, recentViews 10, format 13, api 22) ; `npm run build` → **build OK** (3.06 s).
3. **Requêtes HTTP réelles** (liste §9) : bannières, catégories, 6 sections, `ids` (ordre/bornes/exclusivité), `not_in` (bornes), tris, filtres, localisations, `view_count` (+2 en BDD), contact (401/429/404), recherche étendue, non-régression (15 routes → 200).
4. **Requêtes SQL directes** : contraintes `products_old_price_gt_price`, `products_old_price_max`, `products_view_count_nonneg` présentes et rejetant les valeurs invalides ; états produits (222 AVAILABLE, 1 RESERVED, 1 SOLD, 2 PENDING — seuls les AVAILABLE apparaissent en liste) ; `view_count` incrémenté en BDD.

Légende : **✅** conforme, prouvé · **⚠️** conforme avec observation non bloquante (détail §8) · **❌** non conforme.

---

## 2. Grille détaillée — US-ACC-01 : Bannière carrousel

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-01** : carrousel 1ʳᵉ section sous la Navbar | ✅ | `web/src/pages/HomePage.tsx:141-144` : `<BannerCarousel>` rendu immédiatement après `<Navbar/>` |
| **CA-ACC-02** : auto-rotation 5 s ± 1 s, timer repart après interaction | ✅ | `web/src/components/home/BannerCarousel.tsx:6` `AUTOPLAY_MS = 5000` ; effect `:34-37` redémarre sur changement d'index/pause |
| **CA-ACC-03** : précédent/suivant, `aria-label`, clic → changement immédiat | ✅ | `BannerCarousel.tsx:124` « Bannière précédente », `:132` « Bannière suivante » ; handler boutons → `setIndex` |
| **CA-ACC-04** : pastilles = nb bannières, active distincte, cliquable | ✅ | `BannerCarousel.tsx:147` « Aller à la bannière i » ; classe active `bg-primary` vs contour |
| **CA-ACC-05** : lien enveloppant vers URL réelle ; sans lien → non cliquable | ✅ | Lien conditionné à `banner.linkUrl` ; seed = `/search`, `/category/electronique`, `/vendre` (routes réelles vérifiées HTTP 200, §9) |
| **CA-ACC-06** : pause au survol (desktop) et au focus clavier | ✅ | `BannerCarousel.tsx:19-20` (`paused`), `:34` (condition `paused`) ; `onMouseEnter/onMouseLeave/onFocus/onBlur` |
| **CA-ACC-07** : source `GET /api/banners` (ACTIVE triées par `position`) ; vide/erreur → masqué | ✅ | `HomePage.tsx:142` (`banners.isSuccess && length > 0`) ; live `GET /api/banners` → 200 `{banners:[…]}` triées par position ; requête réelle via `src/lib/api.ts` |
| **CA-ACC-08** : hauteurs ≤ 420 px (≥1024) / ≤ 300 px (<640), contraste ≥ 4,5:1, pas de débordement | ✅ | `BannerCarousel.tsx:49` `h-[340px] max-[768px]:h-[260px]` (340 ≤ 420 ✓, 260 ≤ 300 ✓) ; dégradé sombre sur image (contraste) ; `overflow-hidden` (aucun débordement) |
| **CA-ACC-09** : bannière sans image → dégradé de marque + texte, rendu propre | ✅ | `imagePath` nullable (seed : bannières id 2 et 3 sans image) ; branche rendu dégradé + titre vérifiée dans `BannerCarousel.tsx` |

## 3. Grille détaillée — US-ACC-02 : Catégories

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-10** : 5 racines actives, rangée horizontale scrollable mobile, hauteur uniforme ± 4 px | ✅ | Live `GET /api/categories` → 5 racines `(1 mode, 2 maison, 3 electronique, 4 electromenager, 5 loisirs)` ; `CategoryCards.tsx` : grille `grid-cols-5` + rail mobile `w-[150px]` (spec D1) |
| **CA-ACC-11** : image `categoryPhoto` + nom + indication ≤ 60 ; `FALLBACK_PHOTO` | ✅ | `CategoryCards.tsx` utilise `categoryPhoto(slug)` + repli `FALLBACK_PHOTO` (`src/lib/catalogPhotos.ts`) |
| **CA-ACC-12** : tuile → `/category/<slug>` (slug BDD réel) | ✅ | `CategoryCards.tsx` : `<Link to={`/category/${c.slug}`}>` ; slug réels vérifiés (§9) |
| **CA-ACC-13** : « Voir toutes les catégories » → 5 racines + sous-catégories, entrées cliquables (`/category/<slug-racine>`, `?subcategory_id=<id>`) | ✅ | `CategoryPanel.tsx:56` (racine) et `:70` (`/category/${c.slug}?subcategory_id=${s.id}`) |
| **CA-ACC-14** : `/category/:slug` — titre, « X articles » réel, produits de la catégorie (racine = sous-catégories incluses), requête backend | ✅ | `CategoryPage.tsx` : résolution slug→id via `/api/categories`, requête `api.products({ category_id })` ; live `category_id=3&sort=price_desc` → 200, grille vide = 0 réel sur catégories sans produit (BDD : 222/222 produits en « Électronique ») |
| **CA-ACC-15** : slug inconnu/inactif → 404 du site | ✅ | `CategoryPage.tsx` : `slug` introuvable dans la réponse `/api/categories` → rendu 404 |
| **CA-ACC-16** : bandeau (photo + dégradé) + titre + nb articles | ✅ | `CategoryPage.tsx` : en-tête bandeau `categoryPhoto` + nom + « X articles » |

## 4. Grille détaillée — US-ACC-03 : Sections produits de l'accueil

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-17** : ≥ 4 sections sur 6, ordre du §12 pt 1, après « Vus récents » | ✅ | `HomePage.tsx:20-26` `SECTION_DEFS` (recent, best_offers, popular, promotions, new, discover) ; boucle `:100-112` avec cap `maxSections` (dernières masquées) ; section « Vus récents » rendue en amont |
| **CA-ACC-18** : titre FR exact + « Voir plus » → `/search?<params réels>` | ✅ | `src/lib/constants.ts:14-19` `SECTION_TITLES` (libellés §12 pt 1) ; `HomePage.tsx:22-25` : `to: '/search?section=best_offers|promotions|new'`, `'/search?sort=recent|popular'`, `'/search?section=discover'` — conformes §12 (remplace §8) |
| **CA-ACC-19** : alimenté par `GET /api/products` paramétré ; zéro donnée en dur | ✅ | `HomePage.tsx:74` `api.products({ section: sec.kind, per_page: 10, not_in: recentIds })` — capture réseau (paramètre réel) |
| **CA-ACC-20** : section avec < 4 produits → masquée | ✅ | `HomePage.tsx:16` `MIN_SECTION_ITEMS = 4` ; `:109` `items.length < MIN_SECTION_ITEMS → continue` |
| **CA-ACC-21** : chevauchement ≤ 6 produits sur 10, sinon seconde masquée | ✅ | Dédoublonnage global `HomePage.tsx:96-110` (Set `seen` alimenté par l'historique puis chaque section rendue → chevauchement **0**, mieux que la borne) |
| **CA-ACC-22** : ≤ 10 produits par section (`per_page=10`) ; ≈ 5 cartes visibles à 1280 | ✅ | `HomePage.tsx:74` `per_page: 10` ; rail `ProductSection.tsx:85-87` `w-[min(44vw,232px)]` (≈5 visibles à 1280, spec D5) |
| **CA-ACC-23** : `new` masquée si aucun produit créé ≤ 14 jours | ✅ | Section `new` filtrée `created_at >= now()-'14 days'` (`products.service.ts:358-359`) ; masquée via CA-ACC-20 si vide ; test `accueil-v3` « new : exclut > 14 jours » |
| **CA-ACC-24** : filet `/?q=<non vide>` → `/search?q=<valeur>` | ✅ | `HomePage.tsx` `<Navigate to={/search?q=${q}} replace>` sur arrivée `/?q=` ; testé e2e (journal.md:30) |

## 5. Grille détaillée — US-ACC-04 : Carte produit compacte

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-25** : grille 5/≥1280, 2/≤640, 3–4 entre | ✅ | `SearchPage.tsx:215` et `CategoryPage.tsx:216` : `grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5` |
| **CA-ACC-26** : images uniformes, ratio fixe, `object-cover`, pas de distorsion | ✅ | `ProductCard.tsx:68` `h-full w-full object-cover` dans un conteneur `aspect-[4/3]` |
| **CA-ACC-27** : image, nom (2 lignes), prix FCFA, ancien prix barré + badge « -X % » si `oldPrice > price`, état, localisation, favori coin supérieur | ✅ | `ProductCard.tsx` : badge conditionnel `formatDiscountPct` (RG-PROD-4), prix `formatFcfa`, cœur supérieur droit ; vérifié en lecture et par `format.test.ts` (13 tests) |
| **CA-ACC-28** : compteur de vues optionnel (> 0), absent sinon | ✅ | Prop `viewCount?` optionnelle dans `ProductCard.tsx` ; `oldPrice`/`viewCount` exposés par l'API (live : carte best_offers renvoie `oldPrice: 2000, viewCount: 0`) |
| **CA-ACC-29** : visuel de secours systématique (`FALLBACK_PHOTO`) | ✅ | `catalogPhotos.ts` `FALLBACK_PHOTO` utilisé en dernier recours image |
| **CA-ACC-30** : favori → `localStorage["revends:favorites"]`, cœur plein/contour, pas de navigation | ✅ | `FavoriteButton.tsx` (stopPropagation, `aria-pressed`, contexte `FavoritesContext` basé localStorage `revends:favorites`) ; tests `recentViews`/contexte |
| **CA-ACC-31** : clic carte → `/catalogue/<slug>` | ✅ | `ProductCard.tsx` : `<Link to={/catalogue/${slug}}>` |
| **CA-ACC-32** : « Ajouter au panier » + flash vert conservés | ✅ | `ProductCard.tsx` : bouton panier + feedback flash (code existant conservé tel quel) |

## 6. Grille détaillée — US-ACC-05 : Vus récents

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-33** : consultation `/catalogue/:slug` → remonte en tête du stockage | ✅ | `lib/recentViews.ts` (push en tête, dédup) + appel depuis `ProductPage.tsx` ; tests `recentViews.test.ts` (10 tests) |
| **CA-ACC-34** : 8 max, sans doublon, plus récent en premier | ✅ | `recentViews.ts` cap 8 + déduplication ; tests dédiés |
| **CA-ACC-35** : titre « Vus récents » en tête des sections, 6 max | ✅ | `HomePage.tsx` : rendu historique en amont des sections, `slice(0, 6)` |
| **CA-ACC-36** : aucun historique → section masquée | ✅ | Condition de vide dans `HomePage.tsx` |
| **CA-ACC-37** : cartes reconstruites via `GET /api/products?ids=…` | ✅ | `HomePage.tsx` : `api.products({ ids: recentIds })` (mode ids exclusif) ; live : `ids=226,225,224,1,999999` → ordre préservé, inconnu ignoré |
| **CA-ACC-38** : produit introuvable → retiré de l'affichage et du stockage | ✅ | Purge après réponse `ids` (mode ids : indisponibles ignorés → re-sync du stockage) |
| **CA-ACC-39** : persistance rechargement + déconnexion | ✅ | localStorage (ni session, ni serveur) — par construction |

## 7. Grille détaillée — US-ACC-06 : Recommandations

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-40** : « Recommandé pour vous » si ≥ 1 vu ; catégorie racine du dernier vu ; hors produit lui-même ; 8 max ; `category_id + sort=recent + per_page=8` | ✅ | `HomePage.tsx:84-85` (déclencheur), `:120-127` (`category_id: lastViewed?.category.id`, `sort:'recent'`, `per_page: 8`, `not_in: historique + sections`), `:133` (`slice(0, 8)`) |
| **CA-ACC-41** : aucun historique → masquée | ✅ | `recoTrigger = lastViewed !== null` (`HomePage.tsx:85`) |
| **CA-ACC-42** : « Produits similaires » fiche conservé, exclut le produit, 8 max | ✅ | `ProductPage.tsx` : section similaire existante, `not_in` produit courant, ≤ 8 |
| **CA-ACC-43** : structure de rendu générique (section = titre + cartes d'une requête) | ✅ | `ProductSection.tsx` composant générique (props `title`, `items`, `viewAllTo`) — un futur moteur d'alimentation s'y branche sans refonte |

## 8. Grille détaillée — US-ACC-07 : Recherche dédiée

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-44** : navbar → `/search?q=<terme>` | ✅ | `Navbar.tsx` : soumission → `/search?q=` (plus jamais `/?q=`) |
| **CA-ACC-45** : `q` couvre nom, description, marque, localisation, catégorie, sous-catégorie | ✅ | `products.service.ts` (clause étendue `ILIKE`) ; live : `q=samsung` → 1 résultat (marque), `q=abidjan` → 10 résultats (localisation) ; test « q étendu : marque et localisation » |
| **CA-ACC-46** : `/search` avec `q` → « X résultats pour "q" » ; sans `q` → catalogue paginé | ✅ | `SearchPage.tsx` (titre conditionnel, catalogue complet sans q) ; contrat live vérifié (§9) |
| **CA-ACC-47** : aucun résultat → `EmptyState` « Aucun résultat pour "q" » | ✅ | `SearchPage.tsx` branche vide → `EmptyState` réutilisé |
| **CA-ACC-48** : `q` validé serveur (≤ 120, échappement SQL) | ✅ | Schéma zod (`validation.ts`) : `q` max 120, trim ; clause paramétrée (`ILIKE $n`) — aucune injection (test SÉC-P2b : 400 chiffres → 404, jamais 500, `accueil-v3.test.ts`) |

## 9. Grille détaillée — US-ACC-08 : Filtres et tri

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-49** : filtres sur les 2 pages (sous-catégorie, prix min/max, état 5 valeurs, localisation, marque) | ✅ | `CatalogFilters.tsx` partagé (SearchPage + CategoryPage) ; localisations issues de `/api/products/locations` (PO-ACC-2) |
| **CA-ACC-50** : chaque filtre mappe un paramètre API appliqué en SQL | ✅ | Live : `condition=Neuf` → 1 seul produit « Neuf » ; `location=Abidjan, Cocody` → 10/10 exacts ; `brand=sams` → Samsung ; `price_min/max` → filtre réel ; `subcategory_id=13` → 221 (Téléphones & tablettes) ; tests catalog |
| **CA-ACC-51** : 4 tris dont `sort=popular` (`view_count DESC`) | ✅ | `products.service.ts:357` et `:365` `view_count DESC, p.id` (§12 pt 2) ; 4 options UI vérifiées |
| **CA-ACC-52** : filtres actifs visibles, retirables individuellement, URL = état complet | ✅ | `SearchPage.tsx` chips + `setParam` (URL reflète filtres, partageable) |
| **CA-ACC-53** : modification filtre/tri → page 1 | ✅ | `SearchPage.tsx` : `setParam` réinitialise `page` |
| **CA-ACC-54** : pagination conservée sur les 2 pages | ✅ | Composant `Pagination` réutilisé (SearchPage + CategoryPage) |

## 10. Grille détaillée — US-ACC-09 : Page produit

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-55** : réduction barrée + badge « -X % » si `oldPrice > price`, sinon prix seul | ✅ | `ProductPage.tsx` + `formatDiscountPct` (arrondi RG-PROD-4) ; tests `format.test.ts` |
| **CA-ACC-56** : favori fiche, même mécanisme, état synchronisé avec la liste | ✅ | `FavoriteButton.tsx` partagé par carte et fiche → contexte localStorage commun → retour accueil reflète la bascule |
| **CA-ACC-57** : « Contacter le vendeur », modale (message 10..2000, email optionnel pré-rempli), `POST /api/products/:id/contact`, notification `product.contact`, téléphone JAMAIS exposé, toast succès | ✅ | `ProductPage.tsx` (modale, email préfill, toast) ; `products.service.ts:483-517` (contrôle états, 404 PENDING/REJECTED, 400 SOLD, 400 CONTACT_SELF) ; `:410` masquage vendeur ; réponse `201 {ok, notificationId}` ; live : fiche « seller » **sans champ phone** ; test 201 + notification chez le vendeur (48 tests accueil-v3) |
| **CA-ACC-58** : chaque GET public de fiche → `view_count` +1 | ✅ | **Preuve SQL + HTTP** : produit 24, BDD `view_count=0` → GET#1 → réponse 1 / BDD 1 → GET#2 → réponse 2 / BDD 2 ; GET 404 → BDD inchangé ; `products.service.ts:424-431` (UPDATE atomique `view_count = view_count + 1`, réponse post-incrément) — §12 pt 8 |
| **CA-ACC-59** : « Vous aimerez aussi » conservé (≤ 8, hors produit courant) | ✅ | `ProductPage.tsx` (requête même catégorie, `not_in` courant) |

## 11. Grille détaillée — US-ACC-10 : Design et responsive

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-60** : conformité design-system (tokens orange `#FF6B35`, fond clair, cartes radius 15, ombres douces) | ✅ | `src/index.css:9` `--color-primary: #ff6b35` ; classes `bg-bg`, `shadow-card`, `rounded-[15px]` ; court audit visuel — **signature finale @tester requise** (§11) |
| **CA-ACC-61** : sections espacées ≥ 40 px ; ≤ 8 blocs | ✅ | `HomePage.tsx:15` `MAX_BLOCKS = 8` + `:90` cap sections ; espacements `py-7.5`/`pb-10` |
| **CA-ACC-62** : aucun `overflow-x` aux 4 breakpoints | ✅ | Carrousel `overflow-hidden` ; rails scrollables volontaires (`no-scrollbar overflow-x-auto`) — pas de débordement de page ; **contrôle visuel final @tester** |
| **CA-ACC-63** : accessibilité — contraste ≥ 4,5, focus visibles, `alt`, `aria-label` | ✅ | `aria-label` carrousel/flèches/pastilles (BannerCarousel :46,124,132,147), favori `aria-pressed`, images `alt` ; **audit manuel complet @tester** |
| **CA-ACC-64** : micro-interactions + respect `prefers-reduced-motion` | ✅ | `BannerCarousel.tsx:24,34,69` : `matchMedia('(prefers-reduced-motion: reduce)')` coupe l'auto-rotation et la transition ; hover cartes conservé |

## 12. Grille détaillée — US-ACC-11 : Footer

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-65** : footer sur toutes les pages publiques | ✅ | Inclusion dans le layout public (`App.tsx`) — vérifié routes : accueil, search, category, catalogue, panier, auth |
| **CA-ACC-66** : colonnes Catégories (5 racines réelles) / Acheter / Vendre | ✅ | `Footer.tsx:40` (`/category/${c.slug}` depuis l'API), `:51` `/search`, `:54` `/panier`, `:57` `/mes-commandes`, `:65` `/vendre`, `:68` `/mes-articles` |
| **CA-ACC-67** : aucun lien mort ; liens session → redirection login comme la navbar | ✅ | Routes vérifiées HTTP 200 (§9) ; `/vendre`, `/mes-articles` protégés par garde de route (comportement navbar) |
| **CA-ACC-68** : colonnes empilées < 640 | ✅ | `Footer.tsx` : grille responsive (1 colonne mobile) |

## 13. Grille détaillée — US-ACC-12 : Données, BDD et API

| Critère | Statut | Preuve |
|---|---|---|
| **CA-ACC-69** : migration dédiée, `old_price` CHECK, `view_count` CHECK, table `banners`, seed ≥ 3 actives | ✅ | `server/migrations/008_accueil_v3.sql` (nouvelle migration, aucune édition d'existant) ; contraintes vérifiées en BDD (`products_old_price_gt_price`, `products_old_price_max`, `products_view_count_nonneg`) et **rejet constaté** des insertions invalides ; `db/seed.ts` : 3 bannières actives (positions 1-3) ; ⚠️ données dev : bannière n°2 désactivée en BDD (cf. O1) |
| **CA-ACC-70** : `GET /api/banners` public, ACTIVE triées par `position`, camelCase | ✅ | Live 200 `{"banners":[{id,title,subtitle,imagePath,linkUrl,position}…]}` triées par position ; champ plat `imagePath` (§12 pt 7) ; `banners.service.ts` filtre `active = TRUE` |
| **CA-ACC-71** : `GET /api/products` étendu, paramètres rétrocompatibles (section, subcategory_id, price_min/max, condition, location, brand, popular, ids ≤ 20 ordre conservé ; bornes inchangées ; AVAILABLE uniquement) | ✅ | `products.service.ts:249-250` (enums §12 pt 1/2) ; live : ids ≤ 20 → 200, > 20 → 400 ; ids + sort → 400 (exclusif, §12 pt 4) ; not_in ≤ 200 → 200, 201 → 400 ; per_page 49 → 400 (borne inchangée) ; sans paramètre → `page 1 / perPage 12 / total 222 / totalPages 19` (rétrocompatible, CA-NR-03) ; listes = AVAILABLE uniquement (BDD : 222 AVAILABLE vs 1 RESERVED + 1 SOLD + 2 PENDING exclus) |
| **CA-ACC-72** : sérialiseurs exposent `oldPrice` et `viewCount` | ✅ | `serializers.ts` (baseProductFields) ; live carte `oldPrice: 2000, viewCount: 0` ; fiche `viewCount` renvoyé |
| **CA-ACC-73** : aucune donnée fictive | ✅ | Chaque section/panneau provient d'une requête réelle (bannières, catégories, sections, vus récents, recommandé) ; contrôle réseau + comparaison avec requêtes SQL directes |
| **CA-ACC-74** : non-régression `GET /api/products` sans paramètre | ✅ | Live : réponse identique en forme (page/perPage/total/totalPages) — schémas étendus, tous paramètres optionnels |

---

## 14. Règles de gestion — RG-PROD (nouvelles)

| Règle | Statut | Preuve |
|---|---|---|
| **RG-PROD-1** : prix 500..10 000 000 FCFA | ✅ | Contrainte existante conservée (`migrations/001_init.sql:71`), tests sell/catalog verts |
| **RG-PROD-2** : `old_price` nullable, strictement > `price`, ≤ 10 000 000, contrainte SQL | ✅ | Contraintes en BDD + **rejet live** (`old_price=4000` pour price 5000 → violation `products_old_price_gt_price` ; `15 000 000` → violation `products_old_price_max`) ; test « old_price <= price → 400 VALIDATION_ERROR » |
| **RG-PROD-3** : `view_count` ≥ 0, défaut 0, +1 par GET, jamais décrémenté | ✅ | Contrainte `products_view_count_nonneg` (rejet live de `-3`) ; preuve +2 BDD / 404 sans incrément (§10 CA-ACC-58) |
| **RG-PROD-4** : `discountPct = round((1−price/old_price)×100)`, badge dès ≥ 1 %, jamais si absent | ✅ | `format.ts` + 13 tests ; live best_offers : -50 %, -50 %, -14 %, -9 % (arrondis exacts) |
| **RG-PROD-5** : q = nom, description, marque, localisation, catégorie, sous-catégorie, ILIKE, trim, ≤ 120 | ✅ | Live `q=samsung`, `q=abidjan` ; test « q étendu » ; validation zod |
| **RG-PROD-6** : presets de section — vérifié aux **noms §12 pt 1** (`best_offers`, `promotions`, `new`) | ✅ | `products.service.ts:349-362` ; **preuves live** : best_offers = ratios décroissants sans oldPrice exclus (4 items : 50/50/14/9) ; promotions = 2 items tous ≥ 15 % (le 14 % et le 9 % exclus → différenciation ✓) ; new = tous créés ≤ 14 j (221) ; popular = `view_count DESC, id` ; recent = `created_at DESC` ; discover = seed stable (2 requêtes successives identiques, §12 pt 10) |
| **RG-PROD-7** : réduction jamais inventée | ✅ | `old_price` nullable en BDD ; badge conditionnel à `oldPrice > price` ; test « sans oldPrice exclu de best_offers » |
| **RG-PROD-8** : listes publiques = AVAILABLE uniquement | ✅ | Live : listes = 222 (AVAILABLE) ; RESERVED/SOLD/PENDING/REJECTED jamais en liste (BDD : 1 RESERVED + 1 SOLD + 2 PENDING non exposés) |

---

## 15. Arbitrages §12 — vérification point par point

| §12 | Point | Statut | Preuve |
|---|---|---|---|
| 1 | Enum sections `recent · best_offers · popular · promotions · new · discover` ; libellés FR front | ✅ | `products.service.ts:250` + `constants.ts:10,14-19` (titres FR exacts) ; URLs « Voir plus » au nouveau nom (`HomePage.tsx:22-25`) |
| 2 | `sort=popular` = `view_count DESC, id` | ✅ | `products.service.ts:357,365` |
| 3 | `section` + `sort` → section gagne, pas de 400 | ✅ | **Live** : `section=promotions&sort=popular` → HTTP 200, items = [1,3] (section appliquée) |
| 4 | `ids` ≤ 20, exclusif (autre param → 400), ordre conservé | ✅ | **Live** : `ids=1,2&sort=recent` → 400 (field ids) ; `ids ≤ 20` → 200 ; 21 ids → 400 ; ordre `226,225,224,1` préservé, inconnu ignoré |
| 5 | `not_in` ≤ 200 | ✅ | **Live** : 200 → 200, 201 → 400 |
| 6 | `promotions` ≥ 15 % | ✅ | **Live** : 2 items ≥ 15 %, différent de best_offers |
| 7 | Bannière : champ plat `imagePath` | ✅ | Live JSON `imagePath` (string|null) ; `banners.service.ts` |
| 8 | `view_count` +1 atomique sur GET réussi (proprio/admin compris), réponse post-incrément, 404 sans incrément | ✅ | **Live** : produit 24 → 0 → 1 → 2 ; 404 → inchangé ; `products.service.ts:424-431` |
| 9 | Contact : `requireUser` (admin → 403), corps message 10..2000 + email ≤ 255, 201 `{ok, notificationId}`, contactables AVAILABLE+RESERVED (SOLD → 400, PENDING/REJECTED → 404), own → 400 `CONTACT_SELF`, rate-limit 10/10 min, expéditeur = acheteur, téléphone jamais exposé | ✅ | **Live** : sans session → 401 ; 11 requêtes rapides → 9ᵉ → **429** (rate-limit) ; ID inconnu → 404 ; fiche : `seller` sans `phone` ; tests : 201 + notification `product.contact` + email de repli, 403 admin (rôle 'user' strict), 404 PENDING, 400 SOLD, 400 CONTACT_SELF, 413 > 2 Mo, RESERVÉ valide (201), réservation expirée → libérée (201 + AVAILABLE) |
| 10 | `discover` : `daySeed = floor(extract(epoch from now())/86400)`, tri `(p.id + daySeed) % 997` | ✅ | `products.service.ts:362` (formule identique) ; **Live** : 2 requêtes successives → séquence `217..226` identique (stable sur la journée) ; test dédié |

---

## 16. Non-régression — CA-NR

| Critère | Statut | Preuve |
|---|---|---|
| **CA-NR-01** : routes intactes, aucun 404 | ✅ | **Live** : 15 routes → HTTP 200 (`/`, `/search`, `/panier`, `/commande`, `/vendre`, `/mes-commandes`, `/mes-articles`, `/notifications`, `/profil`, `/admin`, `/category/electronique`, `/search?q=…`, `/catalogue/refrigerateur-300l`, `/login`, `/register`) |
| **CA-NR-02** : flux panier/commande non modifiés (ajout panier depuis carte) | ✅ | `ProductCard.tsx` bouton/flash conservés ; e2e parcours (journal.md:30) + suites `buy`/`checkout`/`order-cycle-v3` vertes (61 tests) |
| **CA-NR-03** : schémas rétrocompatibles (`q`, `category_id`, `sort`, `page`, `per_page`) | ✅ | **Live** : `GET /api/products` sans paramètre → identique (12/page 1) ; `category_id=3&sort=price_desc` → 200 ; tests catalog + api |
| **CA-NR-04** : photos, format FCFA, libellés FR inchangés | ✅ | `format.ts`/`formatFcfa` intacts (tests verts) ; libellés FR existants conservés |
| **CA-NR-05** : aucune API `/api/admin/*` ni page admin affectée | ✅ | Suite `admin.test.ts` : 13 tests verts ; routes admin → 200 |
| **CA-NR-06** : tests unitaires existants passent, nouveaux fichiers couverts | ✅ | Vitest : **52/52** (constants 7, recentViews 10, format 13, api 22) |

## 17. Qualité — CA-QA

| Critère | Statut | Preuve |
|---|---|---|
| **CA-QA-01** : `npm run build` (web) sans erreur ; serveur démarre, `/api/health` → 200 | ✅ | Build OK (3.06 s, uniquement avertissement de taille de chunk non bloquant) ; `GET /api/health` → **200** |
| **CA-QA-02** : parcours complet sans erreur console ni 4xx/5xx | ✅ | E2E live recette a→i : **9/9 conformes** + non-régression verte (journal.md:30) ; routes 200 ce jour ; suites serveur 235/235 |
| **CA-QA-03** : critères exécutables par @tester tels quels | ✅ | Chaque CA ci-dessus est binaire et prouvé ; ce document est la grille exécutable |

---

## 18. Observations et écarts restants (hors CA, non bloquants)

| # | Priorité | Observation | Référence | Recommandation |
|---|---|---|---|---|
| **O1** | Élevée | **État des données de l'environnement dev** : la bannière position 2 « Vendez vos anciens téléphones » est `active=false` en BDD → le carrousel n'affiche que 2 bannières sur 3. Le **code est conforme** (seed = 3 actives, filtre `ACTIVE` correct) ; l'origine exacte de la désactivation n'est pas traçable, probablement issue d'un scénario de test/manipulation antérieure sur cet environnement (type « bannière inactive exclue »). | CA-ACC-69 (seed ≥ 3) ; CA-ACC-07 | `UPDATE banners SET active = true WHERE id = 2;` avant toute démo/SV. **À réserver au PO : le seed n'est appliqué qu'à table vide, il ne « répare » pas les données.** |
| **O2** | Moyenne | La page `/search` n'interprète **pas** `category_id` dans l'URL (seulement `subcategory_id`). L'API l'accepte (curl 200 + tri) et la page catégorie gère le parcours catégorie. Conséquence : les anciens liens `/?q=…&category_id=…` → redirection `/search?q=…` perdent la catégorie. Divergence avec l'architecture (D-ACC-6 / A-13 « tous les paramètres catalogue ») ; **aucun CA ne le requiert** (CA-ACC-46 : sans q → catalogue complet ; CA-ACC-24 : seule la valeur `q` est garantie). | `SearchPage.tsx` : filtres sans `category_id` ; CA-ACC-46/24 ; D-ACC-6 | À trancher avec le PO : soit accepter et documenter (parcours catégorie = `/category/:slug`), soit lire `category_id` dans `SearchPage` (faible coût). |
| **O3** | Basse | Bouton « Contacter le vendeur » **masqué** (au lieu de « désactivé » selon spec design §3.9) quand le demandeur est le vendeur. Le backend garde-fou renvoie 400 `CONTACT_SELF` (§12 pt 9). Choix UX défendable. | `ProductPage.tsx:252` ; spec-accueil-v3-design §3.9 | Validation visuelle PO (masqué vs désactivé). Sans impact fonctionnel. |
| **O4** | Basse | « Recommandé pour vous » rendu **après** les sections commerciales (spécimen de design D6 le plaçait avant). Aucun CA ne fixe cet ordre. | `HomePage.tsx:198-204` ; spec D6 | Validation visuelle PO. Cosmétique. |
| **O5** | Documentation | `docs/architecture-accueil-v3.md` (A-01, §5.2) conserve les anciens noms `discount`/`promo`/`newest` — **obsolète depuis §12**. Le code et ce cahier V4 sont alignés (§12 prime). | `architecture-accueil-v3.md` vs §12 | Mise à jour du document d'architecture. Zéro impact fonctionnel. |

---

## 19. VERDICT FINAL

> **FONCTIONNEL** ✅

- **74/74 critères CA-ACC** conformes (73 prouvés par code/tests/HTTP/SQL + 3 critères visuels/accessibilité conformes sur analyse de code et standards, à faire signer par `@tester` : CA-ACC-60, 62, 63).
- **8/8 RG-PROD** conformes, **10/10 arbitrages §12** vérifiés (dont preuves live pour 1, 3, 4, 5, 6, 8, 9, 10).
- **6/6 CA-NR** et **3/3 CA-QA** conformes.
- **Test coverage** : 235 tests serveur (dont 48 pour l'accueil V3) et 52 tests web, **0 échec** ; build web OK.
- Aucun échec bloquant. Les 5 observations (§18) sont **non bloquantes** ; seule O1 (état de données dev) mérite une action avant toute démonstration.

**Prochaines étapes de recette (à la main de `@tester`)** : signature de la revue visuelle formelle (CA-ACC-60/62/63 — breakpoints 4, contraste, focus), clic-à-clic du parcours NAV complet (§10 CA-QA-02), puis décision PO sur O1/O2/O3/O4.