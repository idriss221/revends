# SPÉCIFICATION VISUELLE & UX — Refonte Admin V5 (US-V5-03, CA-V5-031→048)

| | |
|---|---|
| **Projet** | ReVends — back-office d'administration (9 pages) |
| **Auteur / destinataire** | Agent design (direction visuelle UI/UX) → `@frontend` (web React + Vite + Tailwind v4.3) |
| **Sources de vérité** | `docs/cahier-des-charges-v5.md` §5.3 · `docs/design-system.md` (§2 tokens, §3 composants) · `web/src/index.css` (@theme réel) · `reference/maquette-revends.html` (L710-783 layout, L842-926 table+badge, L1953-2264 pages admin) |
| **Règle d'or** | **100 % tokens existants.** Les 11 tokens du §2.2 sont des *renommages de valeurs déjà présentes dans le code* → rendu strictement identique (CA-V5-032). |
| **Statut** | Spec prête à implémenter, sans invention. |

---

## 1. Décisions de design clés (à trancher d'un coup d'œil)

| # | Question | Décision | Cause |
|---|---|---|---|
| D1 | Convention de carte | **`Card` (States.tsx) est l'unique point d'entrée JSX** et rend la classe `.card` (index.css:134). Zéro `<div className="card">` brut, zéro `!p-*`, sur les 9 pages. | CA-V5-035 (D11) — les deux coexistent aujourd'hui |
| D2 | Convention de tableau | **Un seul `AdminTable`** porte l'enveloppe scrollable, le `<caption class="sr-only">`, les `th scope="col"`, la largeur min et la pagination. 7 pages l'utilisent. | CA-V5-036 (E7) — 6 copies, 4 `min-w` divergents |
| D3 | Modales d'action | **Un seul `ConfirmAction`** (+ preset `ConfirmDelete`) : corps, pied, bandeau, vocabulaire identiques sur les 5 modales d'action. | CA-V5-037 (E9) |
| D4 | Corps de cellule | `th`/`td` en **`text-sm` (14 px)**, pas 16 px. | 16 px (maquette L871) sur 6 colonnes à 1024 px impose un scroll horizontal permanent, contraire à CA-V5-038. Divergence assumée (§9.4-1) |
| D5 | Casse des en-têtes | `th` en **`uppercase tracking-wide`** — la maquette l'exige (L877-881), absent des 6 tables actuelles. | Fidélité design-system §2.4 |
| D6 | Montants en table | **`text-ink font-semibold`** (et non `text-primary`). | `#FF6B35`/blanc = **2,84:1** : le prix de table orange 14 px échoue AA. Maquette L2145 : prix de table en encre |
| D7 | Montants « héros » | `text-[32px] font-bold text-primary` (dashboard, en-tête de détail) : 32 px/700 = grand texte → AA à 3:1. | design-system §2.4 |
| D8 | Lien orange | Réservé aux libellés **≥ 16 px/600, toujours avec une icône**. Jamais seul en 14 px. | 2,84:1 compensé par la forme, pas la couleur |
| D9 | Statut ≠ couleur seule | **`StatusBadge` gagne `dot`** (point `h-1.5 w-1.5 rounded-full bg-current`). `dot` forcé dans l'admin, `false` sur le front public → zéro régression. | WCAG 1.4.1 + mitigiation déjà prévue design-system §6.2 |
| D10 | Bandeaux | Un seul composant `Notice` : `soft-warning`/`amber-deep` (action attendue), `soft-danger`/`danger` (danger), `soft-info`/`secondary` (contexte), `soft-success`/`success`. Rayon 10 px, `px-4 py-3`. | Les 6 bandeaux du détail commande sont recopiés à la main |
| D11 | Filtres | `AdminFilterBar` **sans carte**, posé sur `bg-bg` ; la table reste la seule surface blanche. Hiérarchie : en-tête → barre d'outils → carte. | Sépare les 2 plans, évite le conflit de padding de `.card` |
| D12 | Rythme des blocs | `AdminPageHeader mb-6` (24) · `AdminFilterBar mb-6` · `Card mb-6` (`.card` L138) · grille de `StatCard mb-7.5` (30, valeur actuelle). | design-system §2.5 |
| D13 | Hauteur de ligne | **82 px** (vignette 50 + 2×16 de padding maquette) sur toutes les pages, 52 px sans vignette. | CA-V5-045 (hauteurs identiques) |
| D14 | Breakpoints | Convention **`max-[…]` seule** : `1279` / `1200` / `1024` / `968` / `560`. Aucun `md:`/`lg:`/`xl:` dans l'admin. | La sidebar 260 px décale la largeur utile : `md:` (768) est trompeur (CA-V5-038, E8) |
| D15 | Padding du `main` | `p-6` puis `max-[1200px]:p-5` (au lieu de `p-[30px]` fixe). | 724 px utiles à 1024 px au lieu de 644 |
| D16 | Barre de burger | Rendue **seulement sous 968 px** (`hidden max-[968px]:flex`) au lieu d'une rangée vide permanente. | 75 px de hauteur morte supprimés sur desktop (bug existant) |
| D17 | Entrée d'écran | `animate-page-in` (0,5 s, +20 px) + cascade `.stagger-1..4` (60/120/180/240 ms) sur les cartes du dashboard. | design-system §2.8/§6.1, sans `style={{` (utilitaires CSS, CA-V5-033) |
| D18 | Focus sur fond sombre | Anneau blanc `.focus-ring-light` (sidebar, surfaces sombres), anneau orange `shadow-focus` ailleurs. | Anneau orange invisible sur `#1A1A2E` |

---

## 2. Tokens

### 2.1 Tokens existants utilisés (aucun nouveau)
`text-ink` `bg-ink` `text-gray` `bg-bg` `bg-white` `text-white` `text-white/80` `text-white/60` `bg-white/20` · `bg-primary` `text-primary` `hover:bg-primary-dark` `hover:text-primary-dark` `bg-secondary` `text-secondary` · `bg-success text-success` `bg-warning` `bg-danger text-danger` `bg-gray-light` `border-gray-light` · `bg-soft-success` `bg-soft-info` `bg-soft-warning` `bg-soft-danger` `bg-soft-orange` `bg-soft-purple` `text-purple-icon` `text-amber-deep` · `shadow-soft` (cartes) `shadow-card` `shadow-hover` (survol action) `shadow-floating` (modale) `shadow-nav` · `rounded-lg` (8) `rounded-[10px]` `rounded-[12px]` `rounded-[15px]` (carte) `rounded-[20px]` (modale) `rounded-full` · typo `text-[28px] font-bold` (H1) `text-xl font-semibold` (H3 carte) `text-base font-semibold` (H3 bloc) `text-sm` (corps) `text-xs uppercase tracking-wide` (label) `text-sm font-medium` (valeur) · structures `.card` `.field-input` `.table-scroll` `.section-underline` `.page-enter` · animations `animate-page-in` `animate-pop-in` `animate-skeleton` `animate-notif-in`.

### 2.2 Tokens à **ajouter** à `@theme` (renommages — rendu identique, exigés par CA-V5-047)

| Token | Valeur | Usage | Justification (valeur déjà présente dans le code) |
|---|---|---|---|
| `--color-white` | `#ffffff` | `bg-white`/`text-white` explicites | `--white` maquette ; supprime le repli `var(--color-white, #ffffff)` |
| `--color-line` | `#e5e7eb` | séparateurs de timeline et de liste | **`bg-line`/`ring-line`/`border-line` (`OrderTimeline:75,87,127`) ne génèrent aucun CSS aujourd'hui** — bug silencieux, absent du cahier |
| `--color-overlay` | `rgba(26,26,46,0.5)` | overlay modale + drawer | `Modal.tsx:32`, `DashboardLayout.tsx:22` |
| `--color-primary-wash` | `rgba(255,107,53,0.05)` | survol zone upload, radio sélectionnée | maquette `.upload-area:hover` L970 ; `AdminPendingPage:228` |
| `--color-primary-glow` | `rgba(255,107,53,0.40)` | halo du bouton primaire | design-system §2.7 `shadow-btn-hover` |
| `--color-secondary-dark` | `#004980` | survol bouton secondaire | `Button.tsx:14` |
| `--color-success-dark` | `#00ba4d` | survol bouton succès | `Button.tsx:15` |
| `--color-danger-dark` | `#ed153f` | survol bouton danger | `Button.tsx:16` |
| `--shadow-btn` | `0 4px 12px rgba(255,107,53,0.4)` | survol bouton primaire | remplace `shadow-[…]` de `Button.tsx:10` |
| `--shadow-focus` | `0 0 0 3px rgba(255,107,53,0.4)` | anneau focus | `index.css:108` (constante à sortir) |
| `--shadow-focus-light` | `0 0 0 3px rgba(255,255,255,0.45)` | anneau focus sur fond sombre | ajout a11y, aucune teinte nouvelle |

Ajout dans `@layer utilities` : `.focus-ring-light` (box-shadow ci-dessus) et `.stagger-1/.stagger-2/.stagger-3/.stagger-4` (`animation-delay: 60/120/180/240ms`).
Hex en dur à remplacer : `AdminPendingPage:237` `accent-[#ff6b35]` → **`accent-primary`** ; `ProductPage:256` `hover:bg-soft-primary` (classe inexistante, aucun style rendu) → **`hover:bg-soft-orange`**.

---

## 3. Structure type d'une page admin

```
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ SIDEBAR 260px │ ① AdminPageHeader                                             │
│  (inchangée)  │   Articles                             [actions boutons →]     │
│  Dashboard    │   18 articles · 12 en attente                                 │
│  Articles ⬤12 │ ② AdminFilterBar — sur fond page, SANS carte                  │
│  Commandes    │   [🔍 Rechercher un article… 288px] [Tous les statuts ▾ 256]   │
│  Paiements    │   [↺ Réinitialiser]                          → 12 résultats   │
│  Utilisateurs ├──────────────────────────────────────────────────────────────┤
│  Catégories   │ ③ Card → AdminTable                                           │
│  Historique   │   ┌───────────┬─────────┬────────┬──────────┬─────────┐        │
│               │   │ ARTICULE  │ VENDEUR │ PRIX   │ STATUT   │ ACTIONS │  th    │
│  ───────────  │   ├───────────┼─────────┼────────┼──────────┼─────────┤ sticky │
│  Déconnexion  │   │ ▤ iPhone13│ Awa K.  │ 250 000│ ●Publié │[👁][🗑] │        │
│               │   │ ▤ Canapé  │ Yao B.  │ 180 000│ ●En att.│[👁][🗑] │  82px  │
│  main : bg-bg · p-6 (max-[1200px]:p-5) · animate-page-in · aucune largeur fixe│
│  ④ vide / erreur → DANS la carte, jamais une surface vide à côté            │
└───────────────┴──────────────────────────────────────────────────────────────┘
  ordre : PageHeader → FilterBar → Card(table) → Notice → Card(détail) → retour
  la page ne déborde JAMAIS (scrollWidth === clientWidth) ; seul ③ défile à l'horiz.
```

---

## 4. Composants

### 4.1 `AdminPageHeader` (nouveau — remplace `DashboardHeader` sur les 9 pages)
```tsx
interface AdminPageHeaderProps {
  title: string
  subtitle?: string                              // 14px gray — contexte, jamais l'action
  actions?: ReactNode                            // boutons à droite, alignés en bas
  breadcrumb?: { label: string; to: string }[]   // détail commande / produit
  meta?: ReactNode                               // badges + date, rangée sous le titre
}
```
```tsx
<header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
  <div className="min-w-0">
    {breadcrumb && <nav aria-label="Fil d'Ariane" className="mb-2 flex items-center gap-2 text-sm text-gray">
      {breadcrumb.map((b, i) => <Fragment key={b.to}>
        <Link to={b.to} className="font-medium text-primary hover:text-primary-dark hover:underline">{b.label}</Link>
        {i < breadcrumb.length - 1 && <i className="fas fa-chevron-right text-[10px]" aria-hidden="true" />}</Fragment>)}
    </nav>}
    <h1 className="text-[28px] font-bold leading-tight text-ink">{title}</h1>
    {subtitle && <p className="mt-1 text-sm text-gray">{subtitle}</p>}
    {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
  </div>
  {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
</header>
```
`h1` 28 px/700 (maquette `.dashboard-header h1` L769) · `mb-6` · lien du fil d'Ariane `text-sm` + icône (D8). `DashboardHeader` reste exporté mais n'est plus appelé par l'admin.

### 4.2 `AdminFilterBar` (nouveau)
```tsx
interface AdminFilterBarProps {
  search?: { value: string; onChange: (v: string) => void; placeholder: string; label: string }
  select?: { value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[] }
  actions?: ReactNode
  resultCount?: { total: number; noun: string }   // rendu avec aria-live
  onReset?: () => void
}
```
```tsx
<div className="mb-6 flex flex-wrap items-center gap-3">
  {search && <div className="relative w-72 max-w-full">
    <i className="fas fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray" aria-hidden="true" />
    <input type="search" aria-label={search.label} placeholder={search.placeholder} className="field-input pl-11" />
  </div>}
  {select && <div className="w-64 max-w-full">
    <select aria-label={select.label} className="field-input cursor-pointer">
      {select.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  </div>}
  {onReset && <Button variant="outline" size="small" onClick={onReset}><i className="fas fa-rotate-left" aria-hidden="true" /> Réinitialiser</Button>}
  {actions}
  {resultCount && <p aria-live="polite" className="ml-auto text-sm text-gray">{resultCount.total} {resultCount.noun}</p>}
</div>
```
Largeurs fixées par le composant (plus de `!w-64` dispersé) · hauteur 48 px (`.field-input` L285-290) · debounce 350 ms conservé côté page.

### 4.3 `AdminTable` (nouveau — les 7 pages à tableau)
```tsx
export interface AdminColumn<T> { key: string; header: string; align?: 'left' | 'right'; widthClass?: string; cell: (row: T) => ReactNode }

interface AdminTableProps<T> {
  caption: string                       // titre accessible (sr-only)
  noun: string                          // « articles », « commandes », « utilisateurs »…
  columns: AdminColumn<T>[]
  rows: T[];  rowKey: (row: T) => string | number;  onRowClick?: (row: T) => void
  minWidth?: 'sm' | 'md' | 'lg'         // 640 | 760 (défaut) | 900
  isLoading?: boolean; skeletonRows?: number      // défaut 6
  isError?: boolean;  error?: unknown;  onRetry?: () => void
  empty?: { icon?: string; title: string; description?: string }
  page?: number; totalPages?: number; total?: number; onPageChange?: (p: number) => void
}
```
```tsx
<Card>
  <div className="table-scroll overflow-x-auto overscroll-x-contain max-h-[70vh] max-[968px]:max-h-none"
       role="region" aria-label={caption} tabIndex={0}>
    <table className={`w-full min-w-[${MINW[minWidth]}] border-collapse`}>
      <caption className="sr-only">{caption}</caption>
      <thead><tr>{columns.map(c => <th key={c.key} scope="col"
        className="sticky top-0 z-10 whitespace-nowrap border-b-2 border-gray-light bg-white px-4 py-4 text-left text-sm font-semibold uppercase tracking-wide text-gray">{c.header}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined}
        className={`border-b border-gray-light transition-colors duration-300 hover:bg-bg ${onRowClick ? 'cursor-pointer' : ''}`}>
        {columns.map(c => <td key={c.key} className="px-4 py-4 align-middle text-sm text-ink">{c.cell(row)}</td>)}
      </tr>)}</tbody>
    </table>
  </div>
  {/* états rendus DANS la carte (§7) : skeleton aligné colonnes / EmptyState panel / ErrorMessage */}
  <Pagination page={page} totalPages={totalPages} total={total} noun={noun} onChange={onPageChange} />
</Card>
```
- **En-tête collant** : `overflow-x-auto` fait du wrapper un conteneur de scroll sur les 2 axes ; `sticky` n'est donc visible qu'avec une hauteur contrainte → `max-h-[70vh]`, retirée sous 968 px. Sans contrainte, l'en-tête reste stylé, non collant.
- `th` = maquette L877-881 (14 px/600/`uppercase`/gray) + `border-b-2` pour la hiérarchie (maquette = 1 px, §9.4-2) · `td` = `px-4 py-4` (L871) · `tr:hover` = `bg-bg` (L884) · **pas de zébrage** (absent de la maquette).
- **Pagination** en pied de carte : `mt-6 flex items-center justify-between border-t border-gray-light pt-5` ; libellé `{total} {noun} · page {page}/{totalPages}` — **`noun` devient une prop** (aujourd'hui « article » est figé et s'affiche sur Commandes, Paiements, Utilisateurs, Historique : CA-V5-044).
- **Ligne cliquable** : jamais seule — la 1ʳᵉ cellule porte toujours un vrai `<Link>` ; le `onClick` de la ligne est un bonus, pas le seul chemin (clavier). Pas de `tabIndex` sur `<tr>`.
- Sous-élément **`ProductCell`** (4 pages) : `flex items-center gap-3` (L888) + `img h-[50px] w-[50px] rounded-lg object-cover` (L890-894), ou tuile de repli `flex h-[50px] w-[50px] items-center justify-center rounded-lg bg-bg text-gray-light` avec `fa-image` ; conteneur `min-w-0` + `truncate` sur le nom.

### 4.4 `ConfirmAction` (nouveau) + `ConfirmDelete` (preset)
```tsx
interface ConfirmActionProps {
  open: boolean; onClose: () => void; onConfirm: () => void
  title: string; confirmLabel: string; loading?: boolean; dismissable?: boolean
  message: ReactNode
  consequences?: { icon: string; text: string }[]   // « ce qui va se passer »
  urgency?: 'none' | 'info' | 'warning' | 'danger'  // bandeau
  tone?: ButtonVariant                              // défaut 'secondary'
  children?: ReactNode                               // champ (motif, référence…)
  size?: 'sm' | 'md' | 'lg' | 'xl'                   // max-w-sm | max-w-md | max-w-2xl | max-w-4xl
  confirmDisabled?: boolean
}
```
```tsx
<Modal open={open} title={title} onClose={onClose} size={size} dismissable={dismissable}>
  {urgency !== 'none'
    ? <div className={`mb-5 flex items-start gap-3 rounded-[10px] px-4 py-3.5 text-sm ${TONE[urgency]}`}>
        <i className={`fas ${ICON[urgency]} mt-0.5`} aria-hidden="true" />
        <div>{message}{consequences && <ul className="mt-2 space-y-1">
          {consequences.map(c => <li key={c.text} className="flex items-start gap-2">
            <i className={`fas ${c.icon} mt-1 text-[10px]`} aria-hidden="true" />{c.text}</li>)}</ul>}</div>
      </div>
    : <div className="mb-5 text-sm text-gray">{message}</div>}
  {children}
  <div className="mt-6 flex flex-wrap justify-end gap-3">
    <Button variant="outline" onClick={onClose}>Annuler</Button>
    <Button variant={tone} loading={loading} disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</Button>
  </div>
</Modal>
```
`TONE` = `danger: bg-soft-danger text-danger` · `warning: bg-soft-warning text-amber-deep` · `info: bg-soft-info text-secondary` · `success: bg-soft-success text-success` ; `ICON` = `fa-triangle-exclamation` · `fa-info-circle` · `fa-check-circle`. Pied : `Annuler` (outline) puis l'action. **Vocabulaire fermé (RG-V5-08)** :

| Action | Titre | Libellé du bouton | `tone` | `urgency` |
|---|---|---|---|---|
| Supprimer un article | Cette action est irréversible | Supprimer l'article | `danger` | `danger` |
| Désactiver une catégorie | Désactiver la catégorie | Désactiver | `secondary` | `warning` (réversible) |
| Refuser un article | Refuser « {nom} » | Confirmer le refus | `danger` | `danger` |
| Approuver un article | Approuver l'article | Confirmer l'approbation | `success` | `info` |
| Annuler une commande | Annuler la commande | Annuler définitivement | `danger` | `danger` |
| Payer un vendeur | Marquer comme payé | Marquer comme payé | `secondary` | `warning` |
| Renommer une catégorie | Renommer la catégorie | Enregistrer | `primary` | `none` |

`ConfirmDelete` = préréglage : `title="Cette action est irréversible"` · `urgency="danger"` · `tone="danger"` · `consequences` obligatoire (retrait du catalogue, notification au vendeur, **aucune restauration**) · `confirmLabel="Supprimer l'article"`.

### 4.5 `AdminProductSheet` (nouveau — remplace `ProductPreview` + la modale de détail article)
Dossier produit en 2 colonnes, `Modal size="xl"` (`max-w-4xl`) ; la composante ne possède **que la mise en page**, les actions sont fournies par la page (`actions: ReactNode`) → le flux de modération de `AdminPendingPage` reste strictement inchangé (CA-V5-048).
```
┌──────────────────────────────────────────────────────────────────────┐
│ iPhone 13 · Bon état                                          [✕]    │
├──────────────────────┬───────────────────────────────────────────────┤
│ MODÉRATION           │ APERÇU                    (7/12)              │
│  ● En attente        │  photo principale h-[240px] rounded-[15px]    │  (5/12)
│  250 000 FCFA        │  object-cover                               │
│  Description 14px    │  [▣64][▣64][▣64][▣64]  rounded-[10px]        │
│  [✔ Approuver]       │    bordure 2px transparent, actif primary    │
│  [✖ Refuser]         │  Catégorie · État · Localisation             │
│  — ou —              │  Vendeur · Téléphone · Soumis le            │
│  [👁 Voir][🗑 Suppr.]│                                               │
├──────────────────────┴───────────────────────────────────────────────┤
│                    [ Annuler ]  [ action principale ]                 │
└──────────────────────────────────────────────────────────────────────┘
  max-[968px] : 1 colonne, aperçu d'abord puis actions ; hauteur max 70vh interne
```

### 4.6 Composants existants à faire évoluer (delta uniquement)

| Composant | Delta | Motivation |
|---|---|---|
| `Modal` | + `size` ; focus **piégé** à l'ouverture, **restauré au déclencheur** à la fermeture ; `aria-labelledby` sur le `h2` | CA-V5-043 (Échap + retour focus) — absent aujourd'hui |
| `EmptyState` | + `variant?: 'card' \| 'panel'` (`panel` = sans surface, `py-10 text-center`) | état vide **dans** la carte, sans `!p-10` (CA-V5-034/035) |
| `ErrorMessage` | + `action?: { label: string; onClick: () => void }` → `Button variant="outline" size="small"` ; conteneur `flex items-start justify-between gap-4` | tout état d'erreur doit être rattrapable (RG-V5-08) |
| `StatusBadge` | + `dot?: boolean` (point `h-1.5 w-1.5 rounded-full bg-current`, `gap-1.5`), défaut `false` | D9 |
| `StatCard` | conteneur `flex h-full flex-col`, valeur en `mt-auto` ; `subtitle` accepte un `ReactNode` | hauteur homogène ±2 px (CA-V5-039) même si un titre passe à la ligne |
| `Pagination` | + `noun: string` ; `mt-6 … border-t border-gray-light pt-5` ; `aria-label` sur les 2 boutons (« Page précédente / suivante ») | CA-V5-044 + a11y |
| `Loading` | `TableSkeleton` devient **aligné colonnes**, rendu dans la carte, enveloppé `role="status" aria-label="Chargement"` | pas de saut de mise en page au chargement |
| `States` | commentaire d'en-tête fixant D1 (`.card` = CSS, `Card` = JSX) | CA-V5-035 |
| `Button` | `hover:shadow-btn` + `hover:bg-success-dark` / `hover:bg-danger-dark` / `hover:bg-secondary-dark` (§2.2) | CA-V5-032 : plus aucun `shadow-[…]` |
| `DashboardLayout` | `main` → `p-6 max-[1200px]:p-5` + `animate-page-in` ; rangée du burger `hidden max-[968px]:flex mb-6` | D15, D16, D17 |
| `Sidebar` | `px-5 py-[30px]` (maquette L719) ; `mt-auto border-t border-white/10 pt-6` avant la déconnexion ; badge `aria-label="{label} : {n} en attente"` ; liens `focus-visible:focus-ring-light` | fidélité L716-756 + D18 |

---

## 5. Micro-interactions (design-system §2.8/§6.1)

Navigation `animate-page-in` (`opacity 0→1` + `translateY(20px→0)`, 0,5 s ease) · cascade dashboard `.stagger-1..4` (60/120/180/240 ms) · appui `active:scale-[0.97]` 0,15 s (déjà en base) · survol ligne `transition-colors duration-300` vers `bg-bg` (maquette `all .3s`) · survol tuile action `translateY(-2px)` + `shadow-hover` 0,3 s · compteurs 0→n par paliers 0,4 s, **coupés si `prefers-reduced-motion`** · modale `animate-pop-in` `scale .8→1` 0,3 s `cubic-bezier(0.2,0.8,0.2,1)` · toast `animate-notif-in` `scale .96→1` 0,2 s · skeleton `animate-skeleton` opacité .4↔.8 1,2 s · **aucune animation de sortie** sur les listes. Règle : un seul mouvement par moment (anti-bling) ; `prefers-reduced-motion` (index.css:179) neutralise tout.

---

## 6. Directives par écran (9 pages)

**1 · `AdminDashboardPage`** — `AdminPageHeader` « Dashboard » + `formatToday()`. `StatCard` ×4 en `grid grid-cols-4 gap-5 max-[1200px]:grid-cols-2 max-[560px]:grid-cols-1` : Utilisateurs (blue `fa-users`) · Articles en attente (orange `fa-clock`) · Commandes actives (purple `fa-shopping-cart`) · Paiements à payer (green `fa-money-bill-wave`, `subtitle` = montant) — ordre et variantes de la maquette L786-839, hauteur homogène. Puis, dans l'ordre : (a) **`Card` « Actions à effectuer »** = 6 lignes `flex items-center gap-4 rounded-[12px] bg-bg p-4 hover:bg-white hover:shadow-hover hover:-translate-y-0.5`, chacune `Link` vers son écran, compteur `h-8 min-w-8 rounded-full text-sm font-bold` (`bg-soft-warning text-amber-deep` si > 0, `bg-gray-light/60 text-gray` si 0) + chevron `group-hover:translate-x-1` ; (b) **`Card` « Progression des commandes »** = 8 tuiles `grid grid-cols-4 gap-4 max-[1200px]:grid-cols-2`, chacune `flex h-full items-center justify-between gap-2 rounded-[12px] bg-bg p-3` (libellé `truncate text-xs text-gray` · compte `text-lg font-bold text-ink` · `StatusBadge dot`), chaque tuile `Link` vers `/admin/commandes?status=…` ; (c) **`Card` « Paiements à payer »** = montant `text-[32px] font-bold text-primary` + « N paiement(s) vendeur » + `Button variant="primary"` « Payer les vendeurs » → `/admin/paiements`, alimentée par `stats.payoutsDue`/`payoutsDueAmount` **seulement, aucune requête supplémentaire** ; (d) `Card` « Accès rapides » = 4 liens `buttonClasses('outline','small')` sur une rangée `flex flex-wrap gap-3`.
**État vide** : si les 4 compteurs, les 8 statuts et `payoutsDue` valent 0, (b)(c)(d) laissent la place à un `EmptyState variant="card"` `fa-circle-check` « Tout est à jour », « Aucun article en attente, aucune commande à traiter, aucun paiement à effectuer. », action `{ label: 'Voir les articles', to: '/admin/articles' }`. Jamais 12 zéros nus.

**2 · `AdminPendingPage`** — `AdminPageHeader` « Articles en attente » + `meta` = `StatusBadge kind="pending" label="{n} à modérer"`. `AdminFilterBar` **sans filtre** (la page n'accepte que `PENDING`) : seul le compteur de résultat. `AdminTable` 5 colonnes : Article (`ProductCell` + catégorie `text-xs text-gray`) · Vendeur · Prix (`text-ink font-semibold`) · Date · Actions `[👁 Voir]` (outline) `[✔ Approuver]` (success) `[✖ Refuser]` (danger) en `size="small" gap-2`, `aria-label` nommant l'article. Modales : `ConfirmAction` (approbation, refus) — **libellés inchangés**, motif toujours dans la liste fermée `REJECTION_REASONS`, radios `accent-primary`, pied `Annuler` / `Confirmer le refus`.

**3 · `AdminArticlesPage`** — `AdminPageHeader` « Articles » + `subtitle` « {total} produits · {n} supprimables » ; `actions` = `Button variant="outline" size="small"` « Réinitialiser les filtres » (seulement si un filtre est actif). `AdminFilterBar` recherche + statut + réinitialisation. `AdminTable` 6 colonnes : Article · Vendeur · Prix · Statut (`StatusBadge dot`) · Date · Actions. La colonne Actions **n'existe que sur cette page** (CA-V5-048) : `[👁 Voir]` (outline) puis `[🗑 Supprimer]` (danger `size="small"`, `aria-label={`Supprimer l'article « ${p.name} »`}`) — état bloqué en §6-9. Ligne entière cliquable → `AdminProductSheet`.

**4 · `AdminOrdersPage`** — `AdminPageHeader` « Commandes ». `AdminFilterBar` : select statut (10 valeurs, `ORDER_STATUS_LABELS` — source unique, aucun libellé dupliqué) + compteur. `AdminTable` 6 colonnes : Commande (`<Link className="font-semibold text-secondary hover:text-primary">` + date `text-xs text-gray`) · Date · Article (`ProductCell`) · Acheteur · Montant (`text-ink font-semibold`) · Statut (`StatusBadge dot` + 2ᵉ badge `pending` « À payer » si `payout.status === 'DUE'`). `AdminOrdersPage` initialise `status` depuis `?status=` (§9.1) pour que les tuiles du dashboard mènent au bon filtre.

**5 · `AdminPaymentsPage`** — `AdminPageHeader` « Paiements vendeurs » + `subtitle` « Commission 10 % déjà déduite ». `AdminFilterBar` : select (À payer / Tous / En attente / Payés ; défaut « À payer », l'action quotidienne). `AdminTable` 7 colonnes, `minWidth="lg"` : Commande (lien + date) · Article · Vendeur · Montant vendeur (`text-ink font-semibold`) · Statut commande · Statut paiement (`—` en `text-sm text-gray` si `payout` null) · Action. Action : `[💸 Marquer comme payé]` (`variant="secondary" size="small"`) si `DUE`, sinon lien `text-sm font-semibold text-primary` « Voir détails » **avec icône** (D8). Modale `ConfirmAction` (référence de virement optionnelle).

**6 · `AdminUsersPage`** — `AdminPageHeader` « Utilisateurs ». `AdminFilterBar` : recherche seule (nom, e-mail, téléphone). `AdminTable` 5 colonnes : Nom (avatar `h-9 w-9 rounded-full bg-secondary text-white text-sm font-bold` = initiales, `aria-hidden`) · E-mail · Téléphone · Inscrit le · Activité (« 3 articles · 2 commandes », `text-sm text-gray`). **Lecture seule stricte** : aucun `Button` d'action, aucune colonne vide (CA-V5-041) ; le nom est dans la cellule voisine, donc l'initiale n'est pas l'unique information.

**7 · `AdminCategoriesPage`** — `AdminPageHeader` « Catégories » + `subtitle` « {n} racines · {m} sous-catégories ». `AdminTable` 3 colonnes, `minWidth="sm"` : Nom · Statut (`StatusBadge dot`) · Actions. **Hiérarchie sans `style={{`** (CA-V5-033) : deux classes de ligne — racine `pl-4` ; sous-catégorie `border-l-2 border-gray-light pl-10 text-sm text-gray` **+ étiquette textuelle `text-xs text-gray` « sous-catégorie »** (lisible, pas seulement indenté) ; racine et enfants dans des `<tbody>` distincts. Actions : `[✎ Renommer]` (outline) · `[⛔ Désactiver]` (danger) / `[✔ Activer]` (success) — **jamais « Supprimer »** (RG-V5-08). États : `TableSkeleton rows={4}` · `ErrorMessage` + Réessayer · `EmptyState variant="panel"` `fa-tags` « Aucune catégorie », « La liste des catégories est vide. ». Pas de pagination (liste fermée).

**8 · `AdminOrderDetailPage`** — `AdminPageHeader` avec fil d'Ariane `[Commandes]`, titre `{orderNumber}`, `meta` = `StatusBadge`, `subtitle` `Créée le {formatDateTime}` ; `actions` = `Button variant="outline" size="small"` « Voir la fiche produit » (→ `/catalogue/{slug}`, désactivé si produit indisponible). Bloc 2 **`Card` « Actions »** : `Notice` contextuelle (ton `warning` avant paiement/récupération/préparation, `info` à l'expédition, `success` si tout est réglé, `danger` si annulée), puis **une seule action dominante** `size="large" block` (`success` confirmer le paiement · `success` réception · `primary` marquer prête · `primary` expédier · `success` livrée · `secondary` `Marquer comme payé ({montant})`) et **l'action destructrice en second plan** : `Button variant="outline" size="small"` « Annuler la commande » aligné à droite sous l'action principale. Les 6 modales passent par `ConfirmAction` (§4.4) ; le libellé « Fermer » de la modale d'annulation devient « Annuler » (incohérence actuelle, CA-V5-037). Bloc 3 : grille `grid gap-5 max-[1279px]:grid-cols-2 max-[1024px]:grid-cols-1` de 6 blocs **redessinés en `Card`** (blanc, `rounded-[15px] p-6 shadow-soft`) — aujourd'hui `rounded-[14px] bg-bg p-5` **sur un `main` `bg-bg`, donc invisible** : Article (photo `h-40 rounded-[10px]` + `Voir l'article` primary block), Client, Propriétaire, Paiement client, Paiement propriétaire, Livraison. `Field` : label `text-xs font-semibold uppercase tracking-wide text-gray` + valeur `mt-0.5 text-sm font-medium text-ink`, `gap` 12 px. Bloc 4 : `Card` « Cycle de commande » + `OrderTimeline` (corriger `bg-line`/`ring-line` → token `--color-line`). Bloc 5 : lien de retour **supprimé** (remonté dans le fil d'Ariane).

**9 · `AdminArticlesPage` — action « Supprimer » (CA-V5-065, D6)** · état bloqué et motif :
```
commande disponible                        commande active
┌──────────────────────────────┐         ┌────────────────────────────────────┐
│ [👁 Voir] [🗑 Supprimer]     │         │ [👁 Voir] [🔒 Lié à une commande]  │
└──────────────────────────────┘         └────────────────────────────────────┘
 danger, size="small"                     danger désactivé (opacity .5, not-allowed)
 aria-label « Supprimer l'article « … » » aria-label « Suppression impossible : l'article
                                         « … » est lié à une commande en cours »
                                         + title identique (lisible à la souris)
```
`ProductAdmin` gagne `hasActiveOrder: boolean` (§9.1) ; champ absent → `false` (la garde serveur 409 reste la vérité, message toast dédié). **Aucune infobulle** : un élément `disabled` ne reçoit ni hover ni focus, donc **le libellé du bouton porte le motif** et la ligne entière n'est plus cliquable vers la suppression. `ConfirmDelete` s'ouvre ensuite, avec l'aperçu produit en en-tête et les conséquences énumérées (retrait du catalogue, notification au vendeur, aucune restauration possible).

---

## 7. États standardisés (identiques sur les 9 pages)

| État | Rendu | Condition |
|---|---|---|
| **Chargement** | squelettes **dans la carte**, alignés sur les colonnes (vignette `h-[50px] rounded-lg` + 2 lignes + 1 pastille par colonne), `bg-gray-light animate-skeleton`, conteneur `role="status" aria-label="Chargement des {noun}"` | `isPending` |
| **Vide** | `EmptyState variant="panel"` dans la carte : icône 48 px `bg-bg` + `text-gray-light`, titre `text-xl font-semibold text-ink`, texte `max-w-md text-sm text-gray`, CTA `buttonClasses('primary','small')`, **message spécifique** (« Rien en attente », « Aucun paiement ne correspond à ce filtre ») | `isSuccess && rows.length === 0` |
| **Erreur** | `ErrorMessage` **dans la carte** (`bg-soft-danger text-danger`, rayon 10, `role="alert"`, `showCode`) + bouton `Réessayer` | `isError` |
| **Rafraîchissement** | données conservées, `opacity-60 pointer-events-none` sur la carte + `aria-busy="true"` | `isFetching && !isPending` |
| **Action en cours** | bouton `loading` (spinner) + `aria-busy`, pas de double soumission | mutation |

---

## 8. Accessibilité (CA-V5-043)

- **Focus visible partout** : anneau global `shadow-focus` (`0 0 0 3px rgba(255,107,53,.4)`, `index.css:108` → token), `outline: none` conservé ; `.focus-ring-light` sur sidebar et surfaces sombres. Aucun `outline-none` sans remplacement.
- **Modale** : ouverture → focus sur le conteneur (`tabIndex={-1}`), **piégeage** de Tab/Shift+Tab, `Échap` ferme (sauf `dismissable={false}`), **focus rendu au déclencheur**, `aria-labelledby` sur le titre, `document.body` verrouillé (déjà en place).
- **Tableaux** : `<caption class="sr-only">`, `th scope="col"`, région scrollable `role="region" aria-label tabIndex={0}` (scroll clavier), `aria-live="polite"` sur le compteur de résultats.
- **Boutons icônes / actions de ligne** : `aria-label` obligatoire et **contextualisé** (« Supprimer l'article de *nom* », « Renommer la catégorie *Électronique* »). Jamais de bouton sans nom accessible.
- **Statuts** : pastille `dot` + texte (D9) — jamais la couleur seule (WCAG 1.4.1).
- **Contrastes** (mesurés sur les hex exacts) : `ink`/blanc **17,06** ✔ · `gray`/blanc **4,83** ✔ · `gray`/`bg` **4,51** ✔ · `secondary`/blanc **8,57** ✔ (lien commande) · `secondary`/`soft-info` **7,02** ✔ · `ink`/`soft-warning` **15,32** ✔. Corrections imposées : prix de table `text-ink` au lieu de `text-primary` (**2,84** ✗, D6) ; lien orange réservé aux libellés ≥ 16 px/600 **avec icône** (D8) ; montants héros ≥ 19 px/700 (`primary` acceptable en grand texte). Limites de la maquette conservées et assumées : pastils de badge (`success`/`soft-success` 1,97 ; `amber-deep`/`soft-warning` 2,86) et blanc sur boutons unis (2,24 à 3,85) — design-system §6.2 tranche en faveur de la fidélité ; `dot` + icône + libellé compensent l'information.
- **Clavier** : ordre de lecture = fil d'Ariane → titre → filtres → tableau → pagination ; la ligne entière n'est jamais le seul chemin (un vrai lien est toujours dans la 1ʳᵉ cellule) ; `Échap` ferme toute modale.
- **Cibles** : ≥ 44 px ; en table, `Button size="small"` (36 px) devient `max-[968px]:min-h-[44px]` (écart assumé, §9.4-5) ; vignette produit 50 px, avatar 36 px.
- **`prefers-reduced-motion`** : coupe les animations (index.css:179) **et** le compteur animé de `StatCard` (média query en JS).

---

## 9. Contrats & recette pour `@frontend`

**9.1 Contrats techniques** — **Types** (`web/src/lib/types.ts`) : `ProductAdmin` **+= `hasActiveOrder: boolean`** (backend, CA-V5-065) ; `AdminStats.orders` est déjà complet (8 compteurs, aucune requête ajoutée). **API** : aucun nouvel endpoint ; `api.deleteProduct(id)` ; 409 `PRODUCT_HAS_ACTIVE_ORDER` → `toast('error', …)` + invalidation. **Routes** : inchangées (9) ; `AdminOrdersPage` lit `?status=` pour que les tuiles du dashboard mènent au bon filtre (sinon bouton sans effet, RG-V5-08). **Nouveaux composants** : `AdminPageHeader`, `AdminFilterBar`, `AdminTable` (+ `ProductCell`), `ConfirmAction` (+ `ConfirmDelete`), `AdminProductSheet`. **Évolués** : `Modal`, `EmptyState`, `ErrorMessage`, `StatusBadge`, `StatCard`, `Pagination`, `TableSkeleton`, `Button`, `DashboardLayout`, `Sidebar`. **CSS** : les 11 tokens + 5 utilitaires du §2.2 dans `index.css`, aucun autre fichier. **Interdits** (test CA-V5-047) : `style={{`, `soft-primary`, `shadow-[`, `!w-…` hors composant, `bg-[rgba(`, `text-[#`, `min-w-[` hors `AdminTable`.

**9.2 Ordre d'implémentation** — 1 `index.css` (tokens + utilitaires) → 2 `Button`/`StatusBadge`/`Modal`/`EmptyState`/`ErrorMessage`/`Pagination` → 3 `AdminPageHeader` → 4 `AdminTable` + `ProductCell` → 5 `AdminFilterBar` → 6 `ConfirmAction`/`ConfirmDelete` → 7 migration des 7 pages à tableau → 8 Dashboard (4 cartes + 8 tuiles + paiements + vide) → 9 `AdminOrderDetailPage` → 10 `Sidebar`/`DashboardLayout` → 11 `AdminProductSheet` + Supprimer.

**9.3 Recette visuelle (CA-V5-045)** — captures des 9 pages en 1024 / 1280 / 1440 : (a) `h1` aligné sur le bord gauche du contenu, 28 px ; (b) `mb-6` entre tous les blocs ; (c) lignes de table à 82 px, `th` identiques, `td` 14 px ; (d) rayon 15 px et `shadow-soft` sur **toutes** les cartes, jamais `bg-bg` sur `bg-bg` ; (e) `document.documentElement.scrollWidth === clientWidth` ; (f) `grep -c "max-\[" ` ≥ 1 sur chaque page.

**9.4 Écarts résiduels assumés (honnêteté)** — (1) **`td` 14 px** au lieu de 16 px (maquette L871) : la 16 px sur 6 colonnes à 1024 px crée un scroll horizontal permanent, contraire à CA-V5-038 ; justifié en commentaire dans `AdminTable`. (2) **`th` à `border-b-2`** au lieu de 1 px (L874) : hiérarchie visuelle, valeur déjà présente au projet et conforme à §2.9. (3) **Token `--color-line`** : indispensable, `bg-line`/`ring-line`/`border-line` (`OrderTimeline`) ne produisent aucun CSS aujourd'hui — bug hors cahier. (4) **Pastille `dot` sur les badges** : sanctioned par design-system §6.2 (« pastille icône + pastel »), appliquée à l'admin seulement. (5) **Boutons de table 36 px**,compensés à 44 px sous 968 px, et **82 px de hauteur de ligne** : éléments non maquettés (§3.11). (6) **`.card` reste le nom CSS** (CA-V5-035) : `Card` = point d'entrée JSX, la classe = source de style unique ; une seule convention, deux couches.

*DoD design : tokens 100 % existants ou renommés (§2.2) ✔ · défauts vérifiés par compilation Tailwind réelle (`soft-primary`, `bg-line`, `shadow-[`, `accent-[`) ✔ · contrastes recalculés (§8) ✔ · 9 écrans couverts ✔ · aucun code produit, uniquement des contrats de classes.*
