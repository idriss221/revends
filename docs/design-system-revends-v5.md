# DESIGN SYSTEM — ReVends 2026 (direction artistique intégrale)

| | |
|---|---|
| **Projet** | ReVends — marketplace de seconde vie (Côte d'Ivoire) |
| **Document** | `docs/design-system-revends-v5.md` — v1.0, **PRIME** sur `docs/design-system.md` §2 et sur `docs/spec-admin-v5-design.md` §2.2 (noms de tokens) |
| **Auteur** | `@design` — direction visuelle & UX |
| **Destinataires** | `@frontend` (web React 19 + Vite 7 + Tailwind v4, `revends/web`) |
| **Sources** | `web/src/index.css` · `web/src/components/{ui,layout,catalog,home,sales,sell}` · `web/src/pages/*` · `docs/design-system.md` · `docs/spec-accueil-v3-design.md` · `docs/spec-admin-v5-design.md` · `docs/cahier-des-charges-v5.md` (US-V5-03, US-V5-06, ARB-V5-03/04/05) |
| **Ne change pas** | Routes, contrats API, vocabulaire métier, règles métier (commission 10 %, 12 statuts, `deleted_at`, suppression admin-only, **retrait de « Contacter le vendeur »**). Ce document ne décrit **que** la couche visuelle. |
| **DoD** | §1 token collé tel quel dans `index.css` ; §2→§9 applicables sans décision supplémentaire. Les 50 écrans de §4 sont couverts. Zéro hex hors palette, zéro `style={{}}` métier. |

## 0. Principes

1. **Éditorial, pas catalogue.** Le produit raconte une histoire (seconde vie) ; l'interface est un magazine : typographie display, respiration, une seule idée par écran.
2. **60 / 30 / 10.** 60 % Warm Ivory + blanc (surfaces) · 30 % Charcoal / Chocolat (texte, structure) · 10 % Terracotta (action, prix, actif) — **parcimonie stricte** : la Terracotta n'est jamais un aplat de fond, seulement un point d'attention.
3. **Le prix est le héros.** Tout prix est Terracotta et en corps gras ; jamais de lien Terracotta en petit texte (voir §8, contrastes mesurés).
4. **Photo d'abord.** Sur une carte produit, la photo occupe ≥ 60 % de la surface. Le texte est une légende, pas un paragraphe.
5. **Chaleur, pas clinquant.** Ni dégradé décoratif, ni glassmorphism, ni néon, ni ombre dure. Profondeur par ombre douce directionnelle (`23,21,19` — jamais du noir pur).
6. **Une décision = un token.** Toute couleur, taille, rayon, ombre, durée vient de §1. Un écran qui n'est pas dans ce document est une invention.
7. **Le geste avant le texte.** Les correspondances d'état (vide, chargement, erreur) se lisent en 1 seconde : icône + 1 titre + 1 phrase + 1 action.

---

## 1. Tokens — à coller dans `web/src/index.css`

### 1.1 Bloc `@theme` complet (remplace l'existant lignes 7–85)

```css
@theme static {   /* `static` : toutes les variables sont émises dans :root, même celles utilisées via var() dans @layer */
  /* ── Surfaces & texte (60 %) ─────────────────────────────── */
  --color-ink: #171513;   --color-ink-2: #241E1A;   /* Charcoal : texte, navbar, footer, sidebar admin · survol = ink-2 */
  --color-ivory: #F7F3EC; --color-white: #FFFFFF;    /* fond de page · cartes, surfaces, modales */
  --color-chocolate: #3A2923;                       /* titres secondaires, nav, texte sur fond doux */
  --color-muted: #7B6D5D;   /* texte secondaire — AA sur blanc (5.91) ET ivoire (4.53) */
  --color-faint: #A2958A;   /* décoratif / disabled / icône non porteuse d'info — jamais du texte */
  --color-line: #E6DED0;    --color-line-strong: #9A8A70;  /* séparateur (décoratif) · bordure de champ (3.36:1, 1.4.11) */

  /* ── Accent secondaire (30 %) ─────────────────────────────── */
  --color-champagne: #DCC8A8;        /* aplat, filet, icône sur fond sombre (11.16:1) */
  --color-champagne-soft: #F1E7D5;   /* bande de section, badge « en attente » (chocolate 11.26:1) */
  --color-champagne-deep: #B39C6E;   /* bordure/icône sur champagne-soft (décoratif) */

  /* ── Accent principal (10 %) — la seule couleur d'action ──── */
  --color-terracotta: #C85A2A;        /* marque, aplat décoratif, badge, PRIX ≥ 19px/700 (4.24 = grand texte) */
  --color-terracotta-strong: #B84D20; /* FOND du bouton primaire (blanc 5.10:1) + pressé */
  --color-terracotta-ink: #A9471F;   /* TOUT texte Terracotta < 19px (5.82:1 blanc / 5.26:1 ivoire) */
  --color-terracotta-deep: #8C3817;  --color-terracotta-soft: #F8E7DC;  /* survol de lien · fond de badge */
  --color-terracotta-wash: rgba(200, 90, 42, 0.08);   --color-terracotta-glow: rgba(200, 90, 42, 0.25);  /* survol de tuile · halo du CTA */

  /* ── États (jamais décoratifs) ───────────────────────────── */
  --color-positive: #2F6B4F;  --color-positive-dark: #24573F;  --color-positive-soft: #E1EFE6;  /* payé, livré, réussi (5.30:1) */
  --color-danger: #A32C22;    --color-danger-dark: #86211A;    --color-danger-soft: #F7E4E1;     /* erreur, suppression (5.83:1) */
  /* « En attente / attention » = champagne-soft + chocolate (11.26:1). Pas d'ambre dans la palette. */

  /* ── Texte sur fond sombre (navbar, footer, sidebar) ───────── */
  --color-on-dark: #F7F3EC;  --color-on-dark-muted: #B5A899;  --color-on-dark-accent: #E08A5F;  /* 16.47 · 7.83 · 6.91 :1 */

  --color-overlay: rgba(23, 21, 19, 0.55);   /* voile modale / drawer */

  /* ── Rayons (12 → 20) ─────────────────────────────────────── */
  --radius-sm: 12px;   /* badge, chip, vignette, mini-carte */
  --radius-md: 16px;   /* carte, champ, bouton, section */
  --radius-lg: 20px;   /* modale, tuile catégorie, hero panel */

  /* ── Ombres (Charcoal, jamais noir) ───────────────────────── */
  --shadow-xs: 0 1px 2px rgba(23, 21, 19, 0.05);
  --shadow-sm: 0 2px 8px rgba(23, 21, 19, 0.06);    /* cartes au repos */
  --shadow-md: 0 8px 24px rgba(23, 21, 19, 0.10);   /* survol carte, barre de filtre */
  --shadow-lg: 0 18px 48px rgba(23, 21, 19, 0.16);  /* modale, bottom sheet */
  --shadow-nav: 0 1px 0 rgba(23,21,19,.07), 0 4px 16px rgba(23,21,19,.06);   --shadow-cta: 0 6px 20px rgba(200,90,42,.25);
  --shadow-focus: 0 0 0 3px rgba(200, 90, 42, 0.35);  --shadow-focus-dark: 0 0 0 3px rgba(247, 243, 236, 0.50);

  /* ── Typographie ───────────────────────────────────────────── */
  --font-sans: "Plus Jakarta Sans", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: "DM Serif Display", "Playfair Display", Georgia, serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, monospace;   /* n° de commande, n° de suivi */

  /* ── Conteneurs ────────────────────────────────────────────── */
  --container-content: 1280px;  --container-wide: 1440px;  /* pages publiques · admin */
  --container-form: 800px;      --container-read: 680px;   /* vendre / paramètres · texte éditorial */

  /* ── Breakpoints (1440 / 1280 / 1024 / 834 / 768 / 640) ────── */
  --breakpoint-3xl: 1440px;  --breakpoint-xl: 1280px;  --breakpoint-lg: 1024px;
  --breakpoint-tab: 834px;   --breakpoint-md: 768px;   --breakpoint-sm: 640px;

  /* ── Durées & courbes ──────────────────────────────────────── */
  --ease-soft: cubic-bezier(0.22, 1, 0.36, 1);   --ease-base: cubic-bezier(0.4, 0, 0.2, 1);  --ease-spring: cubic-bezier(0.2, 0.8, 0.2, 1);

  /* ── Animations (4 conservées + 6 nouvelles) ───────────────── */
  --animate-page-in: page-in 0.4s var(--ease-soft) both;      --animate-skeleton: skeleton-pulse 1.4s var(--ease-base) infinite;
  --animate-pop-in: pop-in 0.28s var(--ease-spring) both;    --animate-notif-in: notif-in 0.22s var(--ease-spring) both;
  --animate-fade-rise: fade-rise 0.36s var(--ease-soft) both; --animate-sheet-up: sheet-up 0.3s var(--ease-soft) both;
  --animate-heart-pop: heart-pop 0.42s var(--ease-spring);    --animate-cart-bump: cart-bump 0.34s var(--ease-spring);
  --animate-toast-in: toast-in 0.28s var(--ease-soft) both;  --animate-count-up: count-up 0.4s var(--ease-base) both;

  @keyframes page-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @keyframes fade-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @keyframes sheet-up { from { transform: translateY(100%); } to { transform: none; } }
  @keyframes skeleton-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  @keyframes pop-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
  @keyframes notif-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
  @keyframes toast-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
  @keyframes heart-pop { 0% { transform: scale(1); } 35% { transform: scale(1.32); } 60% { transform: scale(0.92); } 100% { transform: scale(1); } }
  @keyframes cart-bump { 0%, 100% { transform: scale(1); } 40% { transform: scale(1.18); } }
  @keyframes count-up { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
}
```

### 1.2 Base layer (remplace les lignes 91–130) — obligatoire

```css
@layer base {
  body { background-color: var(--color-ivory); color: var(--color-ink);
         font-family: var(--font-sans); line-height: 1.6; -webkit-font-smoothing: antialiased; }
  h1, h2, h3 { letter-spacing: -0.015em; }
  ::selection { background: var(--color-terracotta-soft); color: var(--color-ink); }
  :where(a, button, input, select, textarea, [tabindex]):focus-visible {
    outline: none; box-shadow: var(--shadow-focus); border-radius: var(--radius-sm); }
  .on-dark :where(a, button, input, select, [tabindex]):focus-visible { box-shadow: var(--shadow-focus-dark); }
  .no-scrollbar { scrollbar-width: none; }  .no-scrollbar::-webkit-scrollbar { display: none; }
  .table-scroll::-webkit-scrollbar { height: 8px; }
  .table-scroll::-webkit-scrollbar-thumb { background: var(--color-line); border-radius: 9999px; }
}
```

`@layer utilities` (remplace les lignes 132–177) : `.card` (blanc, `rounded-lg`, `p-6`, `shadow-sm`) · `.field-input` (`border-[1.5px] border-line-strong`, `rounded-md`, `p-3.5`, `text-base`, focus `border-terracotta-strong` + `shadow-focus`, `[aria-invalid=true]` → `border-danger`) · `.section-underline` (`pb-3 border-b border-line`) · `.page-enter` · `.stagger-1..4` (`animation-delay: 60/120/180/240ms`) · `.rail` (`flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory`).
**Supprimer** : `.card` à `rounded-[15px]`, `.field-input` à `border-2 border-gray-light`, la constante focus inline. **Ajouter** `@media (prefers-reduced-motion: reduce)` (identique, lignes 179–187 conservées).

### 1.3 Table de correspondance ancien → nouveau (migration obligatoire)

| Ancien (interdit) | Nouveau | Où |
|---|---|---|
| `primary` `#FF6B35` · `primary-dark` | `terracotta` + `terracotta-strong` (fond CTA) + `terracotta-ink` (texte) + `terracotta-deep` (hover) | partout |
| `secondary` `#004E89` (bleu) | `chocolate` `#3A2923` | Navbar, lien commande admin, StatCard |
| `soft-info` / `soft-orange` / `soft-purple` / `purple-icon` | `terracotta-soft` / `champagne-soft` + `chocolate` | badges, icônes, StatCard admin |
| `soft-warning` / `amber-deep` / `soft-success` / `soft-danger` | `champagne-soft`+`chocolate` / `positive-soft` / `danger-soft` | statuts |
| `success` / `danger` / `gray` / `gray-light` | `positive` / `danger` / `muted` / `line` | états, texte, bordures |
| `rounded-[8px]`/`[12px]` · `rounded-[15px]`/`[20px]` · `shadow-soft`/`shadow-card` · `shadow-hover` · `shadow-floating` | `rounded-sm` (12) · `rounded-md` (16) / `rounded-lg` (20) · `shadow-sm` · `shadow-md` · `shadow-lg` | cartes, survol, modale |
| `bg-line` / `ring-line` / `border-line` (classe morte) · `soft-primary` (classe morte) | **deviennent valides** : `--color-line` existe ; `soft-primary` → `terracotta-wash` | timeline, listes, survol de tuile |

**Interdits absolus** : `#FF6B35`, `#004E89`, `#004980`, `#1A1A2E`, `#F7F7F7`, `#E5E7EB`, `#6B7280`, `#00C853`, `#FFD600`, `#FF1744`, `#D1FAE5`, `#DBEAFE`, `#FEF3C7`, `#FEE2E2`, `#FFEDD5`, `#E9D5FF`, `#9333EA`, `#D97706`, et tout `#xxx` écrit en dur. Aucune classe ne contenant `-[` pour une couleur, une ombre ou un rayon. Aucun `style={{}}` métier.

### 1.4 Règles d'emploi des couleurs (non négociables)

- **Texte** : `ink` (principal) · `muted` (secondaire) · `faint` (**jamais** pour une information, désactivé et icône décorative seulement).
- **Terracotta** : aplat décoratif, bordure d'actif, badge, barre de progression, et **prix** — `text-terracotta` réservé à ≥ 19 px/700 ; en dessous, `text-terracotta-ink` (obligatoire). Aucun lien Terracotta sans icône ni `font-semibold`.
- **Bouton primaire** : fond `bg-terracotta-strong`, texte `text-white`, halo `hover:shadow-cta`. **Pas** `bg-terracotta` (4.24:1, non AA en texte normal).
- **Vert** : uniquement *payé, livré, terminé, réussi, gain*. **Rouge** : uniquement *erreur, échec, suppression, annulation*. **Aucun** autre usage, jamais en décoration.

### 1.5 Espacements & rayons

Échelle stricte **4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96** (classes Tailwind natives, aucune valeur arbitraire). Rythme : `gap-6` entre cartes produit, `gap-8` entre sections, `py-16` desktop / `py-10` mobile, `mt-24` entre deux bandes de section. Marge de page : `px-4` mobile, `px-6` ≥768, `px-8` ≥1280. Rayon par niveau : **niveau 1** (badge, chip, vignette, bouton) `rounded-sm` 12 · **niveau 2** (champ, carte, section) `rounded-md` 16 · **niveau 3** (modale, tuile catégorie, hero panel) `rounded-lg` 20 · **pastille/avatar** `rounded-full`.

### 1.6 Échelle typographique (classes exactes)

| Rôle | Classe exacte | Police |
|---|---|---|
| Hero éditorial | `font-display text-[52px] leading-[1.05] tracking-[-0.02em] 3xl:text-[72px]` | DM Serif Display |
| Titre d'article / accroche | `font-display text-[34px] leading-[1.15] 3xl:text-[44px]` | DM Serif Display |
| `h1` de page | `text-[32px] font-extrabold leading-[1.2] lg:text-[36px]` (mobile `text-[28px]`) | Sans 800 |
| `h2` de section | `text-[24px] font-extrabold leading-[1.25]` (+ `font-display` pour les sections éditoriales) | — |
| `h3` de carte / bloc | `text-[19px] font-bold leading-[1.3]` | Sans 700 |
| Prix héros / standard | `text-[28px] font-extrabold leading-none text-terracotta` / `text-[20px] font-extrabold text-terracotta` | Sans 800 |
| Prix compact / ligne | `text-[17px] font-bold text-terracotta-ink` | Sans 700 |
| Corps · lede · secondaire | `text-base leading-[1.6]` · `text-[18px] leading-[1.65] text-muted` · `text-sm leading-[1.55] text-muted` | Sans 400 |
| Titre de carte produit · ligne de liste | `text-[15px] font-bold leading-[1.35]` | Sans 700 |
| Légende / meta | `text-[13px] leading-[1.5] text-muted` | Sans 500 |
| Sur-titre (eyebrow) | `text-xs font-bold uppercase tracking-[0.12em] text-terracotta-ink` | Sans 700 |
| Micro-labels (badge, pastille compteur, chevron de fil) | `text-[12px] font-bold` (badge/indice) · `text-[11px] font-semibold` (label de nav) · `text-[10px] font-bold` (compteur) | 700 / 600 |
| Label de champ · statistique | `text-sm font-semibold text-ink` · `text-[32px] font-extrabold tabular-nums leading-none` | Sans 600 / 800 |

Règles : **jamais** de corps de texte en capitales ; `tabular-nums` sur **tout** chiffre (prix, stats, montants) ; `font-display` **interdit** sous 20 px et sur les chiffres (lisibilité) ; un seul `font-display` par écran ; `DM Serif Display` n'a **pas de graisse 700** — ne jamais faire de faux gras (pas de `-webkit-text-stroke`).

---

## 2. Logo, symbole & favicon (spec, pas de binaire)

**Symbole « La Boucle »** — une seconde vie qui tourne. Deux primitives sur `viewBox="0 0 24 24"` (géométrie vérifiée : bbox 3.80,3.80 → 19.99,20.20 soit 16.19 × 16.40, centre optique (11.89, 12.00), écart 0.11) :

```
1. ARC   — boucle ouverte de 290°, rayon 7, centre (12,12), ouverture de 70° à droite (325°→35°)
   <path d="M 17.73 7.98 A 7 7 0 1 0 17.73 16.02" fill="none"
         stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
2. TÊTE  — triangle plein (base 5.5, pointe 3.7 en avant de la tangente, 55° au-dessus de l' horizontale)
   <path d="M 19.86 12.98 L 19.99 17.59 L 15.48 14.44 Z" fill="currentColor"/>
```

| Contexte | Composition | Couleurs | Taille |
|---|---|---|---|
| Navbar desktop · mobile | symbole + « ReVends » (`font-display` 400 ; 24px desktop, 19px mobile) ; le **V** en Terracotta | symbole `ink`, V `terracotta` | 32 / 28 px |
| Footer | symbole champagne + wordmark `font-display` 28px, V `on-dark-accent` | sur `ink` | 40 px / 28 px |
| Sidebar admin | symbole champagne + « REVENDS » sans 800 `tracking-[0.14em]` 20px | sur `ink` | 32 px |
| Page de connexion | symbole centré, 56 px, + wordmark `font-display` 34px | `ink` | 56 px |
| Favicon 16–32 px · Apple touch 180 | **caractère carré** `rounded-[7px]` 32×32 `bg-ink` + symbole `stroke-width="3"` `on-dark` (sans triangle : trait plein, lisibilité à 16px) | — | 32 |

Règles : zone de protection = **8 unités** (½ hauteur du glyphe) sur les 4 côtés ; le glyphe ne se recolore jamais par dégradé ; **jamais** de version « plate » à 1 couleur hors favicon ; le `V` Terracotta est la seule couleur du logotype. Fichiers : `web/public/favicon.svg` (32), `favicon.ico` (16/32), `apple-touch-icon.png` (180), `<meta name="theme-color" content="#171513">` sur les pages à navbar sombre, `#F7F3EC` sinon. Polices : woff2 auto-hébergées dans `web/public/fonts/`, `@font-face` dans `index.css`, `font-display: swap`, `preload` uniquement de `PlusJakartaSans-800` et `DMSerifDisplay-400`.

**Mascotte « la Boucle »** — même glyphe, seule apparition : états vides (§3.12) et 404, 64 px, `text-terracotta`/`text-champagne-deep`, une seule rotation de 8° au montage en 600 ms, puis immobile. Jamais ailleurs, jamais animée en boucle.

---

## 3. Composants — contrat + structure

Chaque composant donne : **contrat** (props Obligation), **tokens** (classes exactes), **états** obligatoires. Structure JSX donnée pour les 6 composants structurants ; pour les autres, l'arbre des classes suffit.

### 3.1 Button (élargir `ui/Button.tsx`)

```tsx
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'positive' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'
<Button variant="primary" size="md" block loading icon="fa-arrow-right">Ajouter au panier</Button>
```
`BASE` = `inline-flex items-center justify-center gap-2 font-bold rounded-md transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45`.

| Variant | Tokens | Hover | Pressé |
|---|---|---|---|
| `primary` | `bg-terracotta-strong text-white shadow-cta` | `bg-terracotta-deep` | `scale-[0.98]`, `shadow-xs` |
| `secondary` | `bg-chocolate text-white` | `bg-ink` | idem |
| `outline` | `border-[1.5px] border-line-strong bg-white text-ink` | `border-terracotta-strong text-terracotta-ink bg-terracotta-wash` | idem |
| `ghost` | `text-ink hover:bg-ink/5` | — | — |
| `positive` | `bg-positive text-white` | `bg-positive-dark` | idem |
| `danger` | `bg-danger text-white` | `bg-danger-dark` | idem |

Tailles : `sm` `h-9 px-4 text-sm` (≥44px sous 768 : `max-md:min-h-[44px]`) · `md` `h-11 px-6 text-base` · `lg` `h-[52px] px-8 text-[17px]`. `loading` = spinner `fa-spinner fa-spin` + `aria-busy` + texte conservé. Icône seule : carré `h-11 w-11` + `aria-label` obligatoire. `buttonClasses()` reste exporté (partagé avec les `<Link>`).

### 3.2 Inputs, Selects, Textarea, Search bar

`.field-input` sur **tout** contrôle. Label `text-sm font-semibold text-ink mb-2` (obligatoire, jamais placeholder seul) ; aide `text-[13px] text-muted mt-1.5` ; erreur `text-[13px] font-medium text-danger mt-1.5` + `aria-describedby` + `role="alert"` ; `aria-invalid` → bordure `danger`. `select` : `appearance-none` + chevron `fa-chevron-down` absolutely positionné à droite, padding droit 40 px. Radio/checkbox : `accent-terracotta-strong` taille 20 px ; carte radio `rounded-md border-[1.5px] border-line-strong p-4 has-[:checked]:border-terracotta-strong has-[:checked]:bg-terracotta-wash`.
**Search bar (globale, dans la navbar)** : hauteur 48 px, `rounded-full bg-white border-[1.5px] border-line-strong`, icône `fa-magnifying-glass text-muted` à gauche, bouton loupe `bg-terracotta-strong text-white rounded-full h-10 w-12` à droite ; `focus-within:border-terracotta-strong` + `focus-within:shadow-focus`. **Suggestions** (≥ 2 caractères, debounce 250 ms) : panneau `absolute top-[calc(100%+8px)] z-50 w-full rounded-md bg-white shadow-lg p-2`, 6 max, chaque ligne `flex items-center gap-3 rounded-sm px-3 py-2.5 hover:bg-terracotta-wash` avec vignette 40 px `rounded-sm`, `aria-autocomplete="list"`, `role="listbox"`/`option`, `aria-activedescendant` sur clavier, `Échap` ferme, retour au catalogue sur `Entrée`.

### 3.3 ProductCard (le composant le plus important)

```tsx
<ProductCard product={p} variant="default" index={i} />   // variant: default | mini | sold
```
Structure : `<article class="group relative flex flex-col overflow-hidden rounded-md bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">`
1. **Média** `relative aspect-[4/5] overflow-hidden bg-ivory` — `<img class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]">`, `loading="lazy"`, `alt={name}`, `onError` → photo de catégorie existante.
2. **Badges** haut-gauche, pile `absolute left-3 top-3 z-[2] flex flex-col items-start gap-1.5`, **2 maximum** : « Nouveau » `bg-terracotta text-white`, « Tendance » `bg-ink text-on-dark`, « Bon plan » `bg-positive-soft text-positive`, « Très recherché » `bg-champagne text-chocolate` — tous `rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide`.
3. **Remise** bas-gauche de l'image : `absolute bottom-3 left-3 z-[2] rounded-full bg-ink/85 px-2.5 py-1 text-[12px] font-bold text-on-dark` → `−12 %`.
4. **Favori** haut-droite, **frère** du lien étiré jamais enfant : `absolute right-3 top-3 z-[3] grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow-sm` ; cœur `fa-heart` vide (`text-ink`) / rempli (`text-terracotta` + `animate-heart-pop`).
5. **Actions rapides** (desktop ≥1024, `opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0` sur l'image) : barre `absolute inset-x-3 bottom-3 z-[2] flex gap-2` avec `[👁 Aperçu] [🛒 Ajouter]` `h-9 rounded-sm text-[12px] font-bold` fond blanc/translucide.
6. **Corps** `p-4 flex flex-1 flex-col` : titre `line-clamp-2 min-h-[2.6em] text-[15px] font-bold text-ink` ; ligne prix `mt-1.5` (prix + `oldPrice` barré `text-[13px] text-muted line-through`) ; meta `mt-2 flex items-center justify-between text-[13px] text-muted` (localisation `fa-location-dot` + `truncate`, état `rounded-full bg-ivory px-2.5 py-1 text-[12px] font-semibold text-chocolate`) ; CTA `mt-3 h-10 w-full rounded-md` (`variant="primary" size="sm"` ou `outline` si réservé).
7. **Variante `mini`** (rails d'accueil) : `aspect-[4/5]`, **sans** CTA ni pastille d'état, corps `p-3`. **Variante `sold`** : image `opacity-55`, voile `absolute inset-0 bg-ink/45`, pastille centrée `bg-ink text-on-dark` « Produit vendu », CTA remplacée par `[Voir des articles similaires]`, lien étiré `aria-disabled`.
8. **Lien étiré** : `<Link class="absolute inset-0 z-[1]" aria-label={name}>` — badge, favori, actions et CTA restent `z-[2]/z-[3]` hors du lien. **Cascade** : `animate-fade-rise` + `animation-delay: {min(index,11) * 50}ms`.

### 3.4 CategoryCards (accueil) & page catégorie
Tuile `group relative overflow-hidden rounded-lg bg-white shadow-sm hover:shadow-md` : photo `aspect-[3/4] object-cover group-hover:scale-[1.04] transition-transform duration-500` ; voile `absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/20 to-transparent` (**seul dégradé autorisé**, sur image) ; nom `absolute bottom-4 left-4 right-4 font-display text-[24px] text-on-dark` ; compteur `text-[12px] text-on-dark-muted` ; entire tile = un seul `Link` étiré. Grille `grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-6`.

### 3.5 Badges & pastilles
`StatusBadge` : `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold` + **pastille 8 px** (`h-2 w-2 rounded-full`) — la couleur n'est jamais seule (1.4.1).
`pending` → `bg-champagne-soft text-chocolate` · `approved`/`positive` → `bg-positive-soft text-positive` · `sold` → `bg-ink text-on-dark` · `rejected`/`danger` → `bg-danger-soft text-danger` · `reserved` → `bg-terracotta-soft text-terracotta-ink` · `neutral` → `bg-ivory text-muted`. Mapper `productStatusBadge` / `orderStatusBadge` / `payoutStatusBadge` / `availabilityBadge` de `lib/constants.ts` **uniquement** sur ces kinds (supprimer `blue`/`purple`).

### 3.6 Avatar & Dropdowns
Avatar `h-9 w-9 rounded-full bg-chocolate text-on-dark text-[13px] font-extrabold grid place-items-center` (initiales), `aria-hidden` quand le nom est à côté ; taille `lg` `h-14 w-14 text-lg` ; avec image : `object-cover`.
Dropdown : déclencheur `ghost`/`outline` + `aria-haspopup="menu" aria-expanded` ; panneau `absolute z-50 mt-2 min-w-[220px] rounded-md bg-white p-2 shadow-lg border border-line` ; item `flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-sm font-medium text-ink hover:bg-terracotta-wash hover:text-terracotta-ink` ; séparateur `my-1 h-px bg-line` ; `role="menu"`/`menuitem`, flèches ↑↓, `Échap` + clic extérieur ferment, focus rendu au déclencheur.

### 3.7 Tabs & Segmented control
Tabs (soulignés) : `flex gap-1 border-b border-line` ; item `relative px-4 py-3 text-sm font-semibold text-muted transition-colors hover:text-ink` + actif `text-terracotta-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-full after:bg-terracotta` ; `role="tablist"`, flèches ←→.
Segmented (périodes admin) : `inline-flex rounded-full border border-line bg-white p-1` ; item `rounded-full px-4 py-2 text-[13px] font-semibold text-muted` ; actif `bg-ink text-on-dark` ; `role="group"` + boutons `aria-pressed` (5 périodes : **Aujourd'hui · 7 jours · 30 jours · 3 mois · 12 mois**, défaut 30 jours).

### 3.8 Tables (admin)
Conteneur `rounded-md bg-white shadow-sm` ; scroll `table-scroll overflow-x-auto` dans `role="region" aria-label tabIndex={0}` ; `<caption class="sr-only">` ; `th` `px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.08em] text-muted bg-ivory border-b border-line sticky top-0` ; `td` `px-4 py-4 text-sm text-ink border-b border-line` ; hauteur de ligne 82 px ; survol `hover:bg-ivory` ; ligne cliquable `cursor-pointer` **avec un vrai lien dans la 1ʳᵉ cellule** ; `td` numérique `tabular-nums text-right` ; actions `flex justify-end gap-2` ; `ProductCell` = vignette `h-[50px] w-[50px] rounded-sm object-cover` + nom `font-semibold` + meta `text-xs text-muted`.

### 3.9 Cards, Modals, Sheets, Toasts
`Card` (de `ui/States.tsx`, fait autorité) = `.card` = `rounded-md bg-white p-6 shadow-sm` ; `CardHeader` = `mb-5 flex items-center justify-between` + `h3 text-[19px] font-bold` + lien « Voir plus » `text-sm font-bold text-terracotta-ink inline-flex items-center gap-1.5 hover:text-terracotta-deep`.
`Modal` : overlay `fixed inset-0 z-[200] bg-overlay` + carte `relative z-[10] w-full max-w-lg rounded-lg bg-white p-7 shadow-lg animate-pop-in` ; titre `text-[19px] font-extrabold` + fermeture `h-10 w-10 rounded-md text-muted hover:bg-ink/5` ; `role="dialog" aria-modal aria-labelledby`, **piégeage Tab/Shift+Tab**, `Échap`, focus au conteneur puis rendu au déclencheur, `body` scroll verrouillé. Variantes : `max-w-sm` (confirmation) · `max-w-2xl` (détail) · **`Sheet`** mobile = même API mais `inset-x-0 bottom-0 top-auto max-h-[88vh] rounded-t-lg animate-sheet-up` + poignée `h-1 w-10 rounded-full bg-line mx-auto mt-1`.
`Toast` : `fixed z-[300] bottom-4 right-4 w-[min(360px,calc(100vw-2rem))] flex flex-col gap-3` + `aria-live="polite"` ; item `animate-toast-in flex items-start gap-3 rounded-md bg-white p-4 shadow-md border-l-4` (`success` → `border-positive`, icône `fa-circle-check text-positive`) (`error` → `border-danger`, `fa-circle-exclamation text-danger`) (`info` → `border-terracotta`, `fa-circle-info text-terracotta-ink`) ; texte `text-sm font-medium text-ink whitespace-pre-line` ; fermeture `aria-label="Fermer"` ; durée 4 500 ms ; **mobile** : `inset-x-4 bottom-20` (au-dessus de la bottom nav).

### 3.10 Pagination, Filtres, Breadcrumbs, Timeline, Progress, Stepper
- `Pagination` : `mt-10 flex items-center justify-between` ; compteur `text-sm text-muted` (`{total} articles · page {p}/{n}`) ; boutons `outline` `sm` désactivés aux bornes ; variantes de largeur de page 24/48.
- `Filters` : **desktop ≥1024** rail gauche `w-[264px] shrink-0 sticky top-24 self-start rounded-md bg-white p-5 shadow-sm`, groupes `<fieldset>` + `<legend class="text-xs font-bold uppercase tracking-[0.1em] text-muted mb-3">`, filtres à cocher (`accent-terracotta-strong`), `select` pour sous-catégorie/état/localisation, champ libre pour marque, `Afficher {n} résultats` en `text-sm font-bold text-terracotta-ink` (`aria-live="polite"`), `Réinitialiser` (`ghost` `sm`) en bas. **Mobile <1024** : bouton `Filtrer` (`outline` + badge du nombre) → `Sheet` reprenant les mêmes groupes, pied collant `flex gap-3 p-4 border-t border-line` avec `[Réinitialiser ghost] [Voir les n résultats primary block]`. Chips actifs sous l'en-tête : `rounded-full bg-terracotta-soft text-terracotta-ink px-3 py-1.5 text-[13px] font-semibold` + `×` (aria-label « Retirer le filtre : {label} »).
- `Breadcrumbs` : `nav aria-label="Fil d'Ariane"` + `ol flex flex-wrap items-center gap-1.5 text-[13px] text-muted`, séparateur `fa-chevron-right text-[10px]`, lien `font-semibold text-terracotta-ink hover:text-terracotta-deep`, dernière page `text-ink font-semibold` + `aria-current="page"`.
- `OrderTimeline` (suivi colis) : `<ol class="relative">` ; rail `absolute left-[15px] top-2 bottom-2 w-0.5 bg-line` ; `<li class="relative flex gap-4 pb-7 last:pb-0">` ; nœud `relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-bold` : **atteint** `bg-positive-soft text-positive` + `fa-check`, **courant** `bg-terracotta text-white` + `fa-circle-dot` (+ anneau `animate-pulse ring-4 ring-terracotta-glow`), **à venir** `bg-white text-muted border border-line`, **échec** `bg-danger-soft text-danger` + `fa-xmark` ; contenu : titre `text-[15px] font-bold text-ink` (ou `text-muted` si à venir) + `<time class="text-[13px] text-muted">` + note `text-sm text-muted` ; barre d'échec `rounded-md bg-danger-soft p-4` ; résumé `text-right text-[13px] text-muted` « n / 10 étapes franchies » ; `<details>` « Historique détaillé (n) ».
- `Progress` : barre `h-2 w-full overflow-hidden rounded-full bg-line` + remplissage `h-full rounded-full bg-terracotta transition-[width] duration-500` + `role="progressbar" aria-valuenow/min/max` ; variantes `positive` (terminé) et `danger` (échec) ; label `text-[13px] font-semibold text-muted mb-2`.
- `Stepper` (checkout 4 étapes / vendre 5 étapes) : `<ol class="flex items-center">`, Desktop : `<li class="flex items-center gap-3">` pastille `grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold` (**fait** `bg-positive text-white` + check, **courant** `bg-terracotta text-white` + `shadow-cta`, **à venir** `bg-white text-muted border border-line-strong`) + libellé `text-sm font-semibold` (`ink` si fait/courant, `muted` sinon) ; connecteur `mx-3 h-0.5 w-10 rounded-full` (`bg-positive` si fait, `bg-line` sinon). Mobile : `Étape {i}/{n}` + titre en `text-sm font-bold` + `Progress` (largeur = i/n×100).

### 3.11 Skeletons & états de chargement
`.animate-skeleton bg-line rounded-sm` ; **shimmer** : dégradé interne `background-image: linear-gradient(90deg, transparent, rgba(247,243,236,.7), transparent)` animé 1.4 s. Exports : `ProductGridSkeleton(count)` (médium `aspect-[4/5]` + 2 lignes + prix), `ProductRowSkeleton`, `StatGridSkeleton(count)`, `TableSkeleton(rows)` (vignette 50 px + 2 lignes + badge), `DetailSkeleton`, `PageLoader` (spinner `text-terracotta`, `min-h-[40vh]`, `role="status"`). Règle : **un skeleton reproduit la silhouette exacte** du contenu final ; jamais de « Chargement… » seul au milieu d'une page structurée.

### 3.12 Notifications (item) & états vides
Item : `<li class="flex gap-4 rounded-md bg-white p-4 shadow-sm border-l-[3px] [border-l-positive|terracotta|line]">` ; pastille d'état `mt-1.5 h-2.5 w-2.5 rounded-full` (`bg-terracotta` si non lue, `bg-line` si lue) ; titre `text-[15px] font-bold text-ink` ; corps `text-sm text-muted` ; date `text-[13px] text-muted` ; non lue = bord gauche Terracotta + pastille, lue = `opacity-70`. **4 textes imposés** (source unique `EMPTY_COPY` dans `lib/constants.ts`) :

| Contexte | Titre | Texte |
|---|---|---|
| Découvrir / recherche vide | **« Rien ici pour l'instant »** | « Aucun article ne correspond à votre recherche. Élargissez vos filtres ou explorez une autre catégorie. » |
| Favoris vide | **« Vos favoris sont vides »** | « Touchez le cœur d'un article pour le retrouver ici. Vos favoris restent sur cet appareil. » |
| Commandes vides | **« Aucune commande pour l'instant »** | « Vos achats apparaîtront ici dès votre première commande. » |
| Ventes vides | **« Aucune vente enregistrée »** | « Dès qu'un de vos articles sera vendu, vous suivrez ici le paiement de votre commission. » |

Compléments (mêmes 3 blocs) : panier → « Votre panier est vide » / « Parcourez le catalogue et ajoutez vos premiers articles. » · notifications → « Aucune notification » / « Vous serez prévenu dès qu'un article sera approuvé ou qu'une commande avancera. » · admin → « Rien en attente » / « Aucun article, aucune commande, aucun paiement à traiter. » · 404 → « Cette page n'a pas trouvé de seconde vie » / « Le lien est peut-être erroné ou l'article a été retiré du catalogue. »
Structure : `rounded-md bg-white p-10 text-center shadow-sm` + mascotte 64 px + `h3 text-[19px] font-bold text-ink` + `p max-w-md mx-auto text-sm text-muted` + action `primary sm`. **Toujours** une action (ou `Réessayer` en cas d'erreur).

### 3.13 Checkout stepper & espace vendeur (graphique)
voir §3.10 (Stepper, Progress). Graphique : `<svg viewBox="0 0 720 260" class="w-full">` ; grille 4 lignes `stroke-line-strong` opacité .5 ; aire `fill-terracotta` opacité .12 ; courbe `stroke-terracotta` `stroke-width 2.5` `stroke-linecap round` ; point courant `circle r=5 fill-terracotta stroke-white stroke-width 2` ; axe `text-[12px] fill-muted` ; survol : guide verticale `stroke-champagne-deep` + `Tooltip` `rounded-md bg-ink px-3 py-2 text-[13px] text-on-dark tabular-nums` ; sans donnée : `EmptyState` (pas de graphique vide) ; période `30j / 3 mois / 12 mois` (Segmented).

---

## 4. Les 50 écrans — directives par zone

**Ordre de lecture type d'une page publique** : `Navbar` → `main` (contenu) → `Footer`. Rythme : `max-w-content mx-auto px-4 md:px-6 lg:px-8`.

### 4.1 Wireframes de référence (les 6 écrans qui portent la marque)

**① Accueil desktop** — `bg-ivory`, `Navbar` 80px `bg-ink` (logo champagne | recherche flex | ⌂♡🛒👤)
```
┌ ① HERO ÉDITORIAL — rounded-lg overflow-hidden, min-h 420px ──────────────┐
│  image plein cadre · voile `bg-gradient-to-r from-ink/80 via-ink/40`      │
│  [sur-titre champagne uppercase 12px] → H1 `font-display 72px` on-dark    │
│  « Donnez une seconde vie à ce que vous ne portez plus. »                  │
│  lede 18px on-dark-muted max-w-[560px]                                    │
│  [Découvrir →] primary   [Vendre un article] outline sur blanc            │
│  ▸ encart produit « lifestyle » : carte blanche translucide, 1 photo,     │
│    prix, [Ajouter] — posée sur le hero, coin bas-droit (≥1280)             │
├ ② CATÉGORIES — 5 tuiles 3/4 + « Toutes les catégories » → popover ────────┤
├ ③ PRODUITS DU MOMENT — rail horizontal · h2 24px + « Voir plus → » ───────┤
├ ④ BANDE ÉDITORIALE — bg-champagne-soft, 2 colonnes ──────────────────────┤
│  sur-titre « LE CONCEPT » · h2 `font-display 44px`                        │
│  « Ce que vous ne portez plus… a encore de l'avenir. » + paragraphe + CTA│
├ ⑤ COMMENT ÇA MARCHE — 2 parcours côte à côte (2 cartes) ────────────────┤
│  A · J'ACHÈTE  ① je crée un compte ② je règle par Mobile Money            │
│                ③ je suis mon colis jusqu'à la porte                        │
│  B · JE VENDS  ① je prends 3 photos ② je fixe mon prix (commission         │
│                affichée) ③ je suis mon paiement                            │
├ ⑥ BANDE VENDEUR — bg-ink, centrée, max-w-[640px] (réutilise SellerBar) ─┤
│  h2 `font-display 40px` on-dark « Votre placard cache une petite fortune »│
│  lede on-dark-muted + [Vendre un article →] primary                       │
├ ⑦ CONFIANCE — 4 points sur 1 ligne : Paiement Mobile Money sécurisé ·     ┤
│  Vendeurs vérifiés · Livraison suivie · Commission 10 % transparente      │
└ ⑧ FOOTER — bg-ink : marque+contact │ Catégories │ Acheter │ Vendre ───────┘
   bas de page `border-t border-white/10`, mentions légales non cliquables
```

**② Fiche produit** — `grid lg:grid-cols-[minmax(0,1fr)_420px] gap-8`
```
┌ GALERIE (sticky top-24) ────────┬ INFOS (colonne sticky) ───────────────┐
│ · 1 grande photo cliquable      │ [Badges : Nouveau · −12 %]           │
│   → plein écran (lightbox)      │ h1 32px ink (2 lignes max)            │
│ · rangée de vignettes 64px      │ ★ 4,6 (23 avis) · 12 vendus          │
│ · zoom au survol 1.05           │ prix 28px terracotta + prix barré     │
│                                 │ [Réserver / Acheter] primary lg       │
│ LIGNE DE CONFIANCE (4 icônes)   │ [♡ Ajouter aux favoris] outline lg    │
│                                 │ ── VENDU PAR : avatar 40px + nom + ★  │
│                                 │    + ville → lien /profil/:id         │
│                                 │ ── DÉTAILS : état, marque, modèle,    │
│                                 │    âge, ville (2 colonnes Field)      │
│                                 │ ── GARANTIES (4 lignes + icône) :     │
│                                 │    Paiement protégé · Article vérifié │
│                                 │    par ReVends · Retour sous 48 h si │
│                                 │    non conforme · Livraison suivie    │
│                                 │ ── DESCRIPTION (read 680px)           │
└─────────────────────────────────┴───────────────────────────────────────┘
SIMILAIRES : h2 « Vous aimerez aussi » + rail de 5 ProductCard
```
> **Aucun bouton « Contacter le vendeur »** (US-V5-06). Aucun « Supprimer » côté vendeur (ARB-V5-04).

**③ Checkout 4 étapes** — `grid lg:grid-cols-[minmax(0,1fr)_380px] gap-8`
```
┌ STEPPER ①Livraison ②Paiement ③Récapitulatif ④Confirmation ┬ RÉCAP (sticky) ┐
│ CARTE « Étape 2 sur 4 — Paiement »                           │ 3 vignettes   │
│  · méthode : 2 cartes radio (Mobile Money / Espèces)         │ Sous-total    │
│  · téléphone MoMo (obligatoire)                               │ Livraison  0  │
│  · [← Retour]              [Continuer →]                     │ TOTAL 20px    │
└──────────────────────────────────────────────────────────────┴────────────────┘
```
Étape 4 = confirmation inline (contenu de ⑯) puis redirection `/confirmation`. Panier vide → `EmptyState` « Votre panier est vide » + CTA `/panier` (comportement existant conservé).

**④ Suivi colis** — `grid lg:grid-cols-[minmax(0,1fr)_360px] gap-8`
```
┌ h1 « Suivre mon colis » ──────────┬ CARTE COLIS (bg-white p-5) ──────────┐
│ n° de commande + Progress %       │ {orderNumber}                      │
│ TIMELINE verticale (10 étapes)    │ Créée le · Payée le                │
│  ✔ atteint  ● courant (pulse)     │ Transporteur : {si l'API le donne} │
│  ○ à venir  ✖ échec               │ Suivi : {si l'API le donne}        │
│ <details> Historique détaillé     │ [Copier le n° de suivi]            │
└───────────────────────────────────┴────────────────────────────────────┘
```

**⑤ Espace vendeur** — `grid lg:grid-cols-[264px_1fr] gap-6`
```
┌ VIGNETTE (avatar 56px, ─────────┬ h1 « Mon espace vendeur » ────────────┐
│ nom, ville)                     │ 4 StatCard : en ligne, en attente,   │
│ ── menu latent : mes articles,  │ vendus ce mois, à encaisser         │
│    mes ventes                    │ GRAPHIQUE « Ventes » (SVG) + période │
│                                 │  30j/3 mois/12 mois + légende        │
│                                 │  « Montant net encaissé après        │
│                                 │  commission 10 % »                   │
│                                 │ RÉCAP : brut, commission 10 %, net   │
│                                 │  90 % (Progress + 3 lignes)          │
│                                 │ LISTE des 5 dernières ventes         │
└─────────────────────────────────┴──────────────────────────────────────┘
```

**⑥ Admin — tableau de bord** — `Sidebar ink 264px` + `main bg-ivory p-8`
```
┌ SIDEBAR ───────────┬ AdminPageHeader « Dashboard » + formatToday() ─────┐
│ ink 264px          │ StatCard ×4 (grid-cols-4 gap-5 → 2 → 1)            │
│ actif : barre 3px  │ Card « Actions à effectuer » (6 lignes)            │
│  terracotta        │ Card « Progression des commandes » (8 tuiles)       │
│ items on-dark/70   │ Card « Paiements à payer » (montant 32px)          │
│                    │ Card « Accès rapides » (4 boutons outline)         │
│                    │ tout vide → EmptyState « Rien en attente »         │
└────────────────────┴────────────────────────────────────────────────────┘
```

### 4.2 Les 50 écrans (zones → composants)
| # | Écran · route | Composition |
|---|---|---|
| 1 | **Accueil desktop** `/` | Wireframe ①. Sections ≤ 8 blocs, dédup globale conservée, section < 4 produits masquée. |
| 2 | **Accueil mobile** `/` | Hero `min-h 300px`, h1 `font-display text-[34px]`, CTA `block`, categories `grid-cols-2`, rails `w-[46vw]`, §5 entièrement §3.1, bannière vendeur, confiance `grid-cols-2`, footer empilé 2 col puis 1. |
| 3 | **Découvrir** `/search?section=…` | `max-w-content` ; rail `Filters` 264px + zone `flex-1` ; barre de tri `select` + compteur `n résultats` (`aria-live`) ; grille `grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 xl:gap-6` ; `Pagination` ; chips de filtres actifs. |
| 4 | **Recherche — résultats** `/search?q=` | Idem 3 + `Breadcrumbs` (Accueil › Recherche) + champ de recherche pleine largeur (`md:max-w-[560px]`) + panneau de suggestions. |
| 5 | **Recherche — zéro résultat** | `EmptyState` texte ① + 2 actions (`Voir tous les articles`, `Réinitialiser les filtres`) + 1 rail de suggestions (catégories populaires, 5 `Link` texte). |
| 6 | **Page catégorie** `/category/:slug` | Hero catégorie `rounded-lg min-h-[280px]` (photo de catégorie, voile `from-ink/75`) : sur-titre `CATEGORY`, `h1 font-display 44px on-dark`, description `text-on-dark-muted max-w-[640px]`, `n articles` ; sous-catégories en chips `rounded-full bg-white border-line-strong` ; puis 3 (rail filtres + grille + pagination). |
| 7 | **Fiche produit** `/catalogue/:slug` | Wireframe ②. Sans « Contacter le vendeur ». |
| 8 | **Fiche — galerie plein écran** | `Modal max-w-[1200px] p-4` noire (`bg-ink`), photo `object-contain`, `←/→` 44 px, `compteur 3/6`, `Échap` ferme, `aria-label="Photo 3 sur 6"`, thumbnails actives `ring-2 ring-terracotta`. |
| 9 | **Favoris** `/favoris` (espace client) | `h1 « Mes favoris »` + `Segmented` radio : **Tous · Disponibles · Produits vendus** (état local) ; grille `ProductCard` ; cartes vendues en variante `sold` (§3.3.8) ; vide → texte ②. |
| 10 | **Panier** `/panier` | `grid lg:grid-cols-[minmax(0,1fr)_380px] gap-8` ; liste `Card` par article (photo 88 px `rounded-sm`, nom, état, prix, stepper quantité `− / n / +` 40 px, `Retirer` `ghost` danger) ; récap `sticky top-24` (sous-total, livraison `Offerte`, total 20px extrabold) + `[Passer commande →] primary block lg` ; suggestions « Complétez avec » (rail 5 cartes). |
| 11 | **Panier — vide** | `EmptyState` « Votre panier est vide » + CTA `/search` ; sous-titre : 3 raisons de vendre (3 cartes `rounded-md bg-white p-5`). |
| 12 | **Checkout — étape 1 Livraison** | Wireframe ③. `FormField` (nom, téléphone, ville `select`, adresse, note `textarea`) ; `ErrorMessage` en tête sur 422 ; barre `Back`/`Continuer`. |
| 13 | **Checkout — étape 2 Paiement** | 2 cartes radio `Mobile Money` / `Espèces` / `Virement bancaire` (constantes existantes) ; téléphone MoMo `inputMode="tel"` ; aide `text-[13px] text-muted`. |
| 14 | **Checkout — étape 3 Récapitulatif** | 3 blocs `Card` : Livraison (données), Paiement (méthode), Articles ( vignettes + prix) ; `Case` « J'accepte les conditions » obligatoire ; `[Confirmer la commande] primary block lg` + `[Modifier] ghost`. |
| 15 | **Checkout — étape 4 Confirmation** | `PageLoader` pendant l'appel, puis écran 16. |
| 16 | **Confirmation** `/confirmation` | Carte centrée `max-w-[640px] rounded-lg bg-white p-10 text-center shadow-sm` : mascotte 64 px (`text-positive`), sur-titre `COMMANDE CONFIRMÉE` champagne-deep, `h1 font-display 34px « C'est parti, {prénom} ! »`, `n° de commande` (mono, copiable), récap 3 lignes, `Progress` 10 %, 2 CTA (`Suivre mon colis` primary, `Continuer mes achats` outline). |
| 17 | **Suivi de colis** `/commandes/:id/suivi` | Wireframe ④. |
| 18 | **Connexion (unique)** `/login` | `AuthLayout` : fond `bg-ivory` + panneau blanc `max-w-[440px] rounded-lg p-8 shadow-sm` **centré**, motif éditorial discret (`champagne-soft` derrière). Logo centré (symbole 56 + wordmark 34) · `h2 « Bienvenue sur ReVends »` `font-display text-[32px]` · lede `Connectez-vous pour retrouver vos achats et vos ventes.` · champs Email / Mot de passe (toggle œil `aria-pressed`) · `[Se connecter] primary block` · lien `Mot de passe oublié ?` · séparateur `ou` + `[Créer un compte] outline block` · `ErrorMessage` sous le logo. Redirection par rôle conservée. |
| 19 | **Inscription** `/register` | Même gabarit ; `h2 « Créez votre compte »` ; champs nom, e-mail, téléphone, mot de passe (jauge de robustesse `Progress` `positive` 0-100 % sous le champ), case CGU ; CTA `[Créer mon compte]` ; lien vers `/login`. |
| 20 | **Mot de passe oublié** `/login?oubli=1` (modale) | `Modal max-w-md` : `h3 « Réinitialiser le mot de passe »`, texte `text-sm text-muted`, champ e-mail, `[Envoyer le lien] primary block`, `Échap` ferme, focus au premier champ. |
| 21 | **Notifications** `/notifications` | `h1` + `Segmented` (Toutes / Non lues) + compteur ; `ul` d'`NotificationItem` (§3.12) ; non lue = bord Terracotta ; `[Tout marquer comme lu] ghost` en haut à droite ; vide → texte notifications. |
| 22 | **Profil vendeur public** `/profil/:id` | `rounded-lg bg-white p-8 shadow-sm` : avatar 96 px + nom `h1 32px` + ville + `Membre depuis {date}` + 3 `StatCard` (articles, ventes, note) + 2 lignes de bio `max-w-read` ; puis rail « Ses articles » (`ProductCard`) ; **aucun bouton de contact**. |
| 23 | **Espace client — tableau de bord** `/` (hub connecté) | Bandeau de bienvenue `rounded-lg bg-ink p-8` : « Bonjour Idrissa » `font-display 40px on-dark` + 3 raccourcis (`Mes commandes`, `Mes favoris`, `Vendre un article`) + 3 tuiles `bg-white/10 rounded-md p-4` (dernière commande, favoris, articles en ligne) ; puis rails « Vus récents » et « Recommandé pour vous ». |
| 24 | **Mes commandes** `/mes-commandes` | `h1` + `Segmented` statut ; liste de `Card` cliquables (photo 72 px, n°, date, montant `text-[17px] font-bold text-terracotta-ink`, `StatusBadge`, `[Suivre]` `ghost sm`) ; vide → texte ③. |
| 25 | **Détail commande** `/mes-commandes/:id` | `Breadcrumbs` + `h1 {orderNumber}` + `StatusBadge` ; 2 colonnes : gauche `Card` « Articles », `Card` « Adresse de livraison », `Card` « Paiement » ; droite `Card` « Cycle de commande » avec `OrderTimeline` + `Progress` + bouton `[Suivre mon colis] primary block`. |
| 26 | **Mes favoris** | Écran 9. |
| 27 | **Mes produits** `/mes-articles` | `h1` + `Segmented` (Tous / En attente / Publiés / Réservés / Vendus / Refusés) + `[Vendre un article] primary` ; grille `ProductCard` (variante `mini` + `StatusBadge`) ; **aucun bouton Supprimer** (ARB-V5-04) ; ligne d'information `text-[13px] text-muted` « La suppression d'un article est réservée à l'équipe ReVends. » |
| 28 | **Mes ventes** `/ventes` | `h1` + 3 `StatCard` (vendu ce mois, en cours, encaissé) + `table-scroll` (article, date, montant, commission 10 %, net, `StatusBadge` paiement) ; vide → texte ④. |
| 29 | **Mes adresses** `/adresses` | `h1` + grille `md:grid-cols-2` de `Card` (libellé, destinataire, téléphone, adresse, ville, badge « Par défaut » `bg-terracotta-soft text-terracotta-ink`) + `[Ajouter une adresse] outline` ; carte par défaut bord gauche `border-l-[3px] border-terracotta`. |
| 30 | **Paramètres** `/parametres` | `max-w-form` ; `Card` « Informations personnelles » (nom, téléphone), `Card` « Sécurité » (mot de passe, `[Modifier]` → modale), `Card` « Préférences » (notifications : 4 `Case`, langue `select` si API, zone horaire) ; `Card danger` « Zone sensible » : `[Supprimer mon compte] danger sm` → `ConfirmDelete` listant les conséquences. |
| 31 | **Créer une annonce — étapes 1-2** `/vendre` | `max-w-form` ; `Stepper` 5 ; **① Photos** : zone drag-drop `rounded-lg border-2 border-dashed border-line-strong bg-white p-10 text-center` (`dragover` → `border-terracotta-strong bg-terracotta-wash`), icône `fa-camera` 32 px `text-terracotta`, `3 photos minimum` `text-[13px] text-muted`, `[Choisir des photos] outline`, grille des vignettes 96 px `rounded-sm` avec `×` et badge « Couverture » ; **② Informations** : nom, catégorie + sous-catégorie (`select` liés), marque, modèle, âge, description `textarea` + compteur `12 / 2000` `tabular-nums`, état `select` (constantes existantes). |
| 32 | **Créer une annonce — étapes 3-4** | **③ Prix** : champ `inputMode="numeric"` + encadre `rounded-md bg-positive-soft p-4` : « Vous recevez **90 %** · Commission ReVends **10 %** » (`text-positive`), montant net calculé en direct `tabular-nums` ; mini-boutons `50 000` `100 000` `250 000` ; **④ Localisation** : ville `select` (constantes existantes), quartier `input`, précision `textarea` courte, `Case` « Livraison possible ». |
| 33 | **Créer une annonce — étape 5** | **⑤ Prévisualisation** : la `ProductCard` réelle (variante `default`) à gauche ; à droite les champs en lecture `Field` + 2 boutons `[Modifier]` `ghost` par bloc ; barre d'action `sticky bottom-0 bg-white border-t border-line p-4` : `[Enregistrer le brouillon] outline` + `[Publier mon article] primary` + aide `text-[13px] text-muted` « Votre article sera visible après validation par l'équipe ReVends. » |
| 34 | **Espace vendeur** `/espace-vendeur` | Wireframe ⑤. |
| 35 | **Ventes — graphique** (panneau de 34) | §3.13 ; légende `Montant net encaissé (FCFA)` ; `StatCard` de synthèse au-dessus ; sélecteur de période ; tooltip au clavier (focus sur les points) — accessibilité du graphique. |
| 36 | **Admin — dashboard** `/admin` | Wireframe ⑥. Sidebar sombre. |
| 37 | **Admin — articles en attente** `/admin/articles-en-attente` | `AdminPageHeader` + `AdminFilterBar` (compteur seul) ; `AdminTable` 5 col. ; modales `ConfirmAction` (approuver / refuser, motif dans `REJECTION_REASONS`, radios `accent-terracotta-strong`). |
| 38 | **Admin — articles** `/admin/articles` | `AdminFilterBar` (recherche + statut + reset) ; `AdminTable` 6 col. **+ action `[🗑 Supprimer] danger sm`** désactivée si commande active, motif porté par `aria-label` (D6/CA-V5-065) → `ConfirmDelete` listant retrait du catalogue + notification vendeur + pas de restauration. |
| 39 | **Admin — commandes** `/admin/commandes` | `select` statut (12 valeurs de `ORDER_STATUS_LABELS`) ; `AdminTable` 6 col. ; lit `?status=` pour les tuiles du dashboard. |
| 40 | **Admin — détail commande** `/admin/commandes/:id` | `Breadcrumbs` + `h1 {orderNumber}` + `StatusBadge` + `[Voir la fiche produit] outline sm` ; `Card` « Actions » (`Notice` contextuelle + **une seule** action dominante `lg block` + `Annuler la commande` `outline sm` à droite) ; grille `md:grid-cols-2` de 6 `Card` (Article / Client / Propriétaire / Paiement client / Paiement propriétaire / Livraison) ; `Card` « Cycle de commande » + `OrderTimeline`. |
| 41 | **Admin — utilisateurs** `/admin/utilisateurs` | Recherche seule ; `AdminTable` 5 col. ; **lecture seule stricte** : aucun bouton d'action, aucune colonne vide. |
| 42 | **Admin — vendeurs** `/admin/vendeurs` | Même gabarit que 41 + colonne « Ventes / Montant encaissé / Commission due » calculées sur les données existantes ; ligne = `Link` vers `/admin/commandes?vendeur=…` ; **aucune action d'écriture** (hors-périmètre v5). |
| 43 | **Admin — livraisons** `/admin/livraisons` | `Segmented` (À expédier / En livraison / Livrées) ; `AdminTable` (commande, article, destinataire, ville, date, transporteur si API, `StatusBadge`) ; action **`[✔ Confirmer la réception] positive sm`** sur `DELIVERED` → `ConfirmAction` (libellé « Confirmer la réception ») ; état désactivé + motif si la commande n'est pas livrée. |
| 44 | **Admin — paiements vendeurs** `/admin/paiements` | `AdminPageHeader` + `subtitle « Commission 10 % déjà déduite »` ; `select` (À payer / En attente / Payés / Tous, défaut « À payer ») ; `AdminTable` 7 col. ; `[💸 Marquer comme payé] secondary sm` si `DUE` → `ConfirmAction` (référence de virement). |
| 45 | **Admin — commissions** `/admin/commissions` | Lecture financière : `StatCard` ×3 (commission encaissée, en attente, next) + `table-scroll` (commande, vendeur, montant brut 10 %, net 90 %, date, statut) + `Progress` de répartition + export `CSV` (`outline sm`, si endpoint présent, sinon libellé non cliquable). |
| 46 | **Admin — statistiques** `/admin/statistiques` | `Segmented` **Aujourd'hui · 7 jours · 30 jours · 3 mois · 12 mois** (défaut 30 jours) ; 4 `StatCard` (CA, commandes, panier moyen, taux de transformation) ; **2 graphiques SVG** (ventas dans le temps §3.13 ; répartition par statut en barres horizontales `bg-terracotta` / `bg-chocolate` / `bg-champagne`) ; tableau « top articles » ; états vides par période. |
| 47 | **Admin — notifications** `/admin/notifications` | File d'attente d moderation : onglets `Tabs` (À traiter / Envoyées) ; `ul` d'`NotificationItem` avec destinataire, canal, date, statut ; `[Renvoyer] outline sm` ; `EmptyState`. |
| 48 | **Admin — paramètres** `/admin/parametres` | `max-w-form` : `Card` « Plateforme » (nom, commission 10 % **affichée en lecture**, devise FCFA, pagination) · « Modération » (délai de validation, motifs de refus = `REJECTION_REASONS` en lecture) · « Emails » (activation des 6 templates, état du transporteur) · « Zone sensible » (`[Voir l'historique] outline`). |
| 49 | **États vides / chargés / erreur** | `EmptyState` (§3.12) + `Skeleton` (§3.11) + `ErrorMessage` (`rounded-md bg-danger-soft border-l-4 border-danger p-4 text-danger`, `role="alert"`, `showCode` → code machine) + `PageLoader` ; rafraîchissement = contenu conservé `opacity-60 pointer-events-none` + `aria-busy`. **Une page n'affiche jamais une surface vide.** |
| 50 | **404** `*` | Plein écran `bg-ivory` : mascotte 96 px `text-champagne-deep` + sur-titre `ERREUR 404` `text-terracotta-ink` + `h1 font-display 44px « Cette page n'a pas trouvé de seconde vie »` + texte (§3.12) + `[Retour à l'accueil] primary` + `[Voir mes commandes] outline` ; aucun footer sur le 404. |

---

## 5. Mobile-first (390×844 · 375×812 · 360×800)

1. **Un seul écran de référence** : 390×844 ; vérifier séparément 390 / 375 / 360 — le plus petit gagne.
2. **Header compact 56 px** : `bg-ink` ; logo (symbole 28 + wordmark 19) à gauche ; à droite `Notifications` (cloche 24 + badge), `Panier` (badge chiffré) ; le compte passe dans la bottom nav. Recherche = icône `fa-magnifying-glass` qui **s'étend au tap** en `absolute inset-x-0 top-14 bg-ink p-3` (`animate-fade-rise`).
3. **Bottom nav 64 px** (`h-16` + `padding-bottom: env(safe-area-inset-bottom)`), `bg-white border-t border-line`, `z-[100]`, 5 entrées : **Découvrir** · **Favoris** · **Panier** · **Vendre** · **Compte**. Item : `flex flex-col items-center gap-1 h-full justify-center` ; icône 22 ; label `text-[11px] font-semibold` ; inactif `text-muted`, **actif `text-terracotta-ink` + pastille 4 px `bg-terracotta` au-dessus de l'icône** ; badge compteur `absolute -top-0.5 -right-3 min-w-[18px] h-[18px] rounded-full bg-terracotta text-white text-[10px] font-bold`. Masquée sur `/login`, `/register`, le checkout et l'admin.
4. **Sticky CTA** : fiche produit et checkout → barre `fixed bottom-16 inset-x-0 z-[90] bg-white border-t border-line p-3` (+ `env(safe-area-inset-bottom)`) avec `[Panier ghost icône]` · prix `text-[17px] font-bold text-terracotta-ink` · `[Acheter] primary flex-1` (`h-12`). Toujours ≥ 44 px de haut.
5. **Grilles** : produits `grid-cols-2 gap-3` (390) / `gap-4` (≥640) ; `StatCard` `grid-cols-2` ; catégories `grid-cols-2` ; tableaux → `table-scroll` horizontal (jamais de carte empilée pour un tableau de données) ; checkout et panier → **une colonne**, récap en `Card` pleine largeur (pas de sticky).
6. **Typographie** : h1 page `text-[28px]` (palier §1.6) ; h2 `text-[24px]` ; hero h1 `font-display text-[34px]` ; corps `text-base` (≥16 px : pas de zoom iOS à la focus) ; jamais de `text-[13px]` pour une information importante.
7. **Safe areas** : `env(safe-area-inset-top)` sur la navbar (iOS), `env(safe-area-inset-bottom)` sur la bottom nav et les barres sticky ; jamais de contenu sous la zone d'encoche. **Cibles tactiles** : ≥ 44×44 px, `gap` ≥ 8 px entre cibles, jamais de `:hover`-only. **Formulaires** : `inputMode` explicite (`tel`, `numeric`, `email`, `url`), `Enter` = champ suivant, `autocomplete` sur email/password/name/tel, erreurs **sous le champ** (jamais en toast seul).
8. **Modale → Sheet** : sous 768 px, feuille basse `rounded-t-lg` avec poignée et pied d'action `sticky bottom-0 bg-white p-4 border-t border-line`. **Scroll** : `overscroll-behavior: contain` sur les sheets, aucun débordement horizontal (`scrollWidth === clientWidth` aux 5 breakpoints).

## 6. Responsive (1440 / 1280 / 1024 / 834 / 768)

| Élément | <768 | 768–1023 | 1024–1279 | 1280–1439 | ≥1440 |
|---|---|---|---|---|---|
| Conteneur public | `px-4` | `px-6` | `px-6` | `px-8` | `px-8` |
| Grille produits | 2 col | 3 col | 3 col | 4 col | 4 col |
| Catégories accueil | 2 | 3 | 5 | 5 | 5 |
| Filtres catalogue | Sheet | Sheet | rail 264 | rail 264 | rail 264 |
| Filtre actif | bouton « Filtrer » + badge | idem | pastille dans la barre | idem | idem |
| Navbar | compact 56 + bottom nav | complète 64 | complète 72 | 80 | 80 |
| Checkout / panier / produit | 1 col | 1 col | 2 col | 2 col | 2 col |
| Admin | 1 col + drawer | 1 col + drawer | 264 + 1fr | 264 + 1fr | 288 + 1fr (`max-w-wide`) |
| Tuile admin · Stepper | 1 col · libellé + Progress | 2 · idem | 4 · 4 pastilles | 4 · idem | 4 · idem + libellés |
| Panneau catégories | Sheet | Popover | Popover | Popover | Popover |

Règles : classes de base = mobile, jamais l'inverse ; `min-w-0` sur toute colonne de grille contenant du texte ; `line-clamp-2` sur les titres (jamais de troncage brutal) ; les images `loading="lazy"` sauf hero (`eager`) ; 834 px = point de bascule du **détail produit** (1 col → galerie + infos).

## 7. Micro-interactions (le polish n'est pas optionnel)

| Moment | Comportement | Durée / courbe |
|---|---|---|
| **Survol produit** | `translateY(-4px)` + `shadow-md` + **zoom image `1.05`** + barre d'actions qui monte (`translateY 8px→0`, opacité 0→1) | 300 ms `ease-soft` / 500 ms image |
| **Favori** | cœur `scale 1 → 1.32 → 0.92 → 1` + passage vide→plein Terracotta + toast | `heart-pop` 420 ms `ease-spring` |
| **Ajout panier** | le bouton passe `Ajouter` → `✓ Ajouté` (fond `bg-positive`), 1 600 ms ; **badge panier `cart-bump`** ; toast | 1600 ms + 340 ms |
| **Transition de page** | `animate-fade-rise` sur le `main` ; les images déjà vues ne se re-animent pas | 400 ms `ease-soft` |
| **Cascade de grille** | `.animate-fade-rise` + `animation-delay: min(index,11) × 50 ms` | — |
| **Progression** | largeur de barre `transition-[width] 500 ms` ; stepper : la pastille suit est remplie en 200 ms | 500 ms `ease-base` |
| **Toast** | entrée `translateX 16px→0` + opacité ; sortie : disparition simple (pas d'animation de sortie) ; max 3 empilés | 280 ms `ease-soft` |
| **Skeleton** | opacité `.55 ↔ 1` + shimmer 1.4 s ; **jamais** de spinner si un skeleton est possible | 1 400 ms |
| **Modale** | overlay `opacity 0→1` 200 ms + carte `scale .94→1` ; `body` scroll verrouillé | 280 ms `ease-spring` |
| **Filtres** | la grille passe `opacity-60 pointer-events-none` pendant le rechargement (`aria-busy`) + `Progress` 2 px sous l'en-tête | 300 ms |
| **Compteurs** | `count-up` 0→n en 400 ms + `tabular-nums` (pas d'animation si `prefers-reduced-motion`) | 400 ms |
| **Survol lien/bouton** | `translateY(-1px)` sur `outline`, opacité sur `ghost` | 200 ms `ease-base` |
| **Appui** | `active:scale-[0.98]` sur tous les éléments cliquables | 150 ms |
| **Aucune animation en boucle** sauf skeletons et `.animate-pulse` de l'étape courante | — | — |
| **`prefers-reduced-motion`** | le bloc existant (`index.css:179`) neutralise tout ; **en plus** : pas d'auto-rotation de bannière, pas de `count-up`, pas de shimmer, pas de `sheet-up` (apparition instantanée) | — |

**Phrases de toast imposées** (source unique ; aucune autre formulation) :

| Action | Toast (copie imposée) |
|---|---|
| Ajout / retrait du panier | « {nom} a été ajouté à votre panier. » · « Article retiré de votre panier. » |
| Favori | « Ajouté à vos favoris. » / « Retiré de vos favoris. » |
| Commande · champs invalides · connexion requise | « Commande confirmée — {n} article(s). ✓ » · « Veuillez corriger les champs en rouge avant de confirmer. » · « Connectez-vous pour confirmer votre commande. » |
| Produit déjà vendu | « Ce produit vient d'être vendu. » |
| Photos | « {n} photo(s) ajoutée(s). » / « Ajoutez au moins 3 photos. » |
| Publication | « Article envoyé — il sera visible après validation. » |
| Suppression (admin) · réception · paiement | « Article supprimé du catalogue. Le vendeur a été prévenu. » · « Réception confirmée. » · « Paiement marqué comme payé. » |
| Copie du n° de suivi · erreur réseau | « Numéro de commande copié. » · « Connexion impossible. Vérifiez votre réseau et réessayez. » |

## 8. Accessibilité (contrats mesurés, pas déclaratifs)

- **Contrastes mesurés sur les hex exacts** (ratios calculés) : `ink`/ivoire **16,47** · `ink`/blanc **18,21** · `chocolate`/blanc **13,80** · `muted`/blanc **5,91** · `muted`/ivoire **4,53** · `terracotta-ink`/blanc **5,82** · `terracotta-ink`/ivoire **5,26** · **blanc/`terracotta-strong` 5,10** · `positive`/blanc **6,29** · `positive`/`positive-soft` **5,30** · `danger`/`danger-soft` **5,83** · `chocolate`/`champagne-soft` **11,26** · `on-dark`/`ink` **16,47** · `on-dark-muted`/`ink` **7,83** · `on-dark-accent`/`ink` **6,91** · `line-strong`/blanc **3,36** (bordure de champ ≥ 3:1 exigé par 1.4.11).
- **La seule exception assumée** : `terracotta` `#C85A2A` sur blanc = **4,24** → **interdit en texte normal** ; autorisé uniquement en **grand texte (≥ 19 px / 700 → seuil 3,0)**, en aplat, en bordure et en icône. C'est pourquoi `terracotta-ink` existe et pourquoi le fond du CTA est `terracotta-strong`.
- **Focus** : anneau global `shadow-focus` (3 px Terracotta à 35 %) sur tout `:focus-visible` ; variante `shadow-focus-dark` sur les surfaces sombres ; `outline: none` uniquement accompagné de son remplacement ; **jamais** `outline-none` nu. Ordre de lecture : skip-link → navbar → fil d'Ariane → titre → filtres → liste → pagination.
- **Skip link** : `<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[400] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-on-dark">Aller au contenu</a>` + `<main id="main">` sur chaque page.
- **`aria` obligatoires** : `role="dialog"` + `aria-modal` + `aria-labelledby` + piège de focus sur modale/sheet ; `role="listbox"`/`option` + `aria-activedescendant` sur les suggestions ; `aria-live="polite"` sur le compteur de résultats et la liste de toasts, `role="alert"` sur les erreurs de formulaire et `ErrorMessage` ; `aria-current="page"` sur le fil d'Ariane et l'onglet actif ; `aria-pressed` sur les boutons icônes (favori, œil du mot de passe) ; `aria-busy` sur les zones en rafraîchissement ; `aria-label` **contextualisé** sur tout bouton icône (« Supprimer l'article iPhone 13 », « Ajouter iPhone 13 au panier ») ; `sr-only` pour `<caption>` de tableau.
- **Information jamais portée par la couleur seule** : `StatusBadge` = pastille **+** texte ; champs en erreur = bordure **+** message **+** icône ; graphique = Courbe **+** tableau de chiffres `sr-only` **+** tooltip.
- **Tailles** : corps ≥ 16 px sur mobile (anti-zoom iOS) ; aucune information importante < 13 px ; `tabular-nums` sur tous les chiffres alignés.
- **Images** : `alt` = nom du produit sur la photo produit, `alt=""` sur les photos purement décoratives, jamais de texte dans l'image seule.
- **`prefers-reduced-motion`** : contrat §7 appliqué (`index.css:179`) + `prefers-contrast: more` → bordure de champ forcée `border-chocolate`.
- **Test attendu** : aucune information sans nom accessible ; navigation clavier complète sur accueil, fiche produit, panier, checkout et admin ; `axe` sans violation « serious ».

## 9. Cohérence — règles anti-dérive (opposables en revue)

1. **Zéro hex hors §1.1.** Un `#` dans un `.tsx` = blocage. Seuls `index.css` et les SVG du logo contiennent des valeurs littérales.
2. **Zéro style inline métier** : aucun `style={{…}}` (le seul autorisé : largeur/hauteur dynamique d'une barre de progression calculée — et uniquement via variable CSS `--value`, pas de couleur).
3. **Zéro classe arbitraire** : pas de `shadow-[…]`, `bg-[…]`, `text-[#…]`, `rounded-[Npx]` pour une couleur/ombre/rayon. Les seuls `text-[Npx]` admis sont ceux de l'échelle typographique §1.6 ; les seuls `rounded-[…]` admis sont ceux de §1.5. (Exception : `max-md:min-h-[44px]` et `min-w-[…]` de cellule — documentés ici, donc autorisés.)
4. **Une seule source de vérité par libellé** : statuts dans `lib/constants.ts` (`ORDER_STATUS_LABELS`, `SECTION_TITLES`, `REJECTION_REASONS`), textes d'état vide dans `EMPTY_COPY`, toasts dans `TOAST_COPY`. Aucun libellé dupliqué dans un composant ou une page.
5. **Interdits de couleur** : aucun bleu, aucun vert décoratif, aucun rouge hors erreur, aucun ambre, aucun dégradé hors du voile hero/bannière sur image, aucun `backdrop-blur` (glassmorphism interdit) — sauf le voile d'overlay de modale.
6. **Hiérarchie** : un seul `h1` par page ; jamais deux tailles de titre « presque égales » sans raison ; `font-display` une fois par écran, jamais dans un chiffre.
7. **Composants partagés** : un comportement utilisé par ≥ 2 écrans vit dans `components/ui` (D11). Interdiction de recréer une carte, un badge, un champ ou une table dans une page.
8. **Ordre d'implémentation** : 1 `index.css` (§1) → 2 `Logo` + favicons → 3 `ui/` (Button, States, StatusBadge, StatCard, Pagination, Modal, Loading, ErrorMessage, FormField) → 4 `layout/` (Navbar, Footer, Sidebar, DashboardLayout, `BottomNav` nouveau) → 5 `catalog/` (ProductCard, FavoriteButton, CategoryCards, Filters, Breadcrumbs) → 6 `home/` (Hero, Sections, éditorial) → 7 pages publiques → 8 espace client + vendre → 9 admin. Chaque étape : `tsc -b` + `vitest` verts.
9. **Recette design** : captures aux 1440 / 1280 / 1024 / 768 / 390 des écrans 1, 2, 3, 7, 8, 10, 12→15, 16, 17, 18, 23, 31→33, 34, 36, 38, 43, 46, 50 ; contrôle automatique : (a) aucun `#` hors `index.css`/SVG ; (b) aucun `style={{` ; (c) aucune classe inexistante (compilation Tailwind) ; (d) `document.documentElement.scrollWidth === clientWidth` ; (e) `axe` sans violation sérieuse ; (f) aucune valeur hors §1 dans les classes.

---

*DoD @design : 50 écrans couverts (§4) · tokens complets et vérifiés (contrastes recalculés, 0 exception non documentée) · logo décrit en primitives, bbox et centrage vérifiés numériquement · 8 textes d'état vide imposés (4 tabulés + 4 compléments) + 16 phrases de toast imposées · anti-dérive opposable (§9). Aucune décision n'est laissée à `@frontend`.*
