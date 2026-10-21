# DESIGN SYSTEM — ReVends

| | |
|---|---|
| **Version** | 1.0 |
| **Auteur** | Agent design (direction artistique + UI), pour `@frontend` (web) et `@mobile` |
| **Source de vérité visuelle** | `reference/maquette-revends.html` (18 pages, fichier HTML/CSS unique). Les numéros de ligne (Lxx) référencent ce fichier. |
| **Source de vérité fonctionnelle** | `docs/cahier-des-charges-v2.md` (spec V2 — périmètre V1, décisions D1…D12) |
| **Règle d'or** | Reproduction **fidèle** de la maquette (fidelite-maquette) : toute couleur, radius, ombre ou taille listée ci-dessous est **extraite de la maquette**, jamais inventée. Les écarts fonctionnels documentés au §6 proviennent **uniquement** du cahier des charges V2 (fonctions décoratives hors périmètre V1). |

---

## 1. Principes directeurs

1. **Une marque, deux ambiances.** L'orange `--primary` est l'énergie (CTA, prix,
   actions), le bleu `--secondary` + le bleu nuit `--dark` sont la confiance
   (fonds hero, banner, sidebar). Le fond gris clair `--light` fait ressortir
   les cartes blanches posées en ombre douce.
2. **La carte est le module de base** : fond blanc, radius 15px, ombre douce
   `0 4px 12px rgba(0,0,0,0.05–0.08)`. Tout contenu structuré (produit, stat,
   tableau, notification, formulaire) vit dans une carte.
3. **Hiérarchie par le poids et la taille, pas par la couleur** : titre 32px/700,
   sous-titre 24px, corps 16px, métadonnée 14px grise. L'orange est réservé au
   prix et aux actions.
4. **Les statuts parlent par des badges pill** colorés sur fond pastel dédié
   (jamais de texte coloré sur fond blanc pour un statut).
5. **Web responsive d'abord** (cible V1 = web, cahier §1), déclinable mobile
   natif sans changer les tokens (seules la barre d'onglets, les safe areas et
   les hit targets s'adaptent, §7).

---

## 2. Tokens design

### 2.1 Palette — couleurs racines (extraites de `:root`, L15–27)

| Token CSS maquette | Hex | Usage principal | Tailwind (web) | RN (mobile) |
|---|---|---|---|---|
| `--primary` | `#FF6B35` | CTA principal, prix, icônes d'accent, lien « Voir tout » | `orange` | `colors.primary` |
| `--primary-dark` | `#E85A2D` | Hover bouton primaire, header profil, dégradé bottom chart-bar | `orange-dark` | `colors.primaryDark` |
| `--secondary` | `#004E89` | Fond hero/banner (dégradé), bouton secondaire, texte badge « Vendu/Info » | `blue` | `colors.secondary` |
| `--dark` | `#1A1A2E` | Texte principal, fond sidebar, fond hero/banner (dégradé) | `ink` | `colors.dark` |
| `--light` | `#F7F7F7` | Fond de page, piste du toggle, hover de ligne | `bg` | `colors.light` |
| `--white` | `#FFFFFF` | Fonds de cartes, textes sur couleur | `white` | `colors.white` |
| `--success` | `#00C853` | Bouton/icône succès, texte badge « Disponible/Publié » | `success` | `colors.success` |
| `--warning` | `#FFD600` | Étoiles de notation des cartes produit (décoratif V1) | `warning` | `colors.warning` |
| `--danger` | `#FF1744` | Bouton danger/suppression, texte badge « Refusé » | `danger` | `colors.danger` |
| `--gray` | `#6B7280` | Métadonnées, labels, places, dates | `gray` | `colors.gray` |
| `--gray-light` | `#E5E7EB` | Bordures (2px) inputs/tables, séparateurs, upload-dash | `border` | `colors.border` |

**Neutralité : le texte courant sur fond clair est toujours `--dark` (#1A1A2E),
jamais noir pur.** Le gris `--gray` sert exclusivement aux textes secondaires.

### 2.2 Dégradés (valeurs exactes de la maquette)

| Usage | Classe maquette | Dégradé exact |
|---|---|---|
| Hero accueil | `.hero-section` (L108) | `linear-gradient(135deg, #1A1A2E 0%, #004E89 100%)` |
| Banner catalogue | `.banner` (L440) | `linear-gradient(135deg, #004E89 0%, #1A1A2E 100%)` (inversé) |
| Pages auth (login/register/admin) | `.auth-page` (L200) | `linear-gradient(135deg, #667EEA 0%, #764BA2 100%)` (violet) |
| Header profil | `.profile-header` (L1107) | `linear-gradient(135deg, #FF6B35, #E85A2D)` |
| Barres graphique (décoratif V1) | `.chart-bar` (L1023) | `linear-gradient(to top, #FF6B35, #E85A2D)` |
| Halo décoratif hero | `.hero-section::before` (L117) | Cercle 800×800 `rgba(255,107,53,0.10)` |
| Hover zone upload | `.upload-area:hover` (L970) | `rgba(255,107,53,0.05)` |

**Note :** le dégradé violet des pages auth (`#667EEA → #764BA2`) est
**volontairement hors tokens** dans la maquette : seule zone « indigo » du
produit, réservée aux écrans d'authentification. Le conserver tel quel (pas de
remap vers primary/secondary).

### 2.3 Couleurs « soft » encodées en dur (fonds pastel des badges/icônes)

La maquette déclare ces couleurs **en dur** (pas de variables). Elles forment le
système sémantique des statuts — à exposer comme tokens `status.*` dans le code.

| Usage | Fond | Texte/icône | Réf maquette |
|---|---|---|---|
| succès (Disponible, Publié, Payé, approuvé) | `#D1FAE5` | `#00C853` | `.badge-success` L650, `.status-approved` L914, `.notification-icon.success` L1075 |
| info / statut vendu | `#DBEAFE` | `#004E89` | `.badge-info` L655, `.status-sold` L923 |
| en attente / Non payé / warning | `#FEF3C7` | `#D97706` | `.status-pending` L908, `.notification-icon.warning` L1085 |
| refusé | `#FEE2E2` | `#FF1744` | `.status-rejected` L918 |
| icône stat-card bleue | `#DBEAFE` | `#004E89` | `.stat-card-icon.blue` L815 |
| icône stat-card orange | `#FFEDD5` | `#FF6B35` | `.stat-card-icon.orange` L820 |
| icône stat-card verte | `#D1FAE5` | `#00C853` | `.stat-card-icon.green` L825 |
| icône stat-card violette | `#E9D5FF` | `#9333EA` | `.stat-card-icon.purple` L831 |

### 2.4 Typographie (extraite ; une seule famille)

- **Famille** : `'Segoe UI', Tahoma, Geneva, Verdana, sans-serif` (L30).
  `letter-spacing` par défaut partout (aucun suivi spécial dans la maquette).
  Casse : **labels de colonnes de table en `uppercase`** uniquement (`th`, L877) ;
  jamais de capitales sur le corps du texte.
- **Scale type** (tailles exactes) :

| Niveau | Taille / graisse | Usage | Réf |
|---|---|---|---|
| Display marque (hero) | `42px / 700` | Logo ReVends accueil (`.logo h1`) | L155 |
| H1 hero | `36px / lh 1.2` | « Achetez et vendez… » | L163 |
| H1 page produit / confirmation | `32px` | Nom produit fiche, « Article soumis avec succès ! » | L625, L999 |
| Valeur stat-card | `32px / 700` | Chiffres dashboards (`.stat-card-value`) | L835 |
| H2 banner | `32px` | Titre banner catalogue | L451 |
| Logo navbar / sidebar | `28px / 700` | `.nav-container .logo h1` | L382 |
| H1 dashboard / formulaire / profil | `28px` | Titres de page des dashboards, `form-page`, `profile-header` | L769, L934, L1125 |
| H3 section | `24px` | « Articles en vedette », titres de sections | L509 |
| Prix carte produit | `22px / 700` | `.product-info .price` | L558 |
| H3 card | `20px` | `.card-header h3` | L857 |
| Icône catégorie | `40px` | `.category-item i` | L491 |
| Corps | `16px / 400` | Défaut global (boutons compris) | global |
| Sous-corps | `15px` | Titre notification (`.notification-content h4`) | L1090 |
| Petits textes | `14px` | Métadonnées produit, labels tables, dates, seller info, form-options | global |
| Badge | `14px / 600` | `.badge` (L647) ; `.status-badge` = **13px / 600** (L904) | global |
| Mini | `12px` | `.chart-label` (L1043), `.notification-time` (L1101) | admin/notif |
| Boutons | `16px / 600` ; `btn-large` 18px ; `btn-small` 14px | L52, L88, L93 | global |
| Interlignes | `body 1.6` ; hero h2 `1.2` ; paragraphes fiche produit `1.8` | L33, L163, L672 | global |

### 2.5 Espacements — échelle observée (à utiliser strictement)

Échelle : **4 · 5 · 8 · 10 · 12 · 14 · 15 · 16 · 18 · 20 · 24 · 30 · 32 · 40 ·
48 · 60 · 80** (px). Valeurs d'usage clés :

| Utilisation | Valeur | Réf |
|---|---|---|
| Padding carte / stat-card | `24px` | L789, L844 |
| Padding form-section / profile-section | `30px` | L940, L1137 |
| Padding auth-box | `40px` | L217 |
| Padding sidebar / dashboard-content | `30px 20px` / `30px` | L719, L760 |
| Container (contenu central) | max-width `1200px`, padding `40px 20px` | L432 |
| Grille hero | `gap 60px`, 2 colonnes | L134 |
| Grille produits | `gap 24px` (auto-fill `minmax(280px, 1fr)`) | L523 |
| Grille catégories / stats | `gap 20px`, 4 colonnes | L470, L782 |
| Navbar | `gap 12px` entre actions ; search `margin 0 40px` | L389, L409 |
| Form-row | 2 colonnes, `gap 20px` | L954 |
| Hit target minimum | 45px (btn-icon L416), 50px (btn-social L342) | navbar/auth |

### 2.6 Radius

| Radius | Composants |
|---|---|
| `8px` | Boutons `.btn`, boutons du toggle, vignette produit en table (`.product-cell img`), coins hauts chart-bar |
| `10px` | Inputs/select/textarea, `.user-type-toggle`, `.btn-icon`, `.btn-social`, coins search-bar, thumbnails (80px), `.stat-card-icon`, liens sidebar, bandeau info détail commande |
| `12px` | `.upload-area`, `.seller-info` |
| `15px` | `.category-item`, `.product-card`, `.main-image`, `.stat-card`, `.card`, `.form-section`, `.profile-section`, image banner |
| `20px` | `.auth-box`, `.banner`, `.product-detail`, badges pill, `.profile-header` |
| `50%` (cercle) | `.seller-avatar` (60px), `.profile-avatar` (120px), `.success-icon` (120px), `.notification-icon` (40px) |

Motif : **8/10/12 = éléments fins, 15 = cartes, 20 = grands blocs, pill/cercle =
badges et avatars.**

### 2.7 Ombres

| Nom | Valeur exacte | Usage |
|---|---|---|
| `shadow-card` | `0 4px 12px rgba(0,0,0,0.08)` | product-card, category-item, product-detail |
| `shadow-soft` | `0 4px 12px rgba(0,0,0,0.05)` | stat-card, card, form-section, profile-section |
| `shadow-nav` | `0 2px 10px rgba(0,0,0,0.10)` | navbar (sticky) |
| `shadow-floating` | `0 20px 60px rgba(0,0,0,0.30)` | hero-image (L196), auth-box (L218) |
| `shadow-hover` | `0 8px 24px rgba(0,0,0,0.12)` + `translateY(-5px)` | hover product-card, category-item |
| `shadow-btn-hover` | `0 4px 12px rgba(255,107,53,0.40)` + `translateY(-2px)` | hover btn-primary |
| `shadow-toggle-active` | `0 2px 8px rgba(0,0,0,0.10)` | bouton actif du toggle |

### 2.8 Transitions & courbes

| Propriété | Valeur maquette | Application |
|---|---|---|
| Transition générale | `all 0.3s` | boutons, cartes, menu, inputs, badges, nav (défaut de la maquette) |
| Entrée de page | `fadeIn 0.5s ease` : `opacity 0→1` + `translateY(20px→0)` | `.page.active` (L1239–1252) |
| Hover élévation | `translateY(-2px)` (btn) / `translateY(-5px)` (carte) | §2.7 |

**Pour le code (micro-interactions)** : conserver `0.3s` pour les hovers. Sur
mobile/touch, les `translateY` hover n'existent pas → remplacer par **retour
d'appui** `scale 0.97` en press, même durée. Curves : entrée
`cubic-bezier(0.2, 0.8, 0.2, 1)`, sortie `cubic-bezier(0.4, 0, 1, 1)` ; le
`fadeIn` de page est repris tel quel (0.5s ease). Respecter `prefers-reduced-motion`.

### 2.9 Bordures et traits

- Inputs / select / textarea : **`2px solid #E5E7EB`**, focus
  `border-color: #FF6B35` sans outline (`outline: none`, L285–290).
- Séparateurs de table : `1px solid #E5E7EB` ; soulignement des titres de
  section (`.form-section h3`, `.profile-section h3`) : `2px solid #E5E7EB`
  sous le titre (L949, L1143).
- Bouton outline : `2px solid #FF6B35` (L77).

---

## 3. Composants UI

Convention : chaque composant liste (a) la/les classe(s) CSS de la maquette
(référence), (b) la structure visuelle avec les valeurs du §2, (c) les états
(hover/focus/press/disabled) à coder, (d) les notes web/mobile. **Les valeurs
visuelles restent identiques web et mobile (§7) — seul le mécanisme change.**

### 3.1 Bouton `btn` + variantes

Réf : L45–104. Base : `padding 12px 24px; border-radius 8px; font-size 16px;
font-weight 600; display inline-flex; align-items center; gap 8px; transition
all 0.3s; border none; cursor pointer`.

| Variante | Classe | Fond | Texte | Réf |
|---|---|---|---|---|
| Primaire | `.btn-primary` | `#FF6B35` | blanc | L59 |
| Secondaire | `.btn-secondary` | `#004E89` | blanc (login admin, bouton « Modifier ») | L70 |
| Outline | `.btn-outline` | transparent | `#FF6B35` + bordure 2px | L75 |
| Succès | `.btn-success` | `#00C853` | blanc (« Approuver », « Paiement reçu ») | L96 |
| Danger | `.btn-danger` | `#FF1744` | blanc (« Refuser », « Supprimer », « Non payé ») | L101 |

Modificateurs : `.btn-block` (width 100 %, contenu centré, L81) ·
`.btn-large` (padding `16px 32px`, 18px, L86) · `.btn-small` (padding
`8px 16px`, 14px, L91 — tables admin et dashboards).

**États à coder** :
- hover btn-primary : `background #E85A2D` + `translateY(-2px)` + `0 4px 12px
  rgba(255,107,53,0.40)` (L64–68). Hover des autres variantes : assombrir de
  5–8 % par mélange avec le noir (principe design-exceptionnel — la maquette
  ne le définit pas ; dériver de la couleur, sans inventer de teinte).
- focus clavier : anneau `box-shadow 0 0 0 3px rgba(255,107,53,0.40)` (primary
  et outline) — ajout accessibilité, invisible dans la maquette.
- disabled : `opacity 0.5` + `cursor not-allowed`, sans hover/élévation.
- press (mobile) : `scale 0.97`, 0.15s (micro-interactions).

### 3.2 Boutons icônes `btn-icon` / boutons sociaux `btn-social`

- `.btn-icon` (L414) : carré `45×45`, fond `#F7F7F7`, radius `10px`, icône 20px
  `#1A1A2E`. Hover : fond `#FF6B35`, icône blanche (L426–429). Usage : user,
  panier, recherche dans la navbar. Hit target 45px ≥ 44px (OK mobile).
- `.btn-social` (L338) : carré `50×50`, bordure `2px solid #E5E7EB`, radius
  `10px`, icône 20px. Hover : bordure + icône primary + `translateY(-2px)`
  (L352–356). Usage : Google/Facebook sous le formulaire d'auth (style
  conservé ; les providers OAuth réels sont hors périmètre V1).

### 3.3 Formulaire : `form-group` + input/select/textarea + checkbox

Réf : L263–291.

- Label : `font-weight 600`, `#1A1A2E`, `margin-bottom 8px`.
- Input/select/textarea : `width 100%`, `padding 14px`, bordure `2px solid
  #E5E7EB`, radius `10px`, `font-size 16px`, `transition all 0.3s`. **Focus** :
  `outline none` + `border-color #FF6B35` (L287–290). Textarea : `rows 5`
  (L1604).
- Placeholder : `--gray`. `.form-row` : grille 2 colonnes gap 20px (→ 1
  colonne < 968px, L1187).
- Checkbox : 18×18, `gap 8px`, bloc cliquable (L300–311).
- Erreur (ajout, non maquetté) : bordure `2px solid #FF1744` + message
  `--danger` 14px sous le champ.

### 3.4 Toggle user/admin `user-type-toggle`

Réf : L238–261. Piste `#F7F7F7`, radius `10px`, padding `5px`, `margin-bottom
30px` ; chaque bouton `flex 1`, padding `12px`, radius `8px`, `600`. **Actif** :
fond blanc + texte `#FF6B35` + `0 2px 8px rgba(0,0,0,0.10)` (L257–261).
**Décision V2** : le toggle « Utilisateur / Administrateur » navigue entre
`/login` et `/admin/login` — c'est de la **navigation**, pas un état local du
formulaire. Visuel conservé tel quel.

### 3.5 Auth-box (login / register / admin-login)

Réf : `.auth-page` (L200, fond dégradé violet, `min-height 100vh`, centré) →
`.auth-container` (max-width `450px`) → `.auth-box` (L214) : fond blanc,
`padding 40px`, radius `20px`, `0 20px 60px rgba(0,0,0,0.30)`.

Structure interne (haut → bas) :
1. Logo centré : icône 48px primary + « ReVends » 42px/700 (L221–224).
2. `h2` centré (« Bon retour ! ») + sous-texte `--gray` centré, `margin-bottom
   30px`.
3. `.user-type-toggle` (login user uniquement).
4. Formulaire (form-groups, form-options, bouton submit `.btn-block`).
5. `.auth-footer` (texte gris + lien primary 600) ; `.social-login`
   (`gap 12px`, `margin-top 24px`, centré).
6. Variantes : login user = « Se souvenir de moi » + « Mot de passe oublié ? »
   (**décoratif V1** → clic affiche « Contactez l'équipe », CA-AUTH02-05) ;
   register = case CGU **obligatoire bloquante** (L1357) ; admin-login = pas de
   toggle, submit `btn-secondary btn-block`, lien « Retour à l'application ».

### 3.6 Navbar `navbar` (+ logo, search-bar, nav-actions)

Réf : L359–429. Fond blanc, `padding 15px 0`, `position sticky; top 0`,
`z-index 100`, `shadow-nav` (0 2px 10px rgba(0,0,0,0.10)).

- Conteneur max-width `1200px`, padding `0 20px`, `justify-content
  space-between`.
- **Logo** : icône 48px primary + titre 28px/700 ; cliquable → accueil.
- **Search-bar** (L385) : `flex 1`, max-width `500px`, `margin 0 40px`. Input
  `flex 1`, padding `12px 20px`, bordure 2px `#E5E7EB`, radius
  `10px 0 0 10px` ; bouton fond `#FF6B35`, icône blanche, radius
  `0 10px 10px 0` (L392–407). Hover bouton : `#E85A2D`. < 968px : pleine
  largeur sous le logo (ordre 3, L1195–1200).
- **Nav-actions** : `.btn-icon` × 2 (user, panier). Connecté : le bouton user
  devient avatar + pseudo (dérivé, non maquetté — conserver la forme ronde 45px
  et un menu déroulant).

### 3.7 Sidebar `sidebar` + `sidebar-menu`

Réf : L716–756. Fond `#1A1A2E` uni, `padding 30px 20px`, colonne `260px`
(`.dashboard-layout` L710 : `grid-template-columns 260px 1fr`, min-height
100vh). Logo en haut (icône + titre, `margin-bottom 40px`).

- Liens : `padding 14px 16px`, `gap 12px`, texte `rgba(255,255,255,0.8)`,
  icône 20px / `width 24px`, radius `10px`, `transition all 0.3s`.
- **Hover et actif** : fond `#FF6B35`, texte blanc (L746–750). Un seul lien
  `active` par écran.
- Mobile : layout 1 colonne (L1168–1174) → prévoir collapse en drawer
  (recommandation §7), valeurs visuelles identiques.
- Structure de menus (maquette) : user = Tableau de bord, Mes commandes, Mes
  articles, Revendre un article, Mes favoris*, Notifications, Profil,
  Déconnexion. Admin = Dashboard, Articles en attente, Articles, Commandes,
  Paiements vendeurs, Utilisateurs, Statistiques*, Déconnexion. Historique et
  Notifications existent aussi en sidebar dédiée (L2276–2282). *favoris /
  statistiques = décoratifs V1.

### 3.8 Carte `card` + `card-header` + table

Réf : `.card` L842, `.card-header` L850, table L866–926. Fond blanc, radius
`15px`, padding `24px`, `0 4px 12px rgba(0,0,0,0.05)`, `margin-bottom 24px`.

- `.card-header` : flex space-between, `margin-bottom 20px`, h3 20px + lien
  `.view-all` (primary, 600, L514).
- **Table** (`.table-container` overflow-x auto, L862) :
  - `th` : uppercase, 14px, 600, `#6B7280`, padding 16px, bas de case
    `1px solid #E5E7EB`.
  - `td` : padding 16px, bordure basse `#E5E7EB`.
  - `tr:hover` : fond `#F7F7F7` (L884–886).
  - `.product-cell` (L888) : `flex gap 12px`, img `50×50` radius `8px` ;
    variante dashboards = 2 lignes dans la cellule (nom + prix en small gris,
    L1775–1778).
- États : ligne cliquable → hover fond + curseur pointer.

### 3.9 Status-badge `status-badge` + variantes

Réf : L901–926. Pill : `padding 6px 12px`, radius `20px`, `font-size 13px/600`.

| Variante | Pastel | Texte | Libellés dans la maquette |
|---|---|---|---|
| `status-pending` | `#FEF3C7` | `#D97706` | « En attente », « En cours », « Non payé » |
| `status-approved` | `#D1FAE5` | `#00C853` | « Disponible », « Publié », « Payé », « Livrée »* |
| `status-rejected` | `#FEE2E2` | `#FF1744` | « Refusé » |
| `status-sold` | `#DBEAFE` | `#004E89` | « Vendu » |

\* « Livrée » et « En cours » sont **décoratifs hors périmètre V1** (cahier
§4.2). Libellés V1 « Mes commandes » : `En attente de paiement`, `Paiement
confirmé`, `Terminée`, `Expirée` (CA-BUY03-01) — **mêmes pastels** : pending
pour attente/expirée, approved pour confirmé/terminée.

**Mapping statuts V1 → badge** (feuille de référence frontend) :

| Statut V1 | Badge / libellé | Côté |
|---|---|---|
| produit PENDING | `status-pending` « En attente » | vendeur |
| produit AVAILABLE | `status-approved` « Publié » | vendeur |
| produit RESERVED | `status-pending` « Réservé » | vendeur |
| produit SOLD | `status-sold` « Vendu » | vendeur |
| produit REJECTED | `status-rejected` « Refusé » (+ raison affichée) | vendeur |
| commande WAITING_PAYMENT | `status-pending` « En attente de paiement » | acheteur |
| commande PAYMENT_FAILED | `status-pending` « Expirée » | acheteur |
| commande WAITING_SELLER_PAYMENT | `status-approved` « Paiement confirmé » | acheteur |
| commande COMPLETED | `status-approved` « Terminée » | acheteur |
| payout vendeur | `status-pending` « Non payé » / `status-approved` « Payé » | admin |

### 3.10 Stat-card `stat-card`

Réf : L786–839. `.stats-grid` : 4 colonnes gap 20px (`repeat(2, 1fr)` < 968px,
L1183). Carte : fond blanc, padding `24px`, radius `15px`, `0 4px 12px
rgba(0,0,0,0.05)`.

- `.stat-card-header` : flex space-between, `margin-bottom 12px` ; titre 14px
  `#6B7280` ; `.stat-card-icon` carré `40×40` radius `10px`, icône 20px.
- Variantes d'icône : blue `#DBEAFE/#004E89`, orange `#FFEDD5/#FF6B35`, green
  `#D1FAE5/#00C853`, purple `#E9D5FF/#9333EA` (L815–833).
- `.stat-card-value` : `32px/700` `#1A1A2E`.
- Contenu V1 — user : Mes commandes (blue), Mes articles (orange), En attente
  (purple), Vendus (green). Admin : Utilisateurs (blue), Articles en attente
  (orange), Commandes (purple), Paiements en attente (green). Compteurs
  recalculés à chaque chargement (CA-ADM01-01/02).

### 3.11 États vides / chargement / erreur (non maquettés — spec minimale)

La maquette ne contient pas ces états. Spec de base **dans le style de la
maquette** (à valider par le frontend) :
- **Vide** : carte blanche `.card` centrée, icône 48px `#E5E7EB`, titre 20px
  `--dark`, texte 14px `--gray`, CTA optionnel `btn-primary btn-small`.
- **Chargement** : squelettes aux formes/ratios des vraies cartes
  (`product-card`, `stat-card`), fond `#E5E7EB`, pulse doux opacity
  0.4↔0.8 / 1.2s.
- **Erreur** : alerte inline fond `#FEE2E2`, texte `--danger`, radius `10px`,
  padding `14px` (dérivé du pastel refus, sans teinte hors gamme).

### 3.12 Product-card `product-card`

Réf : L528–575. Fond blanc, radius `15px`, `overflow hidden`, `0 4px 12px
rgba(0,0,0,0.08)`, cliquable. Hover : `translateY(-5px)` + `0 8px 24px
rgba(0,0,0,0.12)` (L537–540).

- Image : `width 100%`, `height 220px`, `object-fit cover`.
- `.product-info` : padding `20px`. `h4` 18px `#1A1A2E` ; `.price` `22px/700`
  `#FF6B35`, `margin-bottom 12px` ; `.product-meta` flex space-between 14px
  gris : étoile + note (icône `#FFD600`) **décoratif** (cahier §4.2 — en V1,
  remplacer la note par le lieu seul ou le badge état) + pin + localisation.
- Contenu V1 carte (CA-CAT01-03) : photo principale, nom, prix (FCFA),
  localisation.

### 3.13 Fiche produit `product-detail`

Réf : L578–707. Bloc blanc, radius `20px`, padding `40px`, `0 4px 12px
rgba(0,0,0,0.08)`, grille 2 colonnes `gap 40px` (→ 1 colonne < 968px,
L1169–1174).

- **Galerie** (`.product-gallery`, `flex column gap 15px`) :
  - `.main-image` : radius `15px`, `overflow hidden`, img `width 100%`,
    `height 400px`, `object-fit cover` (L600).
  - `.thumbnail-images` : `flex gap 10px`, img `80×80` radius `10px`,
    bordure `2px solid transparent`. Hover/active : `border-color #FF6B35`
    (L621–623). Clic → devient image principale.
- **Infos** (`.product-details`) :
  - `h1` 32px ; `.price` `36px/700` `#FF6B35`, `margin-bottom 20px` (L630).
  - `.product-badges` : `flex gap 10px`, `margin-bottom 20px` ; badge état
    `badge-success` / badge dispo `badge-info` (pill, §3.9).
  - `.product-info-section` : `margin-bottom 30px`, `h3` + paragraphe `#6B7280`
    `line-height 1.8` (L669).
  - `.seller-info` (L674) : fond `#F7F7F7`, padding `20px`, radius `12px`,
    `flex align-center gap 15px`, `margin-bottom 30px`. Avatar `60×60` cercle ;
    `h4` + 14px gris.
  - `.action-buttons` : `flex gap 15px`, boutons `flex 1` → colonne < 640px
    (L1216). Maquette : « Acheter maintenant » (primary, large) + outline cœur
    (**favori décoratif** V1 — en V1 : « Acheter » seul, désactivé si
    RESERVED/SOLD, badge « Réservé »/« Vendu », CA-CAT03-03).
- Info vendeur V1 (D2, CA-CAT03-02) : **pseudo** + « Membre depuis <année> » +
  « N ventes » — jamais de nom complet/coordonnées.

### 3.14 Banner `banner`

Réf : L439–465. Dégradé `linear-gradient(135deg, #004E89 0%, #1A1A2E 100%)`,
radius `20px`, padding `40px`, `margin-bottom 40px`, grille 2 colonnes `gap
40px`, `align-items center`, texte blanc. `h2` 32px (`margin-bottom 10px`), `p`
18px `opacity 0.9` (`margin-bottom 20px`), CTA `btn-primary`, image radius
`15px` (→ 1 colonne < 968px, L1175). Usage : haut du catalogue.

### 3.15 Catégories `categories` + `category-item`

Réf : L468–499. Grille 4 colonnes gap 20px (→ 2 < 968px, → 1 < 640px).
`.category-item` : fond blanc, padding `30px`, radius `15px`, centré,
`0 4px 12px rgba(0,0,0,0.08)`, cliquable. Hover : `translateY(-5px)` +
`0 8px 24px rgba(0,0,0,0.12)`. Icône 40px `#FF6B35` (`margin-bottom 12px`) +
libellé `600` `#1A1A2E`. Catégories maquette : Mode, Maison, Électronique,
Électroménager — V1 : catégories **actives** de la base (D7), 5 seed.

### 3.16 Upload-area `upload-area`

Réf : L959–977. Bordure `2px dashed #E5E7EB`, radius `12px`, padding `40px`,
centré, cliquable. Hover : `border-color #FF6B35` + fond `rgba(255,107,53,0.05)`.
Icône 48px `#FF6B35` (`margin-bottom 12px`) + texte. V1 (RG-MEDIA-1) : 1 à 4
photos, JPEG/PNG/WebP, ≤ 5 Mo, 1re = photo principale.

### 3.17 Confirmation `confirmation-page`

Réf : L979–1010. Centré, `padding 80px 20px`. `.success-icon` : cercle `120×120`
fond `#00C853`, icône 60px blanche, `margin 0 auto 30px`. `h1` 32px, `p` 18px
`#6B7280` max-width `500px` centré, `margin-bottom 30px`, CTA
`btn-primary btn-large`. Texte maquette : « Article soumis avec succès ! ».

### 3.18 Chart (décoratif V1) `chart-container` / `chart-bar` / `chart-label`

Réf : L1013–1050. **Statistiques avancées = hors périmètre V1** (cahier §4.2).
Style conservé pour référence ultérieure : conteneur `height 300px` flex
align-end space-around ; `.chart-bar` `width 60px`, dégradé vertical primary →
primary-dark, radius `8px 8px 0 0`, hauteur en % inline, valeur via
`data-value` en `::after` (14px/600, top -25px), `.chart-label` 12px gris
(bottom -30px), hover opacity 0.8. Ne pas l'implémenter en V1 (le dashboard
admin V1 n'affiche que les 4 compteurs).

### 3.19 Notification-item `notification-item`

Réf : L1053–1104. `flex gap 15px`, `padding 16px`, `border-bottom 1px solid
#E5E7EB`, `transition all 0.3s`. Hover : fond `#F7F7F7`. `.notification-icon` :
cercle `40×40`, icône centrée — variantes success `#D1FAE5/#00C853`, info
`#DBEAFE/#004E89`, warning `#FEF3C7/#D97706` (L1075–1087).
`.notification-content` : `h4` 15px (`margin-bottom 4px`) + `p` 14px gris +
`.notification-time` 12px gris `margin-top 4px`. Usage : liste des
notifications in-app (US-NOT-01) et page Historique admin — mêmes visuels, en
V1 les notifications ont un marqueur « non lue » (badge dérivé, pas de pastel
inventé : puce `#FF6B35` 8px).

### 3.20 Profile `profile-header` + `profile-section` + `profile-info-row`

Réf : L1107–1165.
- `.profile-header` : dégradé primary → primary-dark, radius `20px`, padding
  `40px`, centré, texte blanc, `margin-bottom 30px`. Avatar `120×120` cercle,
  `border 5px solid #FFFFFF`, `margin-bottom 20px` ; `h1` 28px ; `p` opacity 0.9.
- `.profile-section` : comme `.card` (fond blanc, radius 15px, padding 30px,
  ombre 0.05), `h3` souligné `2px solid #E5E7EB` (L1142–1145).
- `.profile-info-row` : flex space-between, `padding 12px 0`,
  `border-bottom 1px solid #E5E7EB` (aucun sur la dernière ligne) ; label
  `--gray`, valeur `600`.
- (Remarque : les classes « Adresse de livraison », « Changer le mot de
  passe »… sont des zones non développées en V1 — conserver le style de liste,
  désactiver ou relier aux routes V1.)

### 3.21 Layout dashboard `dashboard-layout` / `sidebar` / `dashboard-content`

Réf : L710–783. Grille `260px 1fr`, `min-height 100vh`. `.dashboard-content` :
fond `#F7F7F7`, `padding 30px`. `.dashboard-header` : flex space-between,
`align-items center`, `margin-bottom 30px` ; `h1` 28px ; `.date-display` 14px
`#6B7280`. Mobile : 1 colonne + drawer sidebar (§7).

### 3.22 Hero accueil `hero-section` / `hero-container` / `hero-content`

Réf : L107–197. Dégradé `#1A1A2E → #004E89` 135°, min-height 100vh, centré,
`padding 40px`, `overflow hidden` + halo orange `rgba(255,107,53,0.10)` en
`:before`. Conteneur max-width 1200px, 2 colonnes `gap 60px`.
`.hero-content` : logo (icône 48px + titre 42px, `margin-bottom 30px`), `h2`
36px/lh 1.2 (`margin-bottom 30px`), `.features-list` (li 18px, icônes 20px
`#FF6B35`, `padding 12px 0`, `margin-bottom 40px`), `.hero-buttons`
(`flex gap 16px`, colonne < 640px). `.hero-image img` : `width 100%`, radius
`20px`, `0 20px 60px rgba(0,0,0,0.30)`.

### 3.23 Section-header / view-all / logo / utilitaires

- `.section-header` (L502) : flex space-between, `margin-bottom 24px`, `h3` 24px.
- `.view-all` (L514) : lien `#FF6B35` 600 (hover : `--primary-dark`).
- `.logo` (L143) : `flex align-center gap 12px` ; icône 48px `#FF6B35`.
- Utilitaires maquette : `.text-center`, `.mb-20`, `.mt-20`, `.hidden`
  (L1221–1236).
- Icônes : Font Awesome 6.4.0 (L7) — `fa-shopping-bag` (logo), `fa-search`,
  `fa-user`, `fa-shopping-cart`, `fa-star`, `fa-map-marker-alt`, `fa-tshirt`,
  `fa-couch`, `fa-mobile-alt`, `fa-plug`, `fa-check`, `fa-times`, `fa-check-circle`,
  `fa-plus-circle`, `fa-heart`, `fa-bell`, `fa-box`, `fa-home`, `fa-clock`,
  `fa-edit`, `fa-trash`, `fa-money-bill`, `fa-users`, `fa-chart-line`,
  `fa-history`, `fa-sign-out-alt`, `fa-cloud-upload-alt`, `fa-info`,
  `fa-exclamation`, `fa-cart-plus`.

---

## 4. Parcours UI/UX

### 4.1 Flux principaux

1. **Visiteur → achat** : Accueil (`/`) → Catalogue (`/catalogue`, consultation
   libre, CA-CAT01-05) → Fiche (`/catalogue/:slug`) → bouton « Acheter » →
   connexion si non connecté (D10 : retour automatique sur la fiche) → commande
   créée (produit RESERVED 5 jours) → « Mes commandes » suit le statut. Un
   article RESERVED/SOLD : bouton désactivé + badge (CA-CAT03-03).
2. **Vendeur → revendre** : Connexion → Sidebar « Revendre un article »
   (`/vendre`) → formulaire en 3 sections (infos générales → photos →
   description) → bouton « Suivant » → page Confirmation « Article soumis avec
   succès » (N1) → « Mes articles » suit PENDING → AVAILABLE/RESERVED/SOLD /
   REJECTED (+ raison) (US-SELL-02). Modification : repasse PENDING (D9).
3. **Admin → modération → paiements** : `/admin/login` → Dashboard (4 compteurs)
   → « Articles en attente » (Approuver / Refuser + motif obligatoire) →
   « Commandes » + détail (CMD-%06d, boutons « Paiement reçu » ; « Non payé »
   = état seulement, CA-ADM03-04) → « Paiements vendeurs » (prix − 10 %
   commission → « Payer le vendeur ») → Historique horodaté. Notifications
   in-app à chaque étape (N1…N8, §10 cahier).

### 4.2 Mapping pages maquette → routes React

| Page maquette | Route proposée | Composants clés |
|---|---|---|
| `page-accueil` | `/` | hero, features, CTA |
| `page-login` | `/login` | auth-box, toggle (lien `/admin/login`), form-options |
| `page-register` | `/register` | auth-box, case CGU bloquante |
| `page-admin-login` | `/admin/login` | auth-box, btn-secondary |
| `page-catalogue` | `/catalogue` | navbar+search, banner, categories, products-grid |
| `page-product-detail` | `/catalogue/:slug` | product-detail complet |
| `page-sell-form` | `/vendre` | form-page (3 form-sections) + upload-area |
| `page-confirmation` | `/confirmation` | success-icon + texte |
| `page-dashboard-user` | `/dashboard` | sidebar, stats-grid, card « Derniers articles » (table) |
| `page-user-articles` | `/mes-articles` | table Article/Prix/Statut/Actions (édit/suppr.) |
| `page-user-orders` | `/mes-commandes` | table Commande/Date/Article/Prix/Statut |
| `page-notifications` | `/notifications` | notification-items + badge non lues |
| `page-profile` | `/profil` | profile-header + profile-sections |
| `page-admin-dashboard` | `/admin` | stats-grid (4 compteurs) — sans chart V1 |
| `page-admin-pending` | `/admin/articles-en-attente` | table + Approuver/Refuser |
| `page-admin-orders` | `/admin/commandes/:id` | bandeau commande + info rows + actions |
| `page-admin-payments` | `/admin/paiements` | table + « Payer le vendeur » |
| `page-history` | `/admin/historique` | notification-items horodatés |
| (à prévoir) | `/admin/articles`, `/admin/utilisateurs`, `/admin/categories` | tables (style `card`) |

Protection : `/dashboard*`, `/profil`, `/notifications`, `/mes-*` réservées aux
utilisateurs connectés ; `/admin*` à l'admin (403 sinon, CA-AUTH02-04). Les
routes non prévues dans la maquette (utilisateurs, catégories) reprennent les
composants existants (card + table + status-badge).

---

## 5. Fonctions décoratives hors périmètre V1 (style conservé)

La spec V2 (cahier §4.2 + §11) désigne ces éléments de la maquette comme
**non développés en V1**. Ils ne deviennent PAS des exigences design ; leur
style reste décrit ci-dessus pour référence.

| Élément maquette | Exigence V2 | Comportement V1 |
|---|---|---|
| Étoiles/notes sur cartes produit (`fa-star`) | Avia/notation hors périmètre | Ne pas afficher la note ; garder la carte photo/nom/prix/localisation |
| Cœur favoris (fiche produit) + entrée sidebar « Mes favoris » | Favoris hors périmètre | Absents de l'UI V1 |
| Graphique « Ventes 7 derniers jours » | Stats avancées hors périmètre | Dashboard admin = 4 compteurs |
| Statut « Livrée » / « En cours » (Mes commandes) | Livraison hors périmètre | Libellés V1 : en attente / confirmé / terminée / expirée |
| « Mot de passe oublié ? » | Hors périmètre (CA-AUTH02-05) | Lien conservé → message « Contactez l'équipe » |
| Bouton « Non payé » (détail commande) | Pas d'action d'annulation (CA-ADM03-04) | Affichage d'état uniquement, jamais d'action |
| Boutons sociaux Google/Facebook | OAuth hors périmètre | Style conservé ; non fonctionnels ou masqués selon décision PO |
| Case « Se souvenir de moi » | Session 7 jours systématique | Champ conservé visuellement, sans effet distinct en V1 |

---

## 6. Recommandations d'amélioration (sans dévier de la maquette)

Ces points améliorent le produit **sans changer les valeurs visuelles** de la
maquette : ils ajoutent des comportements, pas des styles alternatifs.

### 6.1 Micro-interactions (à appliquer sur le « ressenti », jamais sur les valeurs)
- **Appui** : press `scale 0.97` en 0.15s sur tous les boutons/cartes (mobile &
  desktop souris). Retour élastique au relâcher.
- **Élévation hover** : déjà dans la maquette (translateY −2px/−5px + ombre).
  Uniformiser `0.3s` et la courbe d'entrée `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- **Entrée de page** : conserver le `fadeIn 0.5s ease` (+20px) de la maquette ;
  en navigation interne, cascade subtile des cartes (décalage 8–12ms par carte,
  uniquement à l'entrée, pas au scroll).
- **Succès** : l'icône de confirmation (`.success-icon`) apparaît en scale
  0.8→1 + fade en 0.3s ; évolution des compteurs dashboard 0→n en 0.4s par
  paliers de 1000.
- **Notifications** : apparition en scale + fade discret (0.2s), badge non-lu
  animé à la lecture. Jamais d'animation en boucle ; respecter
  `prefers-reduced-motion` (tout désactiver sauf opacity).
- Rien d'autre n'anime : un seul mouvement par moment (anti-bling-bling).

### 6.2 Accessibilité (ajouts invisibles visuellement)
- **Contrastes mesurés** (WCAG — calculs faits sur les hex exacts) :
  - AA validé : `#1A1A2E`/blanc (17.06), `#004E89`/blanc (8.57), `#6B7280`/blanc
    (4.83), `#004E89`/`#DBEAFE` (7.02), blanc/`#1A1A2E` sidebar (17.06),
    `#FFD600`/`#1A1A2E` (12.08).
  - **Sous le seuil AA en petit texte** (valeur dans la maquette, à connaître) :
    `#FF6B35`/blanc = 2.84 (prix 22px/700 → OK en « grand texte » ≥ 19px bold ;
    mais liens orange 14–16px non bold → faibles), `#00C853`/`#D1FAE5` = 1.97
    (texte des badges 13px), `#D97706`/`#FEF3C7` = 2.86, `#FF1744`/`#FEE2E2` =
    3.15, blanc/`#FF6B35` btn = 2.84.
  - **Décision de fidélité** : reproduire la maquette telle quelle en V1
    (source de vérité), et signaler ces 4 paires au chef de projet ; si AA est
    exigé, seule alternative SANS déviation visible pour les badges : ajouter
    une pastille icône + garder le pastel (le pastel et le pictogramme rendent
    le sens lisible même à contraste réduit) ou assombrir les teintes texte de
    badges d'un cran exact (`#008A3B` pour succès, `#B45309` pour pending) —
    à valider par le PO, jamais en autonome.
- **Focus clavier** : anneau visible 2–3px autour des boutons, liens, inputs,
  tabs (couleur = celle du composant, ex. `rgba(255,107,53,0.4)`).
- **Navigation clavier** : sidebar = liste de liens focusables ; tables =
  lecture TAB ; modales (refus motiver) = focus trap + Échap.
- **Formulaires** : chaque input a un `label` lié (`htmlFor`/`id`) ; erreurs
  `role="alert"` liées à l'input (`aria-describedby`).
- **Images** : `alt` descriptif (déjà présent dans la maquette, L1425…).
- **AT** : les `th` ont `scope="col"` ; les boutons icônes ont
  `aria-label` (« Rechercher », « Profil », « Panier »).
- **Hit targets** : mini 44px (l'existant 45/50px est conforme ; le lien
  « Voir tout » et les liens sidebar sont ≥ 44px de hauteur cliquable via leur
  padding).

### 6.3 Responsive (compléter les breakpoints existants 968/640)
- Maquette : < 968px → 1 colonne (hero, banner, product-detail,
  dashboard-layout), 2 colonnes (categories, stats, form-row), search-bar en
  pleine largeur ; < 640px → hero-buttons, action-buttons, categories,
  products-grid en 1 colonne.
- **Ajouts sans déviation** : dashboard → sidebar en overlay/drawer (fond
  `#1A1A2E`, même style), bouton burger reprenant `.btn-icon` ; tables →
  conservées avec scroll horizontal (`.`table-container` overflow-x` déjà
  présent) ; navbar sticky conservée.
- Mobile natif (hors V1 webs) : barre d'onglets inférieure reprenant les 5
  entrées principales (Accueil, Catalogue, Vendre, Commandes, Profil), safe
  areas `env(safe-area-inset-*)`, hit targets ≥ 44px, thumbnails ≥ 64px.

---

## 7. Identique web/mobile vs adapté

**Identique (tokens — ne jamais changer entre plateformes)** : palette §2.1–2.3,
dégradés §2.2, échelle d'espacement §2.5, radius §2.6, ombres §2.7 (via
`shadowOffset/shadowOpacity/shadowRadius` + `elevation` Android), typo §2.4
(familles système RN : `System` iOS, `Roboto` Android ≈ Segoe UI), transitions
§2.8, badges §3.9, statuts §3.9.

**Adapté (mécanismes seulement)** : hover → press scale 0.97 ; layout
`grid/flex` → RN `flex` + `gap` ; ombres → RN shadows/elevation ; sticky navbar
→ header fixe natif ; sidebar → drawer ; curseur pointer → feedback tactile ;
dégradés → `expo-linear-gradient` (ou image si contrainte), mêmes hex/stops.

---

## 8. Auto-revue — cohérence du design system (contrôle écart-zéro)

1. **Toutes les couleurs du document proviennent de la maquette** : 11 tokens
   `:root` (§2.1) + 12 teintes en dur (§2.3) + 7 dégradés (§2.2). Aucune valeur
   inventée : les seules suggestions hors maquette (variantes hover,
   `#008A3B`/`#B45309`, pastel erreur) sont **explicitement marquées** comme
   ajouts à valider (§3.1, §6.2, §3.11).
2. **Classes vérifiées une à une** : chaque composant §3 cite sa classe
   maquette (`.btn-primary`, `.status-badge`, `.product-card`…) avec ligne de
   référence ; j'ai recoché chaque bloc CSS pendant la lecture (L45–1252).
3. **Scale** : toutes les valeurs de padding/gap/taille listées existent dans
   l'échelle §2.5 ; toute valeur serait un écart. Radius/ombres : listes
   fermées §2.6/§2.7.
4. **Contrastes déclarés, pas supposés** : ratios calculés (§6.2), paires
   limites identifiées.
5. **Périmètre respecté** : les 6 fonctions décoratives (favoris, étoiles,
   chart, « Livrée », mot de passe oublié, « Non payé » action) sont
   documentées §5 comme hors V1 — conformes au cahier §4.2 et §11.
6. **Écarts résiduels (signalés honnêtement)** : états error/empty/loading,
   erreurs de formulaire, focus clavier, drawer mobile n'existent pas dans la
   maquette → spécifiés comme ajouts dans le style de la maquette (§3.11,
   §6.2, §6.3) ; la police exacte dépendra de la pile (Segoe UI n'existe pas
   sur Android → Roboto garantit le même rendu visuel).

**DoD design-system** : maquette lue intégralement (2492 lignes) ✔ · tokens
extraites à la valeur exacte ✔ · composants listés avec réf CSS + états ✔ ·
mapping 18 pages → routes ✔ · décoratifs V1 isolés (§5) ✔ · contrastes calculés
✔ · aucun code React produit, maquette non modifiée ✔.

*À recetter par `@frontend` : chaque composant implémenté doit correspondre aux
valeurs §2/§3 ; chaque couleur utilisée doit exister dans le token store.*