# CAHIER DES CHARGES V4 — « Accueil V3 » : refonte de la page d'accueil en page de découverte marketplace

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente d'articles d'occasion (Côte d'Ivoire) |
| **Version document** | 0.9 (à valider par le chef de projet — sections 9 et 10 ouvertes) |
| **Statut** | Ébauche contrat de recette |
| **Cible** | Web (React + Vite `revends/web`) — responsive mobile-first ; API Node + Express + Postgres `revends/server` |
| **Références** | `docs/cahier-des-charges.md`, `docs/cahier-des-charges-v2.md`, `docs/cahier-des-charges-v3.md`, `docs/api.md`, `docs/design-system.md` |
| **Code de l'existant cité** | `web/src/pages/HomePage.tsx`, `web/src/components/layout/Navbar.tsx`, `web/src/components/catalog/ProductCard.tsx`, `web/src/components/catalog/CategoryCards.tsx`, `web/src/lib/api.ts`, `web/src/lib/types.ts`, `server/src/services/products.service.ts`, `server/src/utils/validation.ts`, `server/src/utils/serializers.ts`, `server/migrations/001_init.sql` |

---

## 1. Contexte et objectifs

Aujourd'hui l'accueil (`HomePage.tsx:25`) **est** le catalogue : hero + tuiles catégories + grille produits + pagination. La recherche de la navbar redirige vers `/?q=` (`Navbar.tsx:30`) et tout l'état de navigation (recherche, catégorie, tri, page) vit dans l'URL de la home. Il n'y a ni bannière, ni carrousel, ni sections thématiques, ni « vus récemment », ni favoris, ni footer.

La demande utilisateur est une **refonte complète** de l'accueil en « vraie page de découverte marketplace » (structure calquée sur les marketplaces de référence type Jumia : header → carrousel → catégories → sections produits → vus récemment → footer).

### Objectifs mesurables

1. Transformer l'accueil en vitrine de découverte (carrousel, catégories, 6 sections thématiques, vus récemment, recommandations).
2. Déléguer la recherche et la navigation par catégorie à des **pages dédiées** (`/search?q=…`, `/category/:slug`), pour que l'accueil n'agrège plus tout.
3. Enrichir la donnée produit (ancien prix, compteur de vues, bannières) et l'exposer via l'API réelle — **jamais de données fictives**.
4. Ne rien casser : réutiliser Navbar, ProductCard, Pagination, EmptyState, formatFcfa, categoryPhoto, services et routes existants.

### Cibles

| Persona | Description | Besoins couverts |
|---|---|---|
| **Acheteur visiteur** (non connecté) | Explore, cherche, feuillette avant de décider de se connecter | Découverte (carrousel, catégories, sections), recherche dédiée, vus récemment, favoris locaux, cœur de parcours jusqu'au panier |
| **Acheteur connecté** | Retrouve ses flux (commandes, notifications, panier) via la navbar, découvre en plus | Tout l'accueil + accès « Mes commandes », panier, profil, notifications depuis la navbar (inchangé) |

---

## 2. Périmètre

### 2.1 Dans le périmètre (V4)

- Accueil = **page de découverte** : carrousel de bannières, tuiles catégories, section « Vus récemment », 6 sections produits thématiques, recommandations simples, footer.
- Page **catégorie dédiée** `/category/:slug` (requête backend réelle, filtres + tri + pagination).
- Page **recherche dédiée** `/search?q=…` (recherche étendue : nom, description, marque, localisation, catégorie/sous-catégorie ; filtres + tri + pagination).
- **Carte produit compacte** : grande image uniforme, prix, ancien prix + % de réduction, état, localisation, bouton favori, compteur de vues optionnel, visuel de secours.
- **Vus récents** réels (localStorage, max 8, dédupliqués) et **favoris** persistants (localStorage).
- **Recommandations** simples : « Recommandé pour vous » (catégorie du dernier produit vu), « Produits similaires » (fiche produit — existant conservé).
- **Enrichissement BDD + API** : `old_price`, `view_count`, table `banners` + seed, `GET /api/banners`, paramètres de filtre/tri/section/`ids` sur `GET /api/products`, `sort=popular`, incrément de `view_count`.
- **Extension fiche produit** : ancien prix + badge, bouton favori, bouton « Contacter le vendeur » (voir Point ouvert PO-ACC-1).
- **Footer** posé sur toutes les pages publiques.

### 2.2 Hors périmètre (V4)

| Sujet | Raison / structure |
|---|---|
| CRUD admin des bannières (création, édition, désactivation via l'UI admin) | Seule la **structure** est prête (table + seed + endpoint public) |
| Favoris **serveur par compte** (persistance liée au comptes) | Stockage localStorage uniquement ; structure DB non créée, contrat d'API pensé |
| Page « Mes favoris » dédiée | Le champ est local ; hors périmètre V4 |
| Moteur de recommandations avancé (ML, basé panier/achats/recherches cumulées) | Seule l'implémentation simple par catégorie d'historique est requise ; la **structure de rendu** doit être extensible |
| Avis clients / notes par produit | Aucune table dédiée ; hors périmètre |
| Messagerie interne acheteur↔vendeur | Aucun modèle ; voir PO-ACC-1 pour « Contacter le vendeur » |
| Application mobile native (Expo/React Native) | Hors périmètre V4 (web responsive uniquement) |

---

## 3. Décisions d'architecture déjà arbitrées (D-ACC)

Ces décisions sont **imposées** par le chef de projet et à documenter telles quelles dans le code.

- **D-ACC-1 — Bannières** : nouvelle table `banners` (structure prête pour l'admin futur), seed de bannières par défaut, endpoint public `GET /api/banners`. CRUD admin **hors périmètre** (section 2.2).
- **D-ACC-2 — Réductions** : colonne `products.old_price` (nullable, strictement > `price`) pour afficher barré + % de réduction.
- **D-ACC-3 — Popularité** : colonne `products.view_count` (INTEGER, défaut 0), incrémentée à chaque consultation publique d'une fiche produit ; utilisé pour le tri « Plus populaires » et la section « Produits populaires ».
- **D-ACC-4 — Vus récents & favoris** : stockage **localStorage côté client** (visiteurs et connectés). Vus récents max 8, sans doublons. Favoris persistants. Récupération des cartes **en passant par le backend** (`GET /api/products?ids=…`) pour toujours afficher des données fraîches et réelles.
- **D-ACC-5 — Sections accueil** : le backend est étendu (paramètre `section` dédié + tri `popular` + filtres) pour alimenter les sections ; les **libellés FR restent côté front** (le front compose les sections et leurs titres). Aucune liste de produits codée en dur.
- **D-ACC-6 — Recherche** : la barre de la navbar cible désormais `/search?q=…` (page dédiée). L'accueil pur = sections ; **filet de sécurité** : une arrivée sur `/?q=<non vide>` redirige vers `/search?q=<valeur>`. La page `/search` accepte tous les paramètres catalogue → elle **reprend le rôle d'accueil-catalogue** d'origine.
- **D-ACC-7 — Pages catégories** : route `/category/:slug` ; résolution `slug → id` via `GET /api/categories`, puis requête **réelle** `GET /api/products?category_id=…`. Racine inclut ses sous-catégories (comportement backend existant, `products.service.ts:252`).
- **D-ACC-8 — Footer** : nouveau composant réutilisable posé sur les pages publiques (route publique unique ou inclusion par page).

---

## 4. Existant — ce qu'on réutilise, ce qu'on fait évoluer

| Élément actuel | Fichier | Usage V4 |
|---|---|---|
| Navbar (logo, recherche, notifications, panier, commandes, compte) | `web/src/components/layout/Navbar.tsx` | **Conservée telle quelle, 1 seul changement** : cible de recherche → `/search?q=` |
| HomePage (hero + catégories + grille + pagination) | `web/src/pages/HomePage.tsx` | **Réécrite** : carrousel + catégories-cliquables + vus récents + sections + footer (le rôle catalogue part vers `/search`) |
| ProductCard (photo 200px, nom, prix, localisation, état, bouton panier) | `web/src/components/catalog/ProductCard.tsx` | **Évoluée (compacte)** : bouton favori, ancien prix/badge, compteur de vues, image uniforme, grille 5/2 |
| CategoryCards (grille + filtre inline `onSelect`) | `web/src/components/catalog/CategoryCards.tsx` | **Évoluée** : tuiles horizontales **cliquables vers `/category/:slug`**, bouton « Voir toutes les catégories » |
| ProductPage (« Vous aimerez aussi » même catégorie) | `web/src/pages/ProductPage.tsx` | **Conservée + étendue** : ancien prix, favori, « Contacter le vendeur », vues |
| Pagination, EmptyState, ErrorMessage, Skeleton | `web/src/components/ui/*` | Réutilisés tels quels |
| `formatFcfa`, `categoryPhoto`, `resolveImageUrl`, `FALLBACK_PHOTO` | `web/src/lib/format.ts`, `web/src/lib/catalogPhotos.ts` | Réutilisés tels quels |
| `api.products()`, `api.categories()` | `web/src/lib/api.ts:133-151` | Étendus (nouveaux paramètres) |
| `ProductCardItem`, `ProductDetail` | `web/src/lib/types.ts:89-114` | Étendus (`oldPrice`, `viewCount`) |
| `getCatalog` + `catalogQuerySchema` | `server/src/services/products.service.ts:238`, `server/src/utils/validation.ts:230` | Étendus (section, filtres, tri popular, `ids`) |
| `serializeProductCard` / `serializeProductDetail` | `server/src/utils/serializers.ts:224/191` | Étendus (`oldPrice`, `viewCount`) |
| Schéma produits + catégories | `server/migrations/001_init.sql:63-93` | Évolué par une **nouvelle migration** (jamais d'édition des migrations existantes) |

**Règle d'or « ne rien casser » (CA-NR, §9) : aucune route, aucun contrat de réponse existant, aucun composant partagé n'est supprimé ou renommé sans compatibilité.**

---

## 5. User stories et critères d'acceptation

Convention : chaque user story porte le préfixe **US-ACC-xx** ; chaque critère d'acceptation est **binaire, chiffré et testable par `@tester`**, préfixe **CA-ACC-xx**.

---

### 5.1 Bannière carrousel

**US-ACC-01** — *En tant qu'acheteur, je veux un grand carrousel de bannières en tête d'accueil, afin d'être orienté vers les promotions, offres, nouveautés et événements.*

- **CA-ACC-01** Le carrousel est la **première section visible sous la Navbar** (aucun contenu au-dessus).
- **CA-ACC-02** **Auto-rotation** : chaque bannière reste affichée **5 s (± 1 s)** puis laisse place à la suivante ; la transition est fluide (fondu ou glissement) ; le timer repart après toute interaction de l'utilisateur.
- **CA-ACC-03** Boutons **précédent/suivant** visibles et accessibles au clavier (`aria-label` « Bannière précédente » / « Bannière suivante ») ; un clic change immédiatement de bannière et réinitialise le timer.
- **CA-ACC-04** **Indicateurs** : nombre de pastilles = nombre de bannières ; la pastille active est distincte visuellement et cliquable (saut direct).
- **CA-ACC-05** La bannière active est **cliquable** : lien enveloppant vers une URL **réelle du site** (route existante, ex. `/search?q=…`, `/category/…`) ; une bannière sans lien est affichée non cliquable.
- **CA-ACC-06** L'auto-rotation **pause au survol** (desktop) et **au focus clavier** dans le carrousel.
- **CA-ACC-07** **Source réelle** : contenu chargé via `GET /api/banners` (bannières ACTIVE triées par `position`). Liste vide ou erreur réseau → **section masquée** (ni zone vide, ni blocage navigateur).
- **CA-ACC-08** **Responsive** : hauteur ≤ 420 px au-delà de 1024 px, ≤ 300 px en dessous de 640 px ; texte lisible sur image (contraste ≥ 4,5:1) ; aucun débordement horizontal.
- **CA-ACC-09** Le carrousel accepte des bannières **sans image** (dégradé de marque + texte) : le rendu est propre et professionnel (la donnée `image` est nullable).

---

### 5.2 Catégories — tuiles et page dédiée

**US-ACC-02** — *En tant qu'acheteur, je veux parcourir les catégories visuellement et ouvrir une page entièrement dédiée à chacune d'elles.*

- **CA-ACC-10** Les **5 catégories racines actives** (`GET /api/categories`) sont affichées dans une **rangée horizontale** (scrollable sur mobile) ; hauteur de tuiles uniforme à ± 4 px.
- **CA-ACC-11** Chaque tuile : **image réelle** de la catégorie (`categoryPhoto`) + nom + indication courte optionnelle (≤ 60 caractères) ; jamais d'image cassée (repli `FALLBACK_PHOTO`).
- **CA-ACC-12** Chaque tuile est un lien → **`/category/<slug>`** (slug réel BDD).
- **CA-ACC-13** Un bouton **« Voir toutes les catégories »** ouvre un panneau listant les 5 racines **et** toutes leurs sous-catégories actives ; chaque entrée est cliquable et mène à `/category/<slug-racine>` (avec `subcategory_id=<id>` pour une sous-catégorie).
- **CA-ACC-14** Page **`/category/:slug`** : titre = nom de la catégorie, **nombre réel de produits** affiché (« X articles »), **uniquement** les produits de cette catégorie (racine → produits des sous-catégories inclus, comportement backend existant `products.service.ts:252`), via **requête backend réelle** (aucun filtrage client).
- **CA-ACC-15** Slug de catégorie **inconnu ou inactif** → page 404 du site.
- **CA-ACC-16** En-tête de page catégorie : bandeau (photo catégorie + dégradé de marque) + titre + nombre d'articles — structure prête pour une bannière éditable plus tard (pas d'écran admin en V4).

---

### 5.3 Sections produits de l'accueil

**US-ACC-03** — *En tant qu'acheteur, je veux découvrir le catalogue à travers des sections thématiques, chacune avec un bouton « Voir plus ».*

Libellés FR (côté front) et source backend (contrat §7) :

| Section | Titre FR | Source backend |
|---|---|---|
| SEC-1 | « Produits récemment ajoutés » | `section=recent` (création DESC) |
| SEC-2 | « Meilleures offres » | `section=discount` (réductions, % décroissant) |
| SEC-3 | « Produits populaires » | `section=popular` (vues DESC) |
| SEC-4 | « Promotions » | `section=promo` (réduction ≥ 15 %) |
| SEC-5 | « Nouveautés » | `section=newest` (créés ≤ 14 jours) |
| SEC-6 | « Découvrez nos produits » | `section=discover` (aléatoire) |

- **CA-ACC-17** L'accueil affiche au moins **4 sections** (sur les 6 possibles), dans l'ordre du tableau, **après** la section « Vus récemment » (si présente).
- **CA-ACC-18** Chaque section porte son **titre FR exact** et un bouton **« Voir plus »** pointant vers `/search?<params réels correspondants>` (contrat §8).
- **CA-ACC-19** Chaque section est alimentée par `GET /api/products` avec ses paramètres réels ; **aucune donnée codée en dur** (vérification par capture réseau).
- **CA-ACC-20** **Pas de section vide** : une section avec **moins de 4 produits** disponibles n'est pas affichée.
- **CA-ACC-21** **Chevauchement maîtrisé** : entre deux sections affichées simultanément, **≤ 6 produits communs** sur les 10 ; au-delà, la seconde section est masquée.
- **CA-ACC-22** Chaque section affiche **≤ 10 produits** (`per_page=10`) et 5 par ligne à partir de 1280 px.
- **CA-ACC-23** `section=newest` est masquée si aucun produit n'est **créé ≤ 14 jours**.
- **CA-ACC-24** **Filet de recherche** : toute arrivée sur `/?q=<non vide>` est redirigée vers `/search?q=<valeur>` avant affichage du contenu sections.

---

### 5.4 Carte produit compacte

**US-ACC-04** — *En tant qu'acheteur, je veux des cartes produit denses et lisibles, avec prix barré et favori.*

- **CA-ACC-25** **Grille** : exactement **5 cartes par ligne ≥ 1280 px** ; **2 cartes par ligne ≤ 640 px** ; 3–4 entre les deux.
- **CA-ACC-26** **Images uniformes** : ratio fixe (hauteur identique au sein d'une ligne, ± 2 px), `object-cover`, pas de distorsion.
- **CA-ACC-27** Contenu de carte : image, nom (max 2 lignes, troncature), **prix actuel** au format FCFA existant, **ancien prix barré + badge « -X % »** si `oldPrice > price`, état, localisation, **bouton favori** (cœur, coin supérieur droit).
- **CA-ACC-28** **Compteur de vues optionnel** : affiché si l'API le retourne (valeur > 0) ; **absent** sinon.
- **CA-ACC-29** **Visuel de secours** : produit sans image ET catégorie sans photo → `FALLBACK_PHOTO` ; aucune icône d'image cassée possible.
- **CA-ACC-30** **Favori** : clic → bascule dans `localStorage["revends:favorites"]` (liste d'ids persistante) ; l'état est réflété visuellement (cœur plein/contour) ; le clic sur le cœur **ne navigue pas**.
- **CA-ACC-31** Le clic sur la carte (hors bouton panier/favori) → `/catalogue/<slug>` (comportement existant conservé, `ProductCard.tsx:53`).
- **CA-ACC-32** Bouton « Ajouter au panier » et flash vert conservés à l'identique (`ProductCard.tsx:37-45`).

---

### 5.5 Vus récemment

**US-ACC-05** — *En tant qu'acheteur, je veux retrouver ma navigation récente sur l'accueil.*

- **CA-ACC-33** La consultation d'une fiche `/catalogue/:slug` **ajoute/remonte** le produit en tête de `localStorage["revends:recently-viewed"]`.
- **CA-ACC-34** **Capacité : 8 max**, **sans doublon** (dédupliqués par id de produit), plus récent en premier.
- **CA-ACC-35** Sur l'accueil, la section « Vus récents » (intitulé FR exact) apparaît **en tête des sections** ; **6 produits affichés max**, cartes standard.
- **CA-ACC-36** **Jamais de section vide** : aucun historique → section masquée.
- **CA-ACC-37** **Données fraîches** : les cartes affichées sont reconstruites depuis `GET /api/products?ids=…` pour tous les ids stockés (jamais de snapshot local périmé).
- **CA-ACC-38** Produit introuvable/supprimé/indisponible → automatiquement retiré de l'affichage (et du stockage).
- **CA-ACC-39** **Persistance** : la liste survit au rechargement de la page **et** à la déconnexion.

---

### 5.6 Recommandations

**US-ACC-06** — *En tant qu'acheteur, je veux être guidé vers des produits proches de mes centres d'intérêt.*

- **CA-ACC-40** Sur l'accueil, la section **« Recommandé pour vous »** apparaît si **au moins 1 produit vu récemment** : produits de la même catégorie (racine) que le **dernier produit consulté**, hors produit lui-même, **8 max**, via `GET /api/products?category_id=…&sort=recent&per_page=8`.
- **CA-ACC-41** Aucun historique → section **masquée** (pas de vide).
- **CA-ACC-42** Fiche produit : la section **« Produits similaires »** est conservée (même catégorie), **exclut le produit courant**, **8 max** (existant, non régressé).
- **CA-ACC-43** La **structure de rendu** (composants de section + types de contrat `types.ts`) est générique : un futur moteur de recommandation (favoris, achats, recherches) devra pouvoir alimenter les mêmes sections **sans refonte** (vérifié par revue de code : section = titre + liste de cartes issues d'une requête).

---

### 5.7 Recherche dédiée

**US-ACC-07** — *En tant qu'acheteur, je veux rechercher sur tout le catalogue depuis la navbar et obtenir une page de résultats dédiée.*

- **CA-ACC-44** La barre de recherche de la navbar navigue vers **`/search?q=<terme>`** (plus jamais vers `/?q=`).
- **CA-ACC-45** Portée de la recherche (`q`) : **nom, description** (existant) **+ marque, localisation, nom de catégorie, nom de sous-catégorie** — vérifiable : la recherche d'une marque ou d'une localisation retourne les produits correspondants.
- **CA-ACC-46** Page **`/search`** : avec `q` → titre « X résultats pour "q" » ; **sans `q`** → ensemble du catalogue paginé (elle reprend le rôle d'accueil-catalogue d'origine).
- **CA-ACC-47** Aucun résultat → état vide existant : « Aucun résultat pour "q" », suggestion de reformulation (`EmptyState` réutilisé).
- **CA-ACC-48** `q` est validé côté serveur (max 120 caractères, échappement SQL) — aucune erreur 5xx ni injection sur entrée hostile.

---

### 5.8 Filtres et tri (pages catégorie et recherche)

**US-ACC-08** — *En tant qu'acheteur, je veux affiner une liste par des filtres et la trier.*

- **CA-ACC-49** Les filtres sont disponibles sur **les deux pages** (`/category/:slug` et `/search`) : **sous-catégorie** (liste déroulante), **prix min / max** (entiers), **état** (5 valeurs existantes), **localisation** (texte), **marque** (texte).
- **CA-ACC-50** Chaque filtre mappe un paramètre API réel appliqué **dans la requête SQL** (`subcategory_id`, `price_min`, `price_max`, `condition`, `location`, `brand`) — vérifié par `curl` : le backend filtre, pas le client.
- **CA-ACC-51** **Tri** : 4 options — « Plus récents », « Prix croissant », « Prix décroissant », « Plus populaires » (`sort=popular`, `view_count DESC`).
- **CA-ACC-52** Filtres actifs **visibles** (badge/contrôle d'état) et **retirables individuellement** ; l'URL reflète l'état complet (partageable/copiable).
- **CA-ACC-53** Toute modification d'un filtre ou du tri remet la pagination à la page 1.
- **CA-ACC-54** Pagination conservée sur les deux pages (composant `Pagination` réutilisé).

---

### 5.9 Page produit — extension

**US-ACC-09** — *En tant qu'acheteur, je veux une fiche produit enrichie (réduction, favori, contact vendeur) sans perdre l'existant.*

- **CA-ACC-55** **Réduction** : si `oldPrice > price` → ancien prix barré + prix actuel + badge « -X % » ; sinon prix seul (inchangé).
- **CA-ACC-56** Bouton **favori** sur la fiche : même mécanisme localStorage que les cartes ; **état synchronisé** avec la vue liste (retour à l'accueil → la carte reflète la bascule).
- **CA-ACC-57** Bouton **« Contacter le vendeur »** présent sur la fiche → ouvre une **modale de contact** (champs : titre/préambule, message, email d'échange optionnel du demandeur, préfilled avec l'email du compte connecté le cas échéant). Envoi → `POST /api/products/:id/contact` → **notification interne au vendeur** (type `product.contact`, titre « Nouveau message à propos de « <produit> » », message contenu). **Le numéro de téléphone du vendeur n'est JAMAIS exposé** (D2). Succès → toast « Message envoyé au vendeur ». Le bouton est désactivé si le demandeur est le vendeur lui-même. (Décision arbitrée : option (b) formulaire interne, voir §11 PO-ACC-1.)
- **CA-ACC-58** **Compteur de vues** : chaque `GET /api/products/:identifier` public incrémente `view_count` de **+1** (validation : 2 consultations → +2 en BDD, vérifiable en requête SQL directe).
- **CA-ACC-59** « Vous aimerez aussi » conservé (même catégorie, ≤ 8, hors produit courant).

---

### 5.10 Design et responsive

**US-ACC-10** — *En tant qu'acheteur, je veux une interface moderne, propre, spacieuse et cohérente avec la marque.*

- **CA-ACC-60** Conformité `docs/design-system.md` : tokens (orange `#FF6B35` réservé prix/CTA, bleu nuit/secondaire pour les fonds, fond clair `#F7F7F7`, cartes blanches radius 15 px, ombres douces) — revue visuelle par `@tester`.
- **CA-ACC-61** **Sections espacées** d'au moins 40 px ; l'accueil n'affiche pas plus de 8 blocs de contenu (1 carrousel + 1 catégories + 1 vus récents + ≤ 6 sections + 1 recommandé) — pas de surcharge.
- **CA-ACC-62** Aucun débordement horizontal (`overflow-x`) sur les 4 breakpoints testés : ≥1280, 768–1279, 640–767, <640.
- **CA-ACC-63** **Accessibilité** : contrastes textuels ≥ 4,5:1 ; focus clavier visibles ; `alt` sur toutes les images informatives ; `aria-label` sur carrousel, favoris, filtres.
- **CA-ACC-64** **Micro-interactions** : hover des cartes (élévation existante), retour visuel au favori, transitions du carrousel ; **respect de `prefers-reduced-motion`** (aucune animation bloquante).

---

### 5.11 Footer

**US-ACC-11** — *En tant qu'acheteur, je veux un pied de page sur les pages publiques pour trouver les accès principaux.*

- **CA-ACC-65** Footer présent sur **toutes les pages publiques** (accueil, `/category/:slug`, `/search`, `/catalogue/:slug`, `/panier`, auth…).
- **CA-ACC-66** Colonnes : **Catégories** (5 racines réelles → `/category/:slug`), **Acheter** (Recherche → `/search`, Panier → `/panier`, Mes commandes → `/mes-commandes`), **Vendre** (Vendre un article → `/vendre`, Mes articles → `/mes-articles`).
- **CA-ACC-67** **Aucun lien mort** : chaque lien du footer pointe vers une route existante (test au clic) ; les liens nécessitant une session (ex. `/vendre`) se comportent comme la navbar (redirection login).
- **CA-ACC-68** Responsive : colonnes empilées sous 640 px.

---

### 5.12 Données, BDD et API (contrat)

**US-ACC-12** — *En tant que plateforme, je veux des contrats de données propres, réels et non régressifs.*

- **CA-ACC-69** **Migration BDD dédiée** (nouvelle, jamais d'édition des migrations existantes) :
  - `products.old_price INTEGER NULL` avec CHECK `old_price IS NULL OR old_price > price` ;
  - `products.view_count INTEGER NOT NULL DEFAULT 0` avec CHECK `view_count >= 0` ;
  - table `banners` (structure §7) ; **seed de ≥ 3 bannières actives** par défaut.
- **CA-ACC-70** `GET /api/banners` : public, retourne les bannières ACTIVE triées par `position`, corps camelCase conforme `api.md`.
- **CA-ACC-71** `GET /api/products` étendu (tous paramètres optionnels, **rétrocompatibles**) : `section`, `subcategory_id`, `price_min`, `price_max`, `condition`, `location`, `brand`, `sort=popular`, `ids` (≤ 20, ordre de la liste conservé) ; bornes inchangées (`per_page` ≤ 48, page ≥ 1) ; **statut `AVAILABLE` uniquement** (inchangé).
- **CA-ACC-72** `serializeProductCard` / `serializeProductDetail` exposent `oldPrice` (nombre ou null) et `viewCount` (entier ≥ 0) ; `discountPct` calculé côté front selon RG-PROD-4.
- **CA-ACC-73** **Aucune donnée fictive** : chaque section, compteur et résultat visible provient d'une requête backend réelle (contrôle réseau + comparaison avec requêtes SQL directes).
- **CA-ACC-74** **Non-régression** : `GET /api/products` sans aucun paramètre répond exactement comme avant (schémas zod étendus, paramètres optionnels) ; aucun autre endpoint touché.

---

## 6. Règles de gestion — RG-PROD (nouvelles, s'ajoutent à RG-PROD existantes)

- **RG-PROD-1** (rappel) `price` reste un entier entre 500 et 10 000 000 FCFA (`001_init.sql:71`).
- **RG-PROD-2** `old_price` : nullable ; si renseigné, entier **strictement supérieur** à `price` et ≤ 10 000 000 ; contrainte SQL.
- **RG-PROD-3** `view_count` : entier ≥ 0, défaut 0 ; incrémenté de **1** à chaque `GET` public d'une fiche produit ; jamais décrémenté.
- **RG-PROD-4** `discountPct = round((1 - price/old_price) × 100)` ; affiché uniquement si `oldPrice > price` ; badge affiché dès `≥ 1 %`.
- **RG-PROD-5** La recherche `q` porte sur : `name`, `description`, `brand`, `location`, nom de catégorie, nom de sous-catégorie — comparaison `ILIKE '%terme%'`, insensible à la casse, terme trimmé, max 120 caractères.
- **RG-PROD-6** Presets de section (backend) : `recent` = `created_at DESC` ; `discount` = `old_price IS NOT NULL` ORDER BY `discount_pct DESC` ; `popular` = `view_count DESC` ; `promo` = `old_price IS NOT NULL AND discount_pct >= 15` ORDER BY `discount_pct DESC` ; `newest` = `created_at >= now() - interval '14 days'` ORDER BY `created_at DESC` ; `discover` = échantillonnage aléatoire parmi AVAILABLE.
- **RG-PROD-7** Une réduction n'est **jamais inventée** : `oldPrice` provient de la BDD ; produit sans `old_price` → aucun barré, aucun badge.
- **RG-PROD-8** Toutes les listes publiques (accueil, catégorie, recherche, sections) ne contiennent que des produits `AVAILABLE` (les `PENDING`, `RESERVED`, `SOLD`, `REJECTED` n'y apparaissent jamais).

---

## 7. Évolutions techniques contractuelles (pour l'architecture — sans code)

### 7.1 Backend — contrat d'API cible

- **`GET /api/banners`** (public) → `{ banners: [{ id, title, subtitle|null, image:{url}|null, linkUrl|null, position }] }` (camelCase).
- **`GET /api/products`** — nouveaux paramètres optionnels :
  - `section` ∈ `recent|popular|discount|promo|newest|discover` (mutuellement exclusif avec `sort`, 400 si les deux),
  - `subcategory_id` (nombre),
  - `price_min`, `price_max` (entiers ≥ 0, `price_max ≥ price_min` sinon 400),
  - `condition` (enum des 5 valeurs existantes),
  - `location` (texte, ILIKE partiel),
  - `brand` (texte, ILIKE partiel),
  - `sort` étendu avec `popular` (défaut `recent`),
  - `ids` (liste de nombres séparés par des virgules, ≤ 20 ; réponse dans l'ordre de la liste ; produits indisponibles ignorés).
- **`GET /api/products/:identifier`** incrémente `view_count` (transactionnel, statut AVAILABLE/RESERVED uniquement, jamais pour PENDING/REJECTED).
- **`serializeProductCard`** : ajout de `oldPrice` (nullable) et `viewCount`.

### 7.2 Base de données — structure `banners`

Colonnes minimales de la table `banners` : `id`, `title`, `subtitle` (nullable), `image_path` (nullable), `link_url` (nullable), `position` (SMALLINT unique), `active` (BOOLEAN défaut true), `created_at`. Seed par défaut : ≥ 3 bannières actives (titres réels, liens vers /search, /category/…) — le contenu exact du seed est un point ouvert (PO-ACC-4).

### 7.3 Frontend — routes et composants cibles

- Routes ajoutées : `/category/:slug` (CategoryPage), `/search` (SearchPage). Route `/catalogue/:slug` inchangée.
- Navbar : cible de recherche → `/search?q=`.
- HomePage réécrite sur le modèle sections (structure §5.3), avec redirection `/?q=` → `/search?q=`.
- Nouveaux composants : `BannerCarousel`, `ProductSection` (générique, utilisé par les 6 sections + recommandé + vus récents), `Footer`, `CategoryPanel` (« Voir toutes les catégories »), `FavoriteButton`. Composants réutilisés : `ProductCard` (évolué, §5.4), `Pagination`, `EmptyState`, `ErrorMessage`, skeleton.
- `types.ts` : extension de `ProductCardItem`/`ProductDetail` (`oldPrice?`, `viewCount?`) + types `Banner`, `SectionProducts`. Tout nouveau type intègre `src/lib/types.ts` (contrat unique).

---

## 8. Cibles « Voir plus » (contrat de navigation)

| Section accueil | URL de « Voir plus » (réelle) |
|---|---|
| Produits récemment ajoutés | `/search?sort=recent` |
| Meilleures offres | `/search?section=discount` |
| Produits populaires | `/search?sort=popular` |
| Promotions | `/search?section=promo` |
| Nouveautés | `/search?section=newest` |
| Découvrez nos produits | `/search?section=discover` |

---

## 9. Non-régression — CA-NR (à vérifier à chaque étape)

- **CA-NR-01** Routes existantes intactes : `/`, `/catalogue/:slug`, `/panier`, `/commande`, `/vendre`, `/mes-commandes`, `/mes-articles`, `/notifications`, `/profil`, `/admin/*` → aucun 404 introduit.
- **CA-NR-02** La refonte de l'accueil ne modifie pas les flux panier/commande : l'ajout au panier depuis une carte fonctionne à l'identique.
- **CA-NR-03** Les schémas/zod existants (`catalogQuerySchema` — params actuellement acceptés `q`, `category_id`, `sort`, `page`, `per_page`) restent valides sans paramètres supplémentaires (rétrocompatibilité).
- **CA-NR-04** Les photos, formats FCFA et libellés FR existants ne changent pas de format.
- **CA-NR-05** Aucune page administrateur ni aucune API `/api/admin/*` n'est affectée (bis : détail des vues admin inchangé).
- **CA-NR-06** Les tests unitaires existants (`web/src/lib/*.test.ts`) passent ; les nouveaux fichiers de types/format sont couverts par des tests similaires.

---

## 10. Qualité de la recette

- **CA-QA-01** `npm run build` (web) passe sans erreur, et le serveur démarre (`GET /api/health` → 200).
- **CA-QA-02** Parcours de recette complet sans erreur console ni requête réseau 4xx/5xx : Accueil → catégorie → recherche → fiche produit → panier → commande (le parcours NAV de l'énoncé 11, consolidé).
- **CA-QA-03** Les critères d'acceptation de cette section 5 sont exécutables par `@tester` tels quels (une ligne = un test binaire).

---

## 11. Points ouverts — **ARBITRÉS par le chef de projet le 23/09/2026** ✅

- **PO-ACC-1 — « Contacter le vendeur »** : arbitré **(b) formulaire e-mail interne** via **notification** (endpoint `POST /api/products/:id/contact`, notification interne `product.contact` au vendeur — structurée pour une future messagerie). Aucune exposition du téléphone (D2 conservée). Bouton désactivé si demandeur = vendeur.
- **PO-ACC-2 — Filtre « localisation »** : **liste déroulante** construite à partir des **valeurs distinctes** des produits `AVAILABLE` en BDD (endpoint léger dédié ou champ de filtre dédié, décision @architecte), triée alphabétiquement, avec option « Toutes les localisations ».
- **PO-ACC-3 — Chevauchement de sections** : **dédoublonnage côté front** — un produit déjà affiché dans une section n'apparaît pas dans les sections suivantes (l'accueil compose ses sections une fois, puis filtre).
- **PO-ACC-4 — Seed des bannières** : défini par le **chef de projet** (3 bannières par défaut, liens vers `/search?q=…`, `/category/…` ; titres/textes réels figurant dans le seed). L'utilisateur pourra les modifier via le futur CRUD admin.
- **PO-ACC-5 — « Nouveautés »** : fenêtre **≤ 14 jours** (créé depuis moins de 14 jours).
- **PO-ACC-6 — « Découvrez nos produits » (aléatoire)** : sélection **stable par jour** (seed basée sur la date du jour côté backend, e.g. `date + modulo id`), pas de variation à chaque refresh.

---

## 12. Arbitrages du chef de projet (23/09/2026) — PRIME sur les sections antérieures

Les écarts relevés entre le contrat API (`docs/api.md` v2.2), la spé architecture (`docs/architecture-accueil-v3.md`) et le présent cahier sont **tranchés comme suit** (fait foi pour le développement) :

1. **Enum `section` (noms contractuels)** : `recent` · `best_offers` · `popular` · `promotions` · `new` · `discover`. La présente section remplace les noms des tableaux §5.3 / §7.1 / §8 / RG-PROD-6 (`discount` → `best_offers`, `promo` → `promotions`, `newest` → `new`). Les libellés FR restent côté front : « Produits récemment ajoutés », « Meilleures offres », « Produits populaires », « Promotions », « Nouveautés », « Découvrez nos produits ».
2. **`sort=popular`** ajouté à l'enum `sort` (ORDER BY `view_count DESC, id`).
3. **`section` + `sort` simultanés** : `section` **gagne**, `sort` ignoré — **pas** de 400 (décision robuste front).
4. **Borne `ids`** : **≤ 20** (CA-ACC-71). L'écart « 12 » du contrat est levé : le front stocke jusqu'à 8 vues récentes + purge, 20 couvre favoris et historique étendu. Mode exclusif conservé (autre paramètre → 400).
5. **Borne `not_in`** : **≤ 200** (contrat api.md conserve 200).
6. **Seuil `promotions`** : réduction **≥ 15 %** (RG-PROD-6 — le différencie de `best_offers` = toute réduction, tri % décroissant).
7. **Forme bannière** : champ plat **`imagePath`** (string | null) — pas d'objet `image`. Rendu identique côté front (résolution de chemin comme les photos produits).
8. **`view_count`** : incrément +1 atomique sur tout `GET /api/products/:identifier` réussi (propriétaire/admin compris), réponse = valeur post-incrément, 404 sans incrément, jamais décrémenté (RG-PROD-3).
9. **Contact vendeur** : `POST /api/products/:id/contact`, **`requireUser`** (rôle 'user' strict → un admin reçoit 403, convention existante), corps `{ message 10..2000, email? ≤255 }`, 201 `{ ok:true, notificationId }`, statuts contactables `AVAILABLE` + `RESERVED` (`SOLD` → 400 `PRODUCT_CONTACT_NOT_ALLOWED`, `PENDING/REJECTED` → 404 masqué), own → 400 `CONTACT_SELF`, rate-limit 10 req / 10 min.
10. **`discover`** : sélection **stable par jour** — `daySeed = floor(extract(epoch from now())/86400)`, tri par `(p.id + daySeed) % 997` stabilisé (PO-ACC-6). Détail d'implémentation laissé au service, l'essentiel contractuel : identique sur 24 h, varie d'un jour à l'autre.

Le **contrat de référence est `docs/api.md` v2.2** (modifié par l'@api-designer). Toute divergence non listée ici se règle en faveur de `api.md`.

---

## Annexe — Grille de recette

La grille de recette détaillée (tableau ligne-à-ligne : cas, action, attendu, résultat) sera produite par `@cahier-des-charges` à la livraison du chantier, en regroupant les critères ci-dessus par parcours : D1 Découverte, D2 Recherche, D3 Catégorie, D4 Fiche produit, D5 Panier/Commande, D6 Non-régression, D7 Responsive/Accessibilité.