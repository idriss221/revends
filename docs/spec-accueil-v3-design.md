# SPÉCIFICATION VISUELLE — Chantier « Accueil V3 » (Cahier des charges V4)

| | |
|---|---|
| **Projet** | ReVends — marketplace de revente (Côte d'Ivoire) |
| **Auteur** | Agent design (direction visuelle UI/UX) |
| **Destinataires** | `@frontend` (web React + Vite + Tailwind v4) |
| **Sources de vérité** | `docs/cahier-des-charges-v4-accueil.md` (fonctionnel, arbitrés ✅) · `docs/design-system.md` (tokens, maquette `reference/maquette-revends.html`) · `web/src/index.css` (tokens Tailwind réels) |
| **Règle d'or** | **On améliore, on ne casse pas** : chaque valeur ci-dessous est un token existant ou une composition de tokens du §2 design-system. Aucune nouvelle teinte, aucun nouveau radius, aucune nouvelle ombre. |
| **Statut** | Spec prête à implémenter — à recetter par `@frontend` |

---

## 1. Décisions de design clés (à trancher rapidement d'un coup d'œil)

| # | Question | Décision |
|---|---|---|
| D1 | Carrousel : plein écran ou encadré ? | **Plein écran (edge-to-edge, `w-full`)** comme le hero existant (HomePage L86), contenu textuel contraint dans `max-w-[1280px] px-5`. Ambiance marketplace (Jumia), continuité visuelle avec la navbar 1280. |
| D2 | Carrousel : hauteur | **340 px desktop (≥1024) · 260 px <768** — conforme CA-ACC-08 (≤420 / ≤300). |
| D3 | Carrousel : transition | **Fondu (crossfade)** — 0,6 s ease. Cohérent avec la famille fadeIn du design-system (§2.8), plus doux qu'un slide sur des bannières avec texte, et trivial à neutraliser sous `prefers-reduced-motion`. |
| D4 | Carrousel : état backend vide | **Section purement masquée : aucun skeleton, aucun placeholder.** Liste vide *ou* erreur réseau → la section n'existe pas dans le DOM (CA-ACC-07). Pendant les ~100 ms de chargement initial, elle n'est pas non plus rendue (le fadeIn de page amortit l'apparition). |
| D5 | Sections produits : ligne OU grille | **Ligne horizontale scrollable** (scroll-snap, flèches desktop, swipe mobile) — la recommandation retenue. ~5 cartes visibles à 1280, cartes de largeur fixe `232px`. |
| D6 | Ordre des blocs de l'accueil | Carrousel → Catégories → **Vus récents** → **Recommandé pour vous** → SEC-1 récemment ajoutés → SEC-2 meilleures offres → SEC-3 populaires → SEC-4 promotions → SEC-5 nouveautés → SEC-6 découvrez. **Cap à 8 blocs visibles** (CA-ACC-61) : si vus récents + recommandé présents, limiter à 4 sections commerciales (les dernières masquées). |
| D7 | Carte compacte : image | Hauteur fixe **180 px**, `object-cover`, ratio uniforme par ligne (±2 px — CA-ACC-26). |
| D8 | Badge « -X % » | **`bg-danger text-white`** (pill, 13 px/700, drop-shadow) en surimpression **haut-gauche de l'image** — badge promo usuel rouge (brief), token danger existant. Ratio blanc/#FF1744 ≈ 3,4:1 accepté sur image + corps gras (limite documentée type §6.2). |
| D9 | Grille des cartes | `grid-cols-2` (<641) · `sm:grid-cols-3` (641–1279) · `xl:grid-cols-5` (≥1280). Monotone, exactement les breakpoints demandés (5 / 3 / 2). |
| D10 | Favori | Bouton cœur circulaire en surimpression **haut-droite de l'image** (36 px visuel, zone de tap ≥ 44 px), **hors du lien étiré** (même pattern que l'ajout panier existant : `z-[2]` + stopPropagation). |
| D11 | Catégories : « voir toutes » | **Popover (panneau déroulant)** déclenché par le bouton « Toutes les catégories » du header de section — pas de page dédiée (CA-ACC-13 : panneau listant racines + sous-catégories). |
| D12 | Filtre sous-catégorie | `select` (« Toutes les sous-catégories ») — recommandé par le brief. |
| D13 | Filtre état | `select` (5 valeurs `CONDITIONS`, « Tous les états ») — l'état est mono-valeur côté API, un select est honnête et compact. |
| D14 | Filtre localisation | `select` construit sur les valeurs distinctes (PO-ACC-2, endpoint dédié) + option « Toutes les localisations ». |
| D15 | Filtre marque | **Champ texte libre** (ILIKE partiel) — pas d'endpoint « marques distinctes » au contrat ; un select serait soit inventé, soit vide. |
| D16 | Page catégorie/recherche : grille | Même grille 5/3/2 que l'accueil (CA-ACC-25), panneau latéral de filtres **240 px** collant, conteneur `max-w-[1280px]`. |
| D17 | Panneau filtres | Latéral gauche ≥1024 px, **accordéon** (« Filtres ») <1024 px. |
| D18 | Vus récents : position & forme | Après les catégories, avant les sections commerciales ; **ligne mince horizontale** de cartes compactes **sans bouton panier** ni pill état, max 6 affichées (capacité stockage 8 — CA-ACC-34/35). |
| D19 | Footer | **Bloc sombre `bg-ink`** (bleu nuit #1A1A2E) — cohérent avec le hero/banner (design-system §2.2) et la sidebar sombre ; fin de page de confiance. |
| D20 | Footer : colonnes | **Marque + description + contact** · **Catégories** (5 racines réelles) · **Acheter** · **Vendre** (CA-ACC-66). Aucun lien mort : pas de blog/FAQ/réseaux (aucune route réelle). |
| D21 | Fiche produit : prix & favori | Rangée prix = prix actuel 36 px/700 + ancien barré 22 px gris + badge -X % ; cœur favori en haut à droite du bloc (même état que les cartes). |
| D22 | Fiche produit : contact | Bouton outline « Contacter le vendeur » **sous** les boutons d'achat (pleine largeur), modale champs **message + email** (prérempli si connecté), toast succès (PO-ACC-1 arbitré). |

---

## 2. Principes et rythme global (page « Accueil »)

### 2.1 Conteneurs et gabarit

| Zone | Décision |
|---|---|
| Conteneur des contenus de l'accueil | `mx-auto max-w-[1280px] px-5 py-10` — cohérent avec Navbar et HomePage existante (1280, pas 1200 : convention code déjà en place). |
| Rythme vertical entre sections | **`mt-10` (40 px)** — minimum CA-ACC-61 ; en-tête de section `mb-6` (24 px, `.section-header` maquette L502). |
| Espace sous le carrousel | `pt-10` (40 px) avant le premier bloc. |
| Grille produits (pages catalogue) | `grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5` — gap 16 px mobile-adapté, 24 px serait trop lâche en 5 colonnes compactes. |
| Lignes horizontales de l'accueil | `flex gap-4 overflow-x-auto no-scrollbar snap-x` + cartes `w-[232px] shrink-0 snap-start` (desktop) / `w-[min(44vw,232px)]` (mobile). |

### 2.2 Règles transverses (à appliquer partout)

1. **Tokens only** : uniquement les classes `@theme` de `index.css` (primary/primary-dark/secondary/ink/bg/success/danger/gray/gray-light, soft-*, shadow-*, radii 8/10/12/15/20, échelle d'espacement §2.5 design-system). Toute valeur « plaquée » est un écart (auto-revue §8).
2. **Prix & CTA en orange #FF6B35** ; prix de grande taille (≥19 px / bold) pour respecter le contraste AA — jamais de lien orange en 13-14 px non gras.
3. **Focus visible** : l'anneau global `0 0 0 3px rgba(255,107,53,0.4)` (index.css base) s'applique déjà à `a/button/input/select/textarea`. Ne pas le retirer ; les composants nouveaux (flèches, dots, chips, favori) en héritent.
4. **`prefers-reduced-motion`** : le CSS global réduit toutes les animations (§index.css L169). En plus, en JS : couper **l'auto-rotation** du carrousel (`matchMedia('(prefers-reduced-motion: reduce)')`) et remplacer le crossfade par une bascule d'opacité instantanée.
5. **Aucun débordement horizontal de page** : le carrousel est auto-contenu (`overflow-hidden`) ; les lignes scrollables utilisent leur propre `overflow-x-auto` (jamais au niveau `body`) ; vérifier aux 4 breakpoints (CA-ACC-62).
6. **Mobile-first** : classes de base = mobile, `sm:`/`lg:`/`xl:` pour passer en supérieur.
7. **Libellés FR exacts** (titres de sections, aria-labels — chaque libellé est donné ci-dessous).

---

## 3. Composants

---

### 3.1 `BannerCarousel` — Carrousel de bannières (NOUVEAU)

**Objectif** : première section visible sous la Navbar (CA-ACC-01), orienter vers promos/offres/nouveautés. Comportement conforme US-ACC-01.

#### Wireframe

```
                    (pleine largeur, h-340px desktop / h-[260px] <768)
┌──────────────────────────────────────────────────────────────────────────┐
│  [slide actif]  image cover + dégradé L→R  rgba(26,26,46,.72→.35→0)     │
│                                                                          │
│      ┌──────────────────────────────┐                                    │
│      │ content max-w-[1280px] px-5  │        ┌──┐                        │
│      │                              │        │◀ │ ← flèche (vert.centrée)│
│      │  pill opt. « Jusqu'à -40 % » │        └──┘   visible ≥768         │
│      │  Titre 40px bold blanc       │        ┌──┐                        │
│      │  Sous-titre 18px blanc/85    │        │▶ │ ← chevron right        │
│      │  [ Découvrir  → ]  si link   │        └──┘                        │
│      │                              │                                    │
│      │            ●──●  ○  ○   ← dots (actif = pill élargie)            │
│      └──────────────────────────────┘                                    │
└──────────────────────────────────────────────────────────────────────────┘
        × slides superposés (position absolute), crossfade 0.6s
```

#### Anatomie / classes recommandées

- **Root** : `<section aria-label="Offres du moment" aria-roledescription="carousel" role="region">`
  `className="relative h-[340px] w-full overflow-hidden max-[768px]:h-[260px]"`.
- **Slide** (une par bannière, `absolute inset-0`, `transition-opacity duration-[600ms] ease-out`, active = `opacity-100` + retiré `aria-hidden`, inactives = `opacity-0` + `aria-hidden="true"`) :
  - `image_path` présent → `<img src={resolveImageUrl} alt={title} className="h-full w-full object-cover" loading="eager">` (au-dessus de la ligne de flottaison).
  - `image_path` null → fond dégradé de marque : `bg-gradient-to-br from-secondary to-ink` (dégradé `.banner`, design-system §2.2).
  - Surcouche lecture : `absolute inset-0 bg-gradient-to-r from-ink/70 via-ink/35 to-transparent` (noir nuit du token ink, même motif que le hero existant L92) + `max-[640px]` : ajouter un second `bg-gradient-to-t from-black/60 to-transparent` en bas pour les dots/texte mobile.
  - Contenu : `relative z-10 mx-auto flex h-full max-w-[1280px] flex-col justify-center px-5` ;
    - pill optionnelle (`title court`, ≤30 car.) : `mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-primary/25 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-sm` (pattern hero existant L94).
    - Titre : `text-4xl font-bold leading-tight text-white max-w-[620px] max-[768px]:text-[28px]` (2 lignes max, ellipsis).
    - Sous-titre : `mt-3 max-w-[520px] text-lg text-white/85` (1-2 lignes).
    - CTA (si `linkUrl` non nul) : bouton/lien `bg-primary px-7 py-3.5 text-base font-semibold text-white rounded-lg shadow-[0_10px_30px_rgba(255,107,53,0.4)] hover:bg-primary-dark transition-all duration-300 active:scale-[0.97]` + libellé par défaut **« Découvrir »** + `fa-arrow-right`. Pas de CTA si `linkUrl` nul.
  - Liabilité : si `linkUrl` → tout le slide est enveloppé d'un `Link` étiré (`absolute inset-0 z-[1]`, `aria-label={title}`) — **aucun bouton interactif ne doit rester sous ce lien** : dots/flèches passent en `z-[2]`+`relative`.
- **Flèches** (`btn-icon` maquette) : carré `44×44`, `rounded-[10px]`, fond `bg-white/90 backdrop-blur-sm`, icône 16 px `text-ink`, `shadow-card`, `hover:bg-white`, `active:scale-[0.97]`, position `absolute top-1/2 -translate-y-1/2 left-3 / right-3`. **Masquées <768 px** (`max-[767px]:hidden` — le swipe natif prend le relais, les dots restent). `aria-label` exacts : **« Bannière précédente »** / **« Bannière suivante »** (CA-ACC-03).
- **Dots** : `absolute bottom-4 left-1/2 -translate-x-1/2 z-[2] flex items-center gap-2 px-2 py-1` (wrapper agrandit la zone de tap) ;
  - chaque dot : `<button aria-label={"Aller à la bannière " + (i+1)} aria-current={active ? "true" : undefined}>` `h-2.5 rounded-full transition-all duration-300` — inactif `w-2.5 bg-white/60 hover:bg-white/90`, **actif `w-7 bg-white`** (pastille élargie = état distinct, CA-ACC-04).

#### Comportements

| État / condition | Comportement |
|---|---|
| Auto-rotation | Timer **5000 ms** (CA-ACC-02), restarté à zéro après **toute** interaction (clic flèche, clic dot, hover resuming). |
| Hover (desktop) | `mouseenter` → pause ; `mouseleave` → reprise (CA-ACC-06). |
| Focus clavier | `focusin` dans le carrousel → pause ; `focusout` → reprise (CA-ACC-06). |
| `prefers-reduced-motion` | **Pas d'auto-rotation** (timer non démarré) ; crossfade → bascule immédiate d'opacité. |
| Clic flèche / dot | Change immédiatement de slide + reset timer. |
| Bannière sans `link_url` | Affichée non cliquable (pas de `Link`, pas de CTA) — CA-ACC-05. |
| Backend vide / erreur | Section **non rendue** (rien, aucun empty state, aucun skeleton) — D4. |

#### Responsive

| Breakpoint | Hauteur | Flèches | Dots | Texte |
|---|---|---|---|---|
| ≥1024 | 340 px | visibles | centrés bas | 36–40 px |
| 768–1023 | 340 px | visibles | centrés bas | 36 px |
| 640–767 | 260 px | masquées (swipe) | centrés bas | 28 px + dégradé bas |
| <640 | 260 px | masquées (swipe) | centrés bas | 28 px + dégradé bas |

---

### 3.2 `ProductSection` — Sections produits de l'accueil (NOUVEAU, générique)

**Objectif** : composant unique utilisé par les 6 sections commerciales, « Recommandé pour vous » et « Vus récents » (CA-ACC-43 : structure extensible pour un futur moteur de reco). Chaque section = **titre + liste de cartes issues d'une requête réelle** (D-ACC-5, CA-ACC-19).

#### Wireframe

```
┌────────────  Section (mt-10)  ──────────────────────────────────────────┐
│  Produits récemment ajoutés                    [Voir plus →]   ← h3 24px │
│                                                                   600 o.│
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐┌──────┐  (scroll →)      │
│  │carte │ │carte │ │carte │ │carte │ │carte ││carte │   cartes 232 px   │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘└──────┘                   │
│   ◀ ────────────────────────────────────────────────────── ▶            │
│   (flèches flottantes, bord de ligne, visible au hover ≥1024)          │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Anatomie

- `<section className="mt-10" aria-labelledby={id}>`
  - Header : `flex items-center justify-between gap-4 mb-6` → `<h3 id={id} className="text-2xl font-bold text-ink">` (24 px/700, design-system `.section-header h3`) + lien **« Voir plus »** : `text-primary font-semibold text-base hover:text-primary-dark hover:underline` + `fa-arrow-right` 14 px ; `aria-label` = « Voir plus : {titre section} ». **Targets réels** (contrat §8 cahier) :

    | Section | Titre FR exact | « Voir plus » → |
    |---|---|---|
    | SEC-1 | Produits récemment ajoutés | `/search?sort=recent` |
    | SEC-2 | Meilleures offres | `/search?section=discount` |
    | SEC-3 | Produits populaires | `/search?sort=popular` |
    | SEC-4 | Promotions | `/search?section=promo` |
    | SEC-5 | Nouveautés | `/search?section=newest` |
    | SEC-6 | Découvrez nos produits | `/search?section=discover` |
    | — | Vus récents | *(pas de « Voir plus » : aucune page dédiée)* |
    | — | Recommandé pour vous | *(idem)* |

  - Flèches de ligne (≥1024 uniquement) : `btn-icon` 44 px, `rounded-full bg-white shadow-card border border-gray-light text-ink hover:bg-primary hover:text-white`, `absolute` mi-hauteur, `left-0`/`right-0`, visibilité `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity` (section `group`) — **restent focusables au clavier même à l'état invisible** ; `aria-label` « Produits précédents » / « Produits suivants » ; scroll par `clientWidth` (une « vue »).
  - Rail : `no-scrollbar flex gap-4 overflow-x-auto scroll-smooth snap-x pb-2` (le `pb-2` laisse respirer l'ombre des cartes) ; cartes `w-[min(44vw,232px)] shrink-0 snap-start` (mobile ≈ 2 cartes + échancrure, desktop 5 + échancrure).
  - Sous le rail : rien (pas de pagination sur l'accueil).

#### États

| État | Rendu |
|---|---|
| Chargement | Rail de 5 skeletons aux dims exactes d'une carte compacte : `h-[180px]` + bloc texte (pattern `ProductGridSkeleton`, `animate-skeleton`). |
| Erreur réseau | `ErrorMessage` compact (alerte inline `bg-soft-danger`/danger, §3.11 design-system) dans la section, les autres sections restent affichées. |
| Succès **< 4 produits** | **Section masquée** (CA-ACC-20). |
| Chevauchement | **Dédoublonnage front global** (PO-ACC-3) : un `Set` d'ids déjà affichés est partagé entre toutes les sections, filtre à chaque rendu ; section restante avec <4 produits après filtre → masquée (CA-ACC-21). |
| `newest` vide (0 produit ≤14 j) | Masquée (CA-ACC-23). |

**Requêtes** : 6 × `GET /api/products?section=…&per_page=10` (source réelle, CA-ACC-19). « Recommandé pour vous » : `GET /api/products?category_id=<racine du dernier vu>&sort=recent&per_page=8`, produit courant exclu (CA-ACC-40).

---

### 3.3 `ProductCard` — Carte produit compacte (évolution du composant existant)

**Objectif** : carte dense et lisible (US-ACC-04), fidèle aux tokens et motifs de la carte actuelle mais **plus compacte** et enrichie (ancien prix, badge %, favori, vues).

#### Wireframe d'une carte

```
 width : grille (auto) / rail 232px — fond blanc radius 15 shadow-card
┌──────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← image h-[180px] object-cover
│ ▓▓  image fill  ▓▓▓▓ │
│ [-15%]           ♡   │  ← badge promo haut-gauche · favori haut-droite
│                      │
├──────────────────────┤
│ Nom du produit sauté  │  ← 15px/600 ink, 2 lignes max (line-clamp-2)
│ sur deux lignes max…  │
│ 22 500 FCFA  30 000…  │  ← 18px/700 primary + ancien barré 13px gray
│ 📍 Abidjan        👁 128 │  ← 13px gray + vues (si >0)
│ [Bon état]  [+ Ajouter] │  ← pill état 12px + bouton panier compact
└──────────────────────┘
      p-3.5 (14px) · lien étiré z-1 · interactions z-2
```

#### Anatomie / classes recommandées

- **Root** : `group relative overflow-hidden rounded-[15px] bg-white shadow-card transition-all duration-300 hover:-translate-y-[5px] hover:shadow-hover` (exactement l'existant, L49).
- **Lien étiré** : `Link to={`/catalogue/${slug}`} aria-label={name} className="absolute inset-0 z-[1]"` (CA-ACC-31 — inchangé).
- **Image** : `<div className="h-[180px] w-full overflow-hidden bg-bg">` + `img object-cover w-full h-full transition-transform duration-500 group-hover:scale-[1.04]` + `onError` repli `categoryPhoto` puis `FALLBACK_PHOTO` (CA-ACC-29, mécanisme existant inchangé). `alt={name}`.
- **Badge promo** (si `discountPct ≥ 1`, RG-PROD-4) : `absolute left-2.5 top-2.5 z-[2] rounded-full bg-danger px-2.5 py-1 text-[13px] font-bold text-white shadow-soft` + **obligatoirement** `drop-shadow-[0_1px_2px_rgba(26,26,46,0.5)]` pour la lisibilité sur image. `discountPct = Math.round((1 - price/oldPrice) * 100)`.
- **Favori `FavoriteButton`** (composant dédié, réutilisé sur la fiche) : `button` **hors du lien** (`relative z-[2]` + `onClick` avec `e.stopPropagation()`), placé `absolute right-2.5 top-2.5` :
  - visuel : cercle `flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-card backdrop-blur-sm` icône fa-heart 16 px — inactif `text-gray` `hover:text-danger`, **actif `text-danger`** + fond `bg-white` ;
  - zone de tap : le bouton a un padding effectif ≥ 44 px (wrapper `p-1 -m-1` ou `h-11 w-11` centré, visuel 36 px) ;
  - `aria-label` dynamique : « Ajouter aux favoris : {name} » / « Retirer des favoris : {name} » + `aria-pressed={isFav}` ;
  - **pointer-events** : le bouton n'est jamais un enfant du lien étiré (frère, au-dessus) → HTML valide, clic ≠ navigation (CA-ACC-30).
- **Info** `p-3.5` :
  - Nom : `<h4 className="line-clamp-2 min-h-[2.6em] text-[15px] font-semibold leading-snug text-ink">` (`min-h` = hauteur réservée de 2 lignes → toutes les cartes d'une ligne ont le même bloc texte).
  - Prix : `<div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">` → prix actuel `<span className="text-[18px] font-bold text-primary">{formatFcfa(price)}</span>` + (si oldPrice) ancien prix `<s className="text-[13px] font-medium text-gray">{formatFcfa(oldPrice)}</s>`.
  - Méta : `<div className="mt-1 flex items-center justify-between gap-2 text-[13px] text-gray">` → localisation `<span className="flex min-w-0 items-center gap-1"><i fa-map-marker-alt/> <span className="truncate">{location}</span></span>` + (si `viewCount > 0`, CA-ACC-28) vues `<span className="flex shrink-0 items-center gap-1"><i fa-eye className="text-xs"/> {formatNumber(viewCount)}</span>`.
  - Bas de carte : `<div className="mt-2.5 flex items-center justify-between gap-2">` → état pill `rounded-[20px] bg-bg px-2.5 py-1 text-xs font-medium text-ink` + bouton ajout panier **compact** : `relative z-[2] flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-semibold text-white shadow-[0_4px_10px_rgba(255,107,53,0.35)] hover:bg-primary-dark transition-all duration-300 active:scale-[0.97]` — flash vert « ✓ Ajouté » conservé à l'identique (CA-ACC-32, `ADDED_FEEDBACK_MS` 1600 ms).

#### Grille & breakpoints (D9)

| Breakpoint | Colonnes | Classe recommandée |
|---|---|---|
| ≤640 px | **2** | `grid-cols-2` (base) |
| 641 – 1279 px | **3** | `sm:grid-cols-3` |
| ≥1280 px | **5** | `xl:grid-cols-5` |

`gap-4` (16 px). Dans les **rails horizontaux** de l'accueil : largeur fixe `w-[min(44vw,232px)]` (≈5 visibles à 1280, ≈2 sur mobile).

#### États

| État | Visuel |
|---|---|
| Hover | `-translate-y-[5px]` + `shadow-hover` + zoom image 1.04 (0,5 s) — inchangé design-system §2.7/3.12 |
| Press (touch/souris) | `scale 0.97` / 0,15 s (curseur §2.8) |
| Favori ajouté | icône `text-danger` + petit « pop » (`animate-pop-in` existant, 0,3 s) |
| Focus clavier | anneau orange global (hérité) sur lien étiré, cœur, bouton panier |
| Nom trop long | ellipsis 2 lignes (`line-clamp-2`) — jamais de coupure orpheline |

**A11y** : `alt` sur l'image (nom produit) ; le lien étiré a `aria-label={name}` ; boutons avec `aria-label` explicites ; compteur de vues masqué visuellement **et** dans le DOM si 0 (pas de lecture inutile par lecteur d'écran).

---

### 3.4 `CategoryCards` étendues + panneau « Toutes les catégories » (extension)

**Objectif** : conserver les tuiles photos pleines (style existant L26-89) mais **cliquables vers `/category/:slug`** (CA-ACC-12) et ajouter le bouton/popover (CA-ACC-13).

#### Wireframe

```
┌──── Parcourir par catégorie ──────────────── [Toutes les catégories ▾] ┐
│                                                                        │
│   ┌────────┬────────┬────────┬────────┬────────┐                      │
│   │ ▓▓▓▓▓▓ │ ▓▓▓▓▓▓ │ ▓▓▓▓▓▓ │ ▓▓▓▓▓▓ │ ▓▓▓▓▓▓ │   tuiles h-[190px]  │
│   │  Mode  │ Maison │ Électro│ Électro│  Auto  │   radius 20, shadow  │
│   │        │        │ nique  │ ménager│        │   dégradé bas        │
│   └────────┴────────┴────────┴────────┴────────┘   (5 racines actives) │
│  ├── mobile <640 : rail horizontal scrollable (tuile 160px min) ──────┤
└─────────────────────────────────────────────────────────────────────────┘

   POPOVER (état ouvert) :
   ┌──────────────────────────────────────────┐
   │ Toutes les catégories               ✕    │  ← carte blanche radius 20
   ├──────────────────────────────────────────┤    shadow-floating
   │ ▶ Mode                                    │
   │    · Vêtements femme       → /category/mode?subcategory_id=…         │
   │    · Chaussures            → …                                        │
   │ ▶ Maison …                                                           │
   │ … (5 racines + sous-catégories actives)                               │
   └──────────────────────────────────────────┘
```

#### Anatomie

- Header de section : `flex items-center justify-between mb-6` → `h3` **« Parcourir par catégorie »** (24 px bold, repris de l'accueil existant) + bouton **« Toutes les catégories »** : `inline-flex items-center gap-2 text-primary font-semibold hover:text-primary-dark` + `fa-chevron-down` (rotation 180° si ouvert), `aria-expanded`/`aria-controls`, `aria-haspopup="dialog"`.
- Grille tuiles desktop : `grid grid-cols-5 gap-5` (≥1024) / `grid-cols-3` (641-1023) ; **mobile <640 : rail horizontal** `no-scrollbar flex gap-4 overflow-x-auto snap-x` avec tuiles `w-[150px] shrink-0 snap-start` (CA-ACC-10 : rangée scrollable, hauteur uniforme ±4 px).
- **Tuile** (pattern existant, h-[190px] réduit possible à 150 px sur mobile) : `group relative h-[190px] overflow-hidden rounded-[20px] shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-hover` ; image `absolute inset-0 object-cover group-hover:scale-110` ; dégradé `bg-gradient-to-t from-black/75 via-black/10 to-black/15` ; nom `absolute inset-x-0 bottom-0 px-4 py-3 text-lg font-bold text-white drop-shadow-sm` ; **indication courte optionnelle** (si l'API fournit la donnée, ex. `subtitle`, ≤60 car.) : sous-texte `block text-[13px] font-medium text-white/85 line-clamp-1` sous le nom. **Pas de pastille compteur** sur l'accueil (les compteurs restent pertinents sur l'ancienne vue filtre, désormais hors accueil).
- **Tuile = `Link`** vers `/category/${slug}` (plus de `button`/`onSelect` — CA-ACC-12). Repli image : `categoryPhoto(name)` + `FALLBACK_PHOTO` (CA-ACC-11).
- **Popover** (`id` ciblé par `aria-controls`) : `relative` sur un wrapper, panneau `absolute right-0 top-full z-[60] mt-2 w-[360px] rounded-[20px] bg-white p-6 shadow-floating animate-pop-in` (radius 20 = grand bloc, §2.6) ; liste des 5 racines : racine = `flex items-center gap-3 rounded-[10px] px-3 py-2.5 font-semibold text-ink hover:bg-bg` (lien → `/category/slug`), sous-catégories = indentées, `pl-9 text-sm text-gray hover:text-primary` (lien → `/category/<slug-racine>?subcategory_id=<id>`, CA-ACC-13). Fermeture : clic extérieur (overlay transparent `fixed inset-0 z-[55]` seul gestionnaire), `Échap`, bouton ✕, navigation réussie.

#### Responsive

| Breakpoint | Tuiles | Bouton « Toutes » |
|---|---|---|
| ≥1024 | grille 5 colonnes | header, à droite |
| 641–1023 | grille 3 colonnes | header, à droite |
| <640 | rail horizontal (150 px) | header (petit, `text-sm`), reste tapable ≥44 px |

---

### 3.5 `CategoryPage` — Page `/category/:slug` (NOUVEAU)

**Objectif** : page catégorie dédiée, requête backend réelle, filtres + tri + pagination (US-ACC-02, US-ACC-08). Slug inconnu/inactif → 404 (CA-ACC-15).

#### Wireframe desktop (≥1024)

```
┌────────────────────────────────────────────────────────────────────┐
│ ┌ main-image: banner────────────────────────────────────────────┐ │
│ │ photo catégorie (cover) + dégradé 135° secondary→ink 0.92→0.85│ │
│ │                                                              │ │
│ │  Électronique                        ← 32px bold blanc       │ │
│ │  1 248 articles                      ← 16px blanc/85         │ │
│ └──────────────────────────────────────────────────────────────┘ │
├──────────┬───────────────────────────────────────────────────────┤
│ Filtres  │  [Trier ▾]                                    (header)│
│          │  ┌chips filtres actifs (supprimables)───────────┐     │
│ ┌──────┐ │  ┌────┬────┬────┬────┬────┐                     │     │
│ │Sous- │ │  │    │    │    │    │    │  grille 5 cols ≥1280│     │
│ │cat ▾ │ │  ├────┼────┼────┼────┼────┤  3 cols 641-1279    │     │
│ │Prix  │ │  │    │    │    │    │    │  2 cols ≤640        │     │
│ │min__ │ │  └────┴────┴────┴────┴────┘                     │     │
│ │max__ │ │  [< Précédent] 1 248 articles · page 1/125 [Suivant >] │
│ │État▾ │ └─────────────────────────────────────────────────┘    │
│ │Loc.▾ │                                                        │
│ │Marque│                                                        │
│ │[Rénit.]                                                     │
│ └──────┘  (240px, sticky)                                       │
└──────────────────────────────────────────────────────────────────┘
```

#### Wireframe mobile (<1024)

```
┌──────────────────────────────────┐
│ ┌ banner (h-160)─────────────┐   │
│ │  Électronique / 1 248 art. │   │
│ └────────────────────────────┘   │
│ ┌ [Filtres et tri (3) ▾] ──────┐ │  ← accordéon, badge n° de filtres actifs
│ └─────────────────────────────┘ │     (ouvert → le panneau se déplie ci-dessous,
│  [Trier ▾]                      │      puis se replie au choix/scroll)
│  ┌────┬────┐                    │
│  │    │    │   grille 2 cols    │
│  └────┴────┘                    │
│  [< Précédent] [Suivant >]      │
└──────────────────────────────────┘
```

#### Anatomie

- **Header bannière** : bloc `relative h-[220px] overflow-hidden rounded-[20px] shadow-card max-[640px]:h-[160px]` (radius 20 = grand bloc §2.6) ;
  - image `absolute inset-0 h-full w-full object-cover` (`categoryPhoto(slug/name)` + FALLBACK) ;
  - dégradé `absolute inset-0 bg-gradient-to-br from-secondary/90 to-ink/85` (tokens secondary + ink en opacité, dégradé `.banner` du design-system) ;
  - texte `absolute bottom-0 p-8` : `<h1 className="text-[32px] font-bold text-white">` (titre = nom catégorie, CA-ACC-14) + `<p className="mt-1 text-base text-white/85">` = **« {formatNumber(total)} articles »** (singulier « article » si 1), via `total` de la réponse réelle.
- **Layout** : `grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr] lg:gap-6` dans `mx-auto max-w-[1280px] px-5 py-7.5`.
- **Panneau filtres** (left, ≥1024 : `sticky top-[84px] self-start max-h-[calc(100vh-100px)] overflow-auto rounded-[15px] bg-white p-5 shadow-soft`) :
  - Titre `text-sm font-semibold text-ink mb-4` « Filtres ».
  - **Sous-catégorie** : `<select>` `field-input` « Toutes les sous-catégories » + enfants actifs de la racine (D12).
  - **Prix** : `flex gap-2` deux inputs `<input type="number" min="0" step="100" placeholder="Min" aria-label="Prix minimum">` / `placeholder="Max" aria-label="Prix maximum"` (`field-input`).
  - **État** : `<select>` « Tous les états » + `CONDITIONS` (5 valeurs) (D13).
  - **Localisation** : `<select>` « Toutes les localisations » + valeurs distinctes triées (D14, PO-ACC-2).
  - **Marque** : `<input type="text" placeholder="Ex. Samsung" aria-label="Marque">` (D15).
  - **Réinitialiser** : `Button outline small block` « Réinitialiser » (`fa-rotate-left`), vide tous les paramètres + page 1.
  - Labels : chaque champ a un `<label>` lié (`htmlFor`) 14 px/600 (design-system §3.3).
- **Tri** (header de colonne droite) : `<select>` `field-input !w-auto` 4 options — **« Plus récents »**, **« Prix croissant »**, **« Prix décroissant »**, **« Plus populaires »** (CA-ACC-51).
- **Chips filtres actifs** (CA-ACC-52) : ligne `flex flex-wrap gap-2 mb-6` ; par filtre actif : `<span className="inline-flex items-center gap-1.5 rounded-full border border-gray-light bg-white px-3 py-1.5 text-sm shadow-soft">` libellé (`text-ink font-medium`) + `<button aria-label={"Retirer le filtre : " + libellé} className="text-gray hover:text-danger"><i fa-times/></button>`.
- **Grille + Pagination** : grille 5/3/2 (D16) + composant `Pagination` réutilisé (CA-ACC-54).
- **États** : chargement → `ProductGridSkeleton` + banner skeleton ; erreur → `ErrorMessage` ; 0 résultat avec filtres → `EmptyState` « Aucun article ne correspond à ces filtres » + bouton « Réinitialiser les filtres » (action = vide la querystring).
- **URL = état complet** : chaque filtre/tri/page mappé dans l'URL (partageable, CA-ACC-52) ; toute modification de filtre/tri → `page` repasse à 1 (CA-ACC-53).

#### Filtres ↔ paramètres API (CA-ACC-50)

| Filtre | Param API |
|---|---|
| Sous-catégorie | `subcategory_id` |
| Prix min / max | `price_min` / `price_max` |
| État | `condition` |
| Localisation | `location` |
| Marque | `brand` |
| Tri | `sort` (recent / price_asc / price_desc / popular) |
| Page | `page` |

---

### 3.6 `SearchPage` — Page `/search?q=…` (NOUVEAU)

**Objectif** : résultats de recherche dédiés (CA-ACC-44), reprise du rôle « accueil-catalogue » (D-ACC-6). Même squelette que la page catégorie — **filtre l'URL initiale, conserve page/catégorie**.

#### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ 128 résultats pour « iphone »        [✕ Effacer]  ← h1 28px│
│ ┌──────────┬──────────────────────────────────────────┐  │
│ │ Filtres  │ [Trier ▾]                                │  │
│ │ (mêmes   │ ┌──┬──┬──┬──┬──┐   grille 5/3/2          │  │
│ │ que caté)│ │  │  │  │  │  │                        │  │
│ │ [Rénit.] │ └──┴──┴──┴──┴──┘                        │  │
│ └──────────┘ [< Précédent] [Suivant >]                │  │
│                                                       │  │
│  — si aucun résultat —                                │  │
│  ┌──────────────────────────────┐                     │  │
│  │       🔍 circle gris        │  EmptyState existant │  │
│  │ Aucun résultat pour « x »    │                     │  │
│  │ Essayez un autre mot-clé…    │                     │  │
│  │   [Voir tous les articles]   │                     │  │
│  └──────────────────────────────┘                     │  │
└──────────────────────────────────────────────────────────┘
```

#### Anatomie

- **Header** : `PageHeader` (28 px) : si `q` → **« {formatNumber(total)} résultats pour « {q} » »** + bouton **« Effacer »** (`text-primary font-semibold hover:text-primary-dark`, icône `fa-times`) → navigue **vers `/search` sans `q`** (catalogue complet) ; si pas de `q` → titre « Tous les articles » (rôle accueil-catalogue, CA-ACC-46).
- **Filtres** : **même panneau que la page catégorie** — extraire un composant commun `CatalogFilters` (props : valeur initiale depuis l'URL + callback d'application) pour garantir la cohérence visuelle (CA-ACC-49). Sous-catégorie du panneau : menu déroulant des **5 racines** (chaque racine = optgroup de ses enfants) — la recherche n'a pas de catégorie racine imposée.
- **Tri / chips / grille / Pagination / EmptyState** : identiques à §3.5. EmptyState (CA-ACC-47) : icône `fa-search`, titre **« Aucun résultat pour « {q} » »**, description « Essayez un autre mot-clé, une marque ou une localisation. », CTA propre « Voir tous les articles » → `/search` (ou « Réinitialiser les filtres » si des filtres sont actifs).
- **Règles liées** : la barre de recherche **Navbar** cible désormais `/search?q=…` (CA-ACC-44, un seul changement Navbar) ; tout `/?q=<non vide>` est redirigé vers `/search?q=<valeur>` avant rendu (CA-ACC-24, D-ACC-6).

---

### 3.7 « Vus récents » — adaptateur du rail (NOUVEAU, local)

**Objectif** : retrouver sa navigation récente (US-ACC-05), données fraîches via `ids` (CA-ACC-37), jamais de vide (CA-ACC-36).

#### Wireframe

```
┌── Vus récents ─────────────────────────────────────────────┐
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                 │
│ │mini│ │mini│ │mini│ │mini│ │mini│ │mini│  rail compact     │
│ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘  max 6 produits  │
└──────────────────────────────────────────────────────────────┘
   carte mini : image 160px + nom 2L + prix (pas de panier, pas d'état)
```

#### Anatomie

- Même rail horizontal que §3.2 (`no-scrollbar flex gap-4 snap-x`) mais cartes **dérivées compactes** : `ProductCard` avec prop `variant="mini"` :
  - image `h-[160px]`, favori conservé (haut-droite), **badge promo conservé**, **nom + prix conservés** ;
  - **sans** bouton panier, **sans** pill état, **sans** compteur de vues.
- Titre : `h3` **« Vus récents »** (24 px bold) — pas de « Voir plus » (aucune page dédiée).
- Position : **après les catégories, avant les sections commerciales** (D18, CA-ACC-35).
- Logique (composition, déjà au cahier) : lecture `localStorage["revends:recently-viewed"]` (max 8, dédupliqués, plus récent en premier) → `GET /api/products?ids=…` → affichage **max 6** → les ids introuvables/supprimés/indisponibles sont purgés du stockage (CA-ACC-38). Historique vide → **section masquée** (CA-ACC-36).

---

### 3.8 `Footer` — Pied de page (NOUVEAU, toutes pages publiques)

**Objectif** : accès principaux sur toutes les pages publiques (CA-ACC-65), style sombre de confiance (D19), zéro lien mort (CA-ACC-67).

#### Wireframe

```
┌─────────────────────────────────────────────────────────────────────┐
│  bg-ink  (fond #1A1A2E, texte blanc/80)                            │
│ ┌────────────────────┬────────────┬────────────┬──────────────┐    │
│ │ ReVends  (logo)    │ Catégories │ Acheter    │ Vendre       │    │
│ │ (icône orange +    │  Mode      │ Recherche  │ Vendre un    │    │
│ │  titre blanc 28px) │  Maison    │ Panier     │   article    │    │
│ │ La marketplace de… │  Électron… │ Mes        │ Mes articles │    │
│ │ [contact@…]        │  Électrom… │ commandes  │              │    │
│ │                    │  Auto      │            │              │    │
│ └────────────────────┴────────────┴────────────┴──────────────┘    │
│ ───────────────────────────────────────────────────────────────────│
│  © 2026 ReVends · Mentions légales · Confidentialité · Fait avec ♥ │
│   en Côte d'Ivoire                                    (bas de page)│
└─────────────────────────────────────────────────────────────────────┘
```

#### Anatomie

- Root : `<footer className="mt-10 bg-ink">` (posé par les pages publiques — routes publiques uniques via layout ou inclusion par page ; D-ACC-8).
- Grille : `mx-auto grid max-w-[1280px] grid-cols-1 gap-10 px-5 py-10 sm:grid-cols-2 lg:grid-cols-4` (CA-ACC-68 : empilées <640).
- **Colonne 1 — Marque** : logo « variante sombre » (icône `fa-shopping-bag` primary 48 px + titre **28 px/700 blanc**) ; description `mt-4 text-sm leading-relaxed text-white/70` : « La marketplace de confiance pour acheter et vendre des articles d'occasion en Côte d'Ivoire. » ; lien contact `<a href="mailto:contact@revends.ci" className="mt-4 inline-flex items-center gap-2 text-sm text-white/70 hover:text-primary">` (icône `fa-envelope`) — **mailto = cible réelle**, pas de lien mort.
- **Colonnes 2-4** (titres `text-sm font-semibold uppercase tracking-wide text-white/50 mb-4` — seule casse capitale autorisée, design-system §2.4) :
  - **Catégories** : 5 racines actives réelles (`api.categories()`), `Link` → `/category/${slug}`, `block py-1.5 text-sm text-white/70 hover:text-primary transition-colors` (CA-ACC-66).
  - **Acheter** : Recherche → `/search` · Panier → `/panier` · Mes commandes → `/mes-commandes` (idem côté : les routes protégées se comportent comme la navbar — redirection `/login?next=` si non connecté, CA-ACC-67).
  - **Vendre** : Vendre un article → `/vendre` · Mes articles → `/mes-articles` (idem redirection si session requise).
- **Bas de page** : `border-t border-white/10` ; `mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-2 px-5 py-5 text-xs text-white/50 sm:flex-row` :
  - « © 2026 ReVends — Tous droits réservés » ;
  - « Mentions légales » · « Confidentialité » (texte simple, **non cliquable** : pas de route réelle — pas de lien mort ; les libellés restent visibles comme placeholders factices) ;
  - « Fait avec <i fa-heart text-primary> en Côte d'Ivoire » — sobre, unique micro-détail de personnalité.

---

### 3.9 Fiche produit — extension (ancien prix, favori, contact)

**Objectif** : enrichir la fiche sans régression (CA-ACC-55 à 59), au-delà de l'existant `ProductPage`.

#### Wireframe (bloc détails)

```
┌────────────────────────────────────────────────┐
│ Nom du produit                       (♥ favori)  │  ← h1 32px + cœur 44px
│ ┌────────────────────────────────────────────┐ │
│ │ 250 000 FCFA  300 000 FCFA   [-17%]       │ │  ← 36px/700 primary +
│ └────────────────────────────────────────────┘ │    barré 22px gray + badge
│ [Disponible] [Bon état] [Réservé · 12 min]     │
│                                                │
│ 🧑 Vendeur : Awa D. • Membre depuis 2024 • 12 v│
│                                                │
│ [ Ajouter au panier ]  [ Acheter maintenant ]  │
│ [ Contacter le vendeur ]   ← NOUVEAU, block   │
│                                                │
│ 👁 128 vues · Publié le 19/09/2026 à 14:30    │
└────────────────────────────────────────────────┘

   MODALE contact (Modal existante, max-w-md) :
   ┌ Contacter le vendeur ──────────────── ✕ ┐
   │ « iPhone 13 — 128 Go »            13px gris│
   │ Votre message *                      textarea│
   │ [………min 10 caractères……………]              │
   │ Votre email (pour la réponse)  input      │
   │ (prérempli si connecté)                    │
   │ [ Envoyer le message ]  ← btn-primary block│
   └────────────────────────────────────────────┘
```

#### Anatomie

- **Prix (CA-ACC-55)** : remplacer le bloc prix actuel (`text-[36px]`) par une rangée `flex flex-wrap items-baseline gap-3` : prix actuel **36 px/700 primary** + (si `oldPrice > price`) `<s className="text-[22px] font-medium text-gray">` + badge pill **« -17 % »** (`bg-danger text-white text-sm font-bold rounded-full px-3 py-1 shadow-soft`, formulaire `discountPct` RG-PROD-4). Pas de barré/badge sinon (RG-PROD-7).
- **Favori (CA-ACC-56)** : bouton 44 px (`btn-icon` pattern : `bg-bg` → hover `bg-primary text-white`), `absolute` en haut à droite du bloc infos (ou `flex` tête de ligne : `h1 flex-1` + bouton). Même logique/stockage que les cartes ; `aria-label` « Ajouter aux favoris » / « Retirer des favoris » + `aria-pressed`. **État synchronisé** avec la vue liste (liste des favoris lue au montage + au retour de navigation ; le retour accueil reflète la bascule).
- **Vues (CA-ACC-58, RG-PROD-3)** : ligne « Publié le … » enrichie : `<span>👁 {formatNumber(viewCount)} vues</span> · Publié le {…}` (icône `fa-eye`, 12 px gray) si `viewCount > 0`.
- **« Contacter le vendeur » (PO-ACC-1)** :
  - Bouton : `Button variant="outline" block` + icône `fa-envelope`, libellé exact **« Contacter le vendeur »**, placé **sous** les boutons d'achat ; `disabled` si `isOwner` (vendeur demandeur = lui-même), avec `title` explicatif ; **visible** même si produit SOLD/RESERVED (les acheteurs récupèrent un contact) — seule la condition « demandeur = vendeur » le désactive.
  - Modale : `Modal` existante, titre **« Contacter le vendeur »** ; préambule 13 px gris = **« {product.name} »** ; champ **message** : `label` « Votre message * », textarea `field-input` rows 5, `minLength 10`, requis, erreur inline `role="alert"` 14 px danger + `aria-invalid`/`aria-describedby` (§6.2 design-system) ; champ **email** : `label` « Votre email (pour recevoir la réponse) », input `type="email"` `field-input`, `value` prérempli `user.email` si connecté, **optionnel** mais validé en format email si rempli ;
  - Soumission : `Button primary block` « Envoyer le message », état `loading` (spinner `fa-spinner fa-spin`) tant que la requête n'est pas résolue ; succès → toast **« Message envoyé au vendeur »** + fermeture modale ; échec → message d'erreur inline dans la modale (pas de fermeture). **Aucun numéro de téléphone n'est exposé** (D2).
- **« Vous aimerez aussi »** : conservé tel quel (CA-ACC-59), grille **2/3/5** réutilisant la carte compacte.

---

## 4. Wireframe de l'accueil complet (« Accueil V3 »)

```
┌─────────────────────────────────────────────────────────────────────┐
│ NAVBAR (sticky, inchangée — seule la recherche cible /search?q=…)   │
├─────────────────────────────────────────────────────────────────────┤
│ 1. CARROUSEL DE BANNIÈRES                       [h 340/260 plein écran]│
├─────────────────────────────────────────────────────────────────────┤
│ 2. Parcourir par catégorie                [Toutes les catégories ▾] │
│    ▓▓▓▓ ▓▓▓▓ ▓▓▓▓ ▓▓▓▓ ▓▓▓▓   5 tuiles (rail mobile)               │
├─────────────────────────────────────────────────────────────────────┤
│ 3. Vus récents                                                      │
│    ▫▫▫▫▫▫▫▫  rail cartes mini (max 6, sans panier)   [si historique] │
├─────────────────────────────────────────────────────────────────────┤
│ 4. Produits récemment ajoutés                     [Voir plus →]     │
│    ▫▫▫▫▫▫▫▫  rail 5+ cartes                                          │
├─────────────────────────────────────────────────────────────────────┤
│ 5. Meilleures offres                             [Voir plus →]      │
│ 6. Produits populaires                           [Voir plus →]      │
│ 7. Promotions                                    [Voir plus →]      │
│ 8. Nouveautés                                    [Voir plus →]      │
│    Recommandé pour vous      (si ≥1 produit vu, rail)               │
│    Découvrez nos produits                        [Voir plus →]      │
│    … cap à 8 blocs visibles (CA-ACC-61), dédoublonnage global       │
├─────────────────────────────────────────────────────────────────────┤
│ FOOTER sombre (Catégories · Acheter · Vendre · © … ♥ Côte d'Ivoire) │
└─────────────────────────────────────────────────────────────────────┘
   rythme : sections espacées mt-10 (40px) · en-têtes mb-6 (24px)
```

---

## 5. Contrats frontend (rappel pour `@frontend`)

| Élément | Contrat |
|---|---|
| Types nouveaux | `Banner { id, title, subtitle|null, image:{url}\|null, linkUrl\|null, position }` ; `ProductCardItem` += `oldPrice: number\|null` ; `viewCount: number` ; type `SectionKind` si besoin. Tout dans `web/src/lib/types.ts` (contrat unique). |
| API | `GET /api/banners` ; `GET /api/products` += `section`, `subcategory_id`, `price_min`, `price_max`, `condition`, `location`, `brand`, `sort=popular`, `ids` (≤20, ordre conservé) ; `GET /api/products/:identifier` incrémente `view_count` ; `POST /api/products/:id/contact` (message + email) → notification `product.contact`. |
| LocalStorage | `revends:favorites` (ids) · `revends:recently-viewed` (ids, 8 max, dédupliqués) — mêmes clés que le stockage existant des favoris si déjà présent. |
| Routes | `/` (découverte) · `/category/:slug` · `/search?q=` · `/catalogue/:slug` (inchangée) · `/?q=` → redirection `/search?q=` · `/category/:slug` inconnu → 404. |
| Composants nouveaux | `BannerCarousel` · `ProductSection` (générique) · `CatalogFilters` (partagé catégorie/recherche) · `CategoryPanel` (popover) · `FavoriteButton` · `Footer`. |
| Composants évolués | `ProductCard` (compacte + props) · `CategoryCards` (Liens + panel) · `HomePage` (réécrite) · `ProductPage` (extension §3.9) · `Navbar` (cible de recherche, 1 seul changement). |

---

## 6. Auto-revue (contrôle écart-zéro, `auto-revue` + `fidelite-maquette`)

### 6.1 Tokens utilisés — tous issus du token store (`index.css` @theme) ✔

| Usage | Tokens |
|---|---|
| Texte | `text-ink`, `text-gray`, `text-white`, `text-white/85`, `text-white/70`, `text-white/50` |
| Accent | `bg-primary`, `text-primary`, `hover:bg-primary-dark`, `hover:text-primary-dark`, `bg-primary/25` |
| Fonds | `bg-bg`, `bg-white`, `bg-ink` (footer), dégradés `from-secondary via-* to-ink` (existant, §2.2) |
| Badges/statuts | `bg-danger`, `bg-soft-danger`, `bg-soft-info`, `bg-soft-warning`, `text-amber-deep` |
| Ombres | `shadow-card`, `shadow-soft`, `shadow-hover`, `shadow-nav`, `shadow-floating` |
| Radius | `rounded-lg` (8), `rounded-[10px]`, `rounded-[15px]`, `rounded-[20px]`, pill `rounded-full` |
| Animations | `animate-pop-in`, `animate-skeleton`, `page-in` (via `fadeIn 0.5s` global) |
| Espacements | Échelle design-system §2.5 : 4·8·12·14·16·20·24·30·40·48 — aucune valeur orpheline |

### 6.2 Contrastes vérifiés (paires nouvelles uniquement, §6.2 design-system)

| Paire | Ratio | Verdict |
|---|---|---|
| `ink`/blanc (textes) | 17.06:1 | AA ✔ |
| `gray`/blanc (métadonnées 13-14 px) | 4.83:1 | AA ✔ |
| blanc / `rgba(26,26,46,.72)` (dégradé carrousel) | ~5:1 (zone sombre) | AA ✔ (texte blanc sur dégradé) |
| **`#FF1744`/blanc (badge -X %)** | ≈ 3,4:1 | **Limite connue** : badge 13 px/700 + drop-shadow sur image — cohérent avec les limites badgées §6.2 design-system (vert/orangé). Accepté ; à signaler au PO. |
| `text-primary` liens « Voir plus » 16 px/600 sur fond clair | 2,84:1 | Limite **déjà dans la maquette** (`.view-all` L514, §6.2) — conservée par fidélité ; compensée par le poids 600 + soulignement au hover. |
| `white/70` sur `ink` (footer) | ~11:1 | AA ✔ |

### 6.3 Cohérence avec le cahier des charges (critères clés re-coches)

- CA-ACC-01/02/03/04/06/07/08/09 (carrousel) : couverts — hauteurs 340/260 ✔, timer 5000 ms ✔, aria-labels exacts ✔, dots cliquables ✔, pause hover/focus ✔, section masquée si vide ✔, bannière sans image → dégradé marque ✔.
- CA-ACC-10/11/12/13 (catégories) : rangée horizontale mobile ✔, hauteur uniforme ✔, liens `/category/:slug` ✔, panneau racines+sous-catégories ✔.
- CA-ACC-17/18/19/20/22/23 (sections) : ≥4 sections, ordre fixe, Voir plus réels, pas de section <4 ✔, ≤10 produits, 5 visibles à 1280 ✔.
- CA-ACC-25/26/28/30/32 (carte) : grille 5/3/2 exacte ✔, hauteurs uniformes ✔, vues optionnelles ✔, favori hors lien ✔, flash panier conservé ✔.
- CA-ACC-35/36 (vus récents) : avant les sections ✔, max 6 ✔, masquée si vide ✔.
- CA-ACC-49/51/52/53 (filtres) : les 5 filtres + tri 4 options ✔, chips supprimables ✔, URL reflète l'état ✔, page 1 au changement ✔.
- CA-ACC-55/56/57/59 (fiche) : barré + badge ✔, favori synchronisé ✔, modale contact sans exposition téléphone ✔, « Vous aimerez aussi » conservé ✔.
- CA-ACC-60/61/62/63/64 (design global) : tokens exacts ✔, sections ≥40 px + ≤8 blocs ✔, aucun overflow-x ✔, focus/aria/alt ✔, reduced-motion ✔.
- CA-ACC-65/66/67/68 (footer) : toutes pages publiques ✔, colonnes Catégories/Acheter/Vendre ✔, zéro lien mort ✔, stack <640 ✔.

### 6.4 Écarts résiduels assumés (signalés honnêtement)

1. **Grille 5 colonnes avec panneau latéral** (pages catégorie/recherche ≥1280) : cartes ≈182 px de large — dense mais conforme CA-ACC-25 et au brief (« grille 5/2 »). Si la recette visuelle le juge trop serré, **fallback documenté** : passer à 4 colonnes ≥1280 sur ces deux pages uniquement (à valider par le PO, sans toucher l'accueil).
2. **Vues sur la fiche produit** : l'API expose `viewCount` sur la fiche dès que le backend l'ajoute à `serializeProductDetail` (CA-ACC-72 ne le garantit que pour la carte) — afficher « N vues » uniquement si le champ est présent dans le type `ProductDetail` étendu.
3. **Badge promo** : teinte `danger` + blanc est un usage nouveau (la maquette ne badgeait pas les réductions) — valeurs 100 % tokens existants, usage conforme aux motifs pill §3.9.
4. **Mentions légales / Confidentialité** : textes non cliquables (pas de routes réelles) — conformes à « aucun lien mort », à faire évoluer avec les futures pages légales.

---

## 7. Notes de recette pour `@frontend`

1. Démarrer par les tokens → vérifier qu'aucune classe hors `@theme` n'est introduite (une classe `bg-[#...]` en dehors des valeurs existantes = écart).
2. Implémenter dans l'ordre : `FavoriteButton` → `ProductCard` compacte → `ProductSection` (rail) → `BannerCarousel` → `CategoryCards` + panel → `Footer` → `CatalogFilters` → `CategoryPage` → `SearchPage` → refonte `HomePage` → extension `ProductPage`.
3. Tester les 4 breakpoints (≥1280 / 768–1279 / 640–767 / <640) pour le critère « aucun débordement horizontal ».
4. Vérifier au clavier : focus visible sur cœur/dots/flèches/chips, Échap sur popover et modale, focus trap modale (composant Modal existant).
5. `prefers-reduced-motion` : couper l'auto-rotation (JS) en plus du CSS global.
6. Recette souris : pause du carrousel au hover, élévation des cartes, flèches visibles au hover des rails.