#!/usr/bin/env node
/*
 * migrate-accent-tokens.mjs — codemod « jetons d'accent » (design-system §3.12)
 * ============================================================================
 *
 * POURQUOI UN CODEMOD
 * -------------------
 * `--terra` et `--bordeaux` servent aujourd'hui DEUX RÔLES OPPOSÉS :
 *   · FOND      → `.btn.terra`, `.card .flag`, `.seller .av`, `.opt.on`…
 *   · TEXTE     → `.eyebrow`, `.card .cat-lbl`, `.buy .cat-lbl`…
 * Aucun pont CSS ne peut les distinguer : il faut remplacer le jeton AU BON
 * ENDROIT, propriété par propriété. C'est mécanique — donc automatisable.
 *
 * TABLE APPLIQUÉE (docs/design-system.md §3.12)
 * ---------------------------------------------
 *   | Propriété d'origine | Legacy          | Remplacement  | Contrôle        |
 *   | color:              | --terra,--bordeaux| --accent-text | texte ≥ 4,5:1  |
 *   | color:              | --champ,--champagne| --champagne  | métal sur sombre|
 *   | background:         | --terra,--bordeaux| --accent      | blanc dessus   |
 *   | border-color:,border:| --terra,--bordeaux| --accent-ui  | ≥ 3:1          |
 *   | border:             | --champagne      | --line        | filet décoratif |
 *   | accent-color:       | --terra,--bordeaux| --accent-ui  | ≥ 3:1          |
 *   | box-shadow:,outline:| --terra          | --focus       | anneau ≥ 3:1    |
 *
 * Les cas où la MÊME propriété a deux rôles possibles (fond du badge vendeur
 * vs texte du label, verre du champ vs filet décoratif) sont listés dans la
 * table `OVERRIDES` ci-dessous : ils sont discriminés par le SÉLECTEUR, que le
 * codemod ne peut pas deviner à partir de la seule propriété.
 *
 * ÉTAT ATTENDU EN SORTIE
 * ----------------------
 * Aucun `var(--terra)`, `var(--bordeaux)`, `var(--champ)` ne doit subsister
 * dans les règles du site public : `--accent` (fond), `--accent-ui` (filet /
 * élément d'UI), `--accent-text` (texte), `--champagne` (métal).
 *
 * MODE D'EMPLOI
 * -------------
 *   node scripts/migrate-accent-tokens.mjs --check   # dry-run : rapport, rien n'est écrit
 *   node scripts/migrate-accent-tokens.mjs             # écrit les fichiers vendor
 *
 * Le script est IDEMPOTENT : une seconde exécution ne doit produire aucune
 * modification (vérifié par `--check` après coup).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const vendorDir = join(here, '..', 'src', 'bureau', 'vendor')
const FILES = ['styles']

/* ============================================================================
   1. GROUPES DE PROPRIÉTÉS
   ---------------------------------------------------------------------------
   Le RÔLE d'une couleur dépend de la propriété qui la consomme :
     · TEXT   → le jeton porte du TEXTE  → `--accent-text` (≥ 4,5:1)
     · BG     → le jeton porte un FOND   → `--accent` (fond d'action)
     · BORDER → le jeton porte un FILET  → `--accent-ui` (≥ 3:1)
     · SHADOW → le jeton porte un ANNEAU → `--focus`
   ========================================================================== */

const TEXT_PROPS = new Set([
  'color', 'fill', 'stroke', '-webkit-text-fill-color', 'text-fill-color', '--fg',
])
const BG_PROPS = new Set(['background', 'background-color', '--bg'])
const BORDER_PROPS = new Set([
  'border', 'border-color', 'border-top', 'border-top-color',
  'border-right', 'border-right-color', 'border-bottom', 'border-bottom-color',
  'border-left', 'border-left-color', 'border-block', 'border-block-color',
  'border-block-start', 'border-block-end', 'border-inline', 'border-inline-color',
  '--bd', 'accent-color', 'outline', 'outline-color',
])
const SHADOW_PROPS = new Set(['box-shadow'])

/* ============================================================================
   2. TABLES PAR RÔLE
   ========================================================================== */

/** TEXTE : un accent qui écrit du texte doit rester lisible (4,5:1). */
const TEXT_MAP = {
  '--terra': '--accent-text',
  '--bordeaux': '--accent-text',
  '--champ': '--champagne',
  '--champagne': '--champagne',
  '--ink': '--text-primary',
  '--charbon': '--text-primary',
  '--muted': '--text-secondary',
  '--gris': '--text-secondary',
  '--muted-2': '--text-tertiary',
  '--brown': '--text-secondary',
  '--white': '--on-accent',
  '--ivory': '--text-primary',
  '--paper': '--text-primary',
}

/** FOND : un aplat d'action. */
const BG_MAP = {
  '--terra': '--accent',
  '--bordeaux': '--accent',
  '--terra-dark': '--accent-hover',
  '--bordeaux-dark': '--accent-hover',
  '--champ': '--accent-soft',
  '--champagne': '--champagne-soft',
  '--ink': '--accent',
  '--white': '--surface-raised',
  '--ivory': '--surface-base',
  '--ivory-2': '--surface-hover',
  '--paper': '--surface-raised',
  '--paper-2': '--surface-base',
  '--beige': '--surface-sunken',
  '--brown': '--surface-overlay',
  '--brown-2': '--surface-overlay',
}

/** FOND des BOUTONS (propriétés `--bg` du système `.btn`). */
const BTN_BG_MAP = {
  '--terra': '--accent',
  '--bordeaux': '--accent',
  '--terra-dark': '--accent-hover',
  '--bordeaux-dark': '--accent-hover',
  '--ink': '--accent',
  '--brown': '--accent-hover',
  '--white': '--surface-raised',
  '--ivory': '--surface-overlay',
  '--ivory-2': '--surface-hover',
  '--paper': '--surface-raised',
  '--champ': '--accent-soft',
  '--champagne': '--champagne-soft',
  '--beige': '--surface-sunken',
}

/** FILET : un élément d'UI doit rester perceptible (3:1). */
const BORDER_MAP = {
  '--terra': '--accent-ui',
  '--bordeaux': '--accent-ui',
  '--champ': '--line',
  '--champagne': '--line',
  '--ink': '--line-strong',
  '--brown': '--line-strong',
  '--muted': '--line-strong',
  '--line-2': '--line',
}

/** FILET des BOUTONS (propriétés `--bd`). */
const BTN_BD_MAP = {
  '--terra': '--accent',
  '--bordeaux': '--accent',
  '--terra-dark': '--accent-hover',
  '--ink': '--accent',
  '--brown': '--accent-hover',
  '--champ': '--line-strong',
  '--champagne': '--line-strong',
}

/** ANNEAU / OMBRE : le focus ne doit jamais disparaître. */
const SHADOW_MAP = {
  '--terra': '--focus',
  '--bordeaux': '--focus',
}

/* ============================================================================
   3. LITTÉRAUX → JETONS  (les aplats figés dans le CSS)
   ---------------------------------------------------------------------------
   Les littéraux sont eux aussi scopés par rôle : un `#FFFFFF` n'est pas la
   même chose en `color:` (texte sur accent) et en `background:` (surface).
   ========================================================================== */

const TEXT_LITERALS = {
  /* texte sur aplat accent */
  '#fff': 'var(--on-photo-strong)',
  '#FFFFFF': 'var(--on-accent)',
  '#F7F3ED': 'var(--on-accent)',
  /* texte sur fond clair (champs posés sur une photo) */
  '#171514': 'var(--field-on-photo-text)',
  /* états */
  '#2F6B3F': 'var(--success)',
  '#A02C0A': 'var(--danger)',
  '#BFE8C4': 'var(--success-on-photo)',
  '#FFC4B2': 'var(--danger-on-photo)',
  '#FF9C82': 'var(--danger-on-photo)',
  /* texte sur photographie */
  'rgba(255,255,255,.92)': 'var(--on-photo)',
  'rgba(255,255,255,.9)': 'var(--on-photo)',
  'rgba(255,255,255,.88)': 'var(--on-photo)',
  'rgba(255,255,255,.82)': 'var(--on-photo)',
  'rgba(255,255,255,.8)': 'var(--on-photo-muted)',
  'rgba(255,255,255,.78)': 'var(--on-photo-muted)',
  'rgba(255,255,255,.72)': 'var(--on-photo-muted)',
  'rgba(255,255,255,.62)': 'var(--on-photo-line)',
  'rgba(255,255,255,.55)': 'var(--on-photo-line)',
  'rgba(255,255,255,.5)': 'var(--on-photo-line)',
  'rgba(255,255,255,.4)': 'var(--on-photo-line)',
  'rgba(255,255,255,.38)': 'var(--on-photo-line)',
  'rgba(255,255,255,.35)': 'var(--on-photo-line)',
  'rgba(255,255,255,.34)': 'var(--on-photo-line)',
  'rgba(255,255,255,.3)': 'var(--on-photo-line)',
  'rgba(255,255,255,.28)': 'var(--on-photo-line)',
  'rgba(255,255,255,.24)': 'var(--on-photo-line)',
  'rgba(255,255,255,.22)': 'var(--on-photo-line)',
  'rgba(255,255,255,.18)': 'var(--on-photo-line)',
  'rgba(255,255,255,.16)': 'var(--on-photo-line)',
  'rgba(255,255,255,.14)': 'var(--on-photo-hover)',
  'rgba(255,255,255,.12)': 'var(--on-photo-hover)',
  'rgba(255,255,255,.1)': 'var(--on-photo-hover)',
  'rgba(255,255,255,.03)': 'var(--on-photo-hover)',
  'rgba(247,243,236,.82)': 'var(--on-photo-muted)',
  'rgba(247,243,236,.78)': 'var(--on-photo-muted)',
  'rgba(247,243,236,.72)': 'var(--on-photo-muted)',
  'rgba(247,243,236,.7)': 'var(--text-secondary)',
  'rgba(247,243,236,.62)': 'var(--text-tertiary)',
  'rgba(247,243,236,.28)': 'var(--text-tertiary)',
  'rgba(247,243,236,.22)': 'var(--text-tertiary)',
  'rgba(247,243,236,.14)': 'var(--text-tertiary)',
  'rgba(247,243,236,.12)': 'var(--text-tertiary)',
  'rgba(247,243,236,.1)': 'var(--text-tertiary)',
  'rgba(247,243,236,.09)': 'var(--line)',
  'rgba(250,248,245,.78)': 'var(--text-secondary)',
  /* champs posés sur une photo : le fond du champ est toujours clair */
  'rgba(23,21,19,.64)': 'var(--field-on-photo-placeholder)',
  'rgba(23,21,19,.6)': 'var(--field-on-photo-placeholder)',
  'rgba(23,21,19,.55)': 'var(--field-on-photo-placeholder)',
  'rgba(23,21,19,.45)': 'var(--field-on-photo-placeholder)',
  'rgba(23,21,19,.44)': 'var(--field-on-photo-placeholder)',
  'rgba(23,21,19,.42)': 'var(--field-on-photo-placeholder)',
  'rgba(23,21,19,.4)': 'var(--field-on-photo-placeholder)',
  'rgba(23,21,19,.34)': 'var(--field-on-photo-placeholder)',
  'rgba(23,21,19,.2)': 'var(--field-on-photo-placeholder)',
}

const BG_LITERALS = {
  /* surfaces */
  '#FFFFFF': 'var(--surface-raised)',
  '#FAF8F5': 'var(--surface-base)',
  '#F7F3EC': 'var(--surface-base)',
  '#F1E8DC': 'var(--champagne-soft)',
  '#EFE9DE': 'var(--surface-sunken)',
  '#F5EDE2': 'var(--surface-hover)',
  '#11100F': 'var(--surface-base)',
  '#161413': 'var(--surface-raised)',
  '#191716': 'var(--surface-raised)',
  '#211D1B': 'var(--surface-overlay)',
  '#282321': 'var(--surface-hover)',
  /* traits */
  '#292522': 'var(--line)',
  '#352F2C': 'var(--line-strong)',
  '#ECECEC': 'var(--line)',
  '#EDEDED': 'var(--line)',
  '#E6DDCE': 'var(--line)',
  '#EFE8DC': 'var(--line)',
  '#DEDEDE': 'var(--line-strong)',
  /* accents (ancienne palette terracotta / bordeaux) */
  '#6B1728': 'var(--accent)',
  '#8F2940': 'var(--accent)',
  '#A83A52': 'var(--accent-hover)',
  '#52111F': 'var(--accent-hover)',
  '#C85A2A': 'var(--accent)',
  '#A8461F': 'var(--accent-hover)',
  /* champagne */
  '#D8C5AB': 'var(--champagne)',
  '#DCC8A8': 'var(--champagne)',
  '#CFCFCF': 'var(--champagne)',
  /* états */
  '#2F6B3F': 'var(--success)',
  '#A02C0A': 'var(--danger)',
  /* surfaces translucides */
  'rgba(255,255,255,.94)': 'var(--surface-overlay)',
  'rgba(255,255,255,.92)': 'color-mix(in srgb, var(--surface-raised) 92%, transparent)',
  'rgba(255,255,255,.9)': 'color-mix(in srgb, var(--surface-raised) 90%, transparent)',
  'rgba(255,255,255,.82)': 'var(--surface-overlay)',
  'rgba(255,255,255,.16)': 'var(--on-photo-hover)',
  'rgba(255,255,255,.14)': 'var(--on-photo-hover)',
  'rgba(255,255,255,.12)': 'var(--on-photo-hover)',
  'rgba(255,255,255,.03)': 'transparent',
  /* voiles */
  'rgba(23,21,19,.92)': 'var(--scrim-strong)',
  'rgba(23,21,19,.88)': 'var(--scrim-strong)',
  'rgba(23,21,19,.78)': 'var(--scrim)',
  'rgba(23,21,19,.72)': 'var(--scrim)',
  'rgba(23,21,19,.64)': 'var(--scrim-soft)',
  'rgba(15,12,10,.78)': 'rgba(8,7,7,.78)',
  'rgba(15,12,10,.55)': 'rgba(8,7,7,.55)',
  'rgba(15,12,10,.34)': 'rgba(8,7,7,.34)',
  'rgba(15,12,10,.18)': 'rgba(8,7,7,.18)',
  /* halos bordeaux (anciennement terracotta) */
  'rgba(200,90,42,.42)': 'rgba(142,35,55,.45)',
  'rgba(200,90,42,.36)': 'rgba(142,35,55,.38)',
  'rgba(200,90,42,.3)': 'rgba(142,35,55,.34)',
  'rgba(200,90,42,.16)': 'rgba(142,35,55,.18)',
  'rgba(200,90,42,.13)': 'rgba(142,35,55,.16)',
  'rgba(200,90,42,.1)': 'var(--accent-soft)',
  'rgba(200,90,42,.75)': 'rgba(142,35,55,.6)',
  'rgba(107,23,40,.7)': 'rgba(142,35,55,.55)',
  'rgba(107,23,40,.45)': 'rgba(142,35,55,.45)',
  'rgba(107,23,40,.3)': 'rgba(142,35,55,.35)',
  'rgba(107,23,40,.28)': 'rgba(142,35,55,.3)',
  'rgba(107,23,40,.15)': 'rgba(142,35,55,.16)',
  'rgba(107,23,40,.1)': 'rgba(142,35,55,.12)',
  'rgba(107,23,40,.09)': 'var(--accent-soft)',
  'rgba(220,200,168,.14)': 'rgba(217,199,172,.16)',
  'rgba(220,200,168,.34)': 'rgba(217,199,172,.38)',
  'rgba(58,41,35,.07)': 'rgba(23,21,19,.07)',
  'rgba(58,41,35,.06)': 'rgba(23,21,19,.06)',
  'rgba(160,44,10,.08)': 'rgba(163,44,34,.10)',
  'rgba(160,44,10,.1)': 'rgba(163,44,34,.12)',
}

const BORDER_LITERALS = {
  'rgba(255,255,255,.5)': 'var(--on-photo-line)',
  'rgba(255,255,255,.4)': 'var(--on-photo-line)',
  'rgba(255,255,255,.35)': 'var(--on-photo-line)',
  'rgba(255,255,255,.3)': 'var(--on-photo-line)',
  'rgba(255,255,255,.28)': 'var(--on-photo-line)',
  'rgba(255,255,255,.24)': 'var(--on-photo-line)',
  'rgba(255,255,255,.16)': 'var(--on-photo-line)',
  'rgba(247,243,236,.22)': 'var(--line-strong)',
  'rgba(247,243,236,.14)': 'var(--line)',
  'rgba(247,243,236,.12)': 'var(--line)',
  'rgba(247,243,236,.1)': 'var(--line)',
  'rgba(247,243,236,.09)': 'var(--line)',
  'rgba(23,21,19,.24)': 'var(--line)',
  'rgba(23,21,19,.22)': 'var(--field-on-photo-border)',
  'rgba(23,21,19,.15)': 'var(--field-on-photo-border)',
  'rgba(23,21,19,.14)': 'var(--field-on-photo-border)',
  'rgba(58,41,35,.22)': 'var(--field-on-photo-border)',
  'rgba(58,41,35,.16)': 'var(--field-on-photo-border)',
  'rgba(58,41,35,.15)': 'var(--field-on-photo-border)',
  'rgba(58,41,35,.14)': 'var(--line)',
  'rgba(107,23,40,.45)': 'var(--field-on-photo-border-strong)',
  'rgba(200,90,42,.42)': 'var(--field-on-photo-border-strong)',
  'rgba(107,23,40,.15)': 'rgba(142,35,55,.16)',
  'rgba(200,90,42,.13)': 'rgba(142,35,55,.16)',
  'rgba(200,90,42,.16)': 'rgba(142,35,55,.18)',
}

const SHADOW_LITERALS = {
  'rgba(168,58,82,.22)': 'rgba(142,35,55,.24)',
  'rgba(168,58,82,.14)': 'rgba(142,35,55,.16)',
  'rgba(200,90,42,.75)': 'rgba(142,35,55,.6)',
  'rgba(107,23,40,.7)': 'rgba(142,35,55,.55)',
}

/* ============================================================================
   4. RENOMMAGES DE JETONS (formes, rayons, ombres) — indépendants du rôle
   ========================================================================== */

const TOKEN_RENAMES = [
  ['--line-2', '--line'],
  ['--pill', '--r-pill'],
  ['--sh-sm', '--shadow-sm'],
  ['--sh', '--shadow-lg'],
  ['--r', '--r-md'],
]

/* ============================================================================
   5. EXCEPTIONS PAR SÉLECTEUR
   ---------------------------------------------------------------------------
   Cas où la propriété seule ne suffit pas à décider du jeton. L'ordre du
   tableau fait foi : la PREMIÈRE exception qui matche (sélecteur + propriété
   + présence du fragment source) gagne.
   ========================================================================== */

const O = (sel, prop, from, to) => ({ sel, prop, from, to })
/** Exception qui remplace la valeur ENTIÈRE (utile pour les valeurs multi-lignes). */
const OW = (sel, prop, to) => ({ sel, prop, from: null, to, whole: true })

const OVERRIDES = [
  /* --- Sélection & focus ------------------------------------------------- */
  O(/::selection$/, 'background', 'var(--champ)', 'var(--accent-soft)'),
  O(/::selection$/, 'color', 'var(--ink)', 'var(--accent-text)'),

  /* --- Boutons (§4.1) ---------------------------------------------------- */
  O(/^\.btn\.ghost\b/, '--bd', 'var(--ink)', 'var(--line-strong)'),
  O(/^\.btn\.ghost\b/, '--fg', 'var(--ink)', 'var(--text-primary)'),
  O(/^\.btn\.ghost:hover/, '--bg', 'var(--ink)', 'var(--surface-hover)'),
  O(/^\.btn\.ghost:hover/, '--fg', 'var(--white)', 'var(--text-primary)'),
  O(/^\.btn\.ghost:hover/, '--bd', 'var(--ink)', 'var(--line-strong)'),
  O(/^\.btn\.light\b/, '--bg', 'var(--ivory)', 'var(--surface-overlay)'),
  O(/^\.btn\.light\b/, '--bd', 'var(--ivory)', 'var(--line)'),
  O(/^\.btn\.light:hover/, '--bg', 'var(--white)', 'var(--surface-hover)'),
  O(/^\.btn\.light:hover/, '--bd', 'var(--white)', 'var(--line)'),

  /* --- En-tête (§4.5) ---------------------------------------------------- */
  O(/^\.skip\b/, 'background', 'var(--ink)', 'var(--accent)'),
  O(/^\.skip\b/, 'color', 'var(--white)', 'var(--on-accent)'),
  O(/^\.top-strip\b/, 'background', 'var(--ink)', 'var(--surface-raised)'),
  O(/^\.top-strip\b/, 'color', 'var(--ivory)', 'var(--text-secondary)'),
  O(/^\.logo b\b/, 'color', 'var(--terra)', 'var(--accent-ui)'),
  O(/^nav\.cats a\b/, 'color', 'var(--ink)', 'var(--text-secondary)'),
  O(/^nav\.cats a::after/, 'background', 'var(--terra)', 'var(--accent-ui)'),
  O(/^nav\.cats a::after/, 'background', 'var(--bordeaux)', 'var(--accent-ui)'),
  O(/^\.search input\b/, 'border', 'var(--line)', 'var(--line-strong)'),
  O(/^\.search input\b/, 'border-color', 'var(--ink)', 'var(--focus)'),
  O(/^\.ic \.badge\b/, 'background', 'var(--terra)', 'var(--accent)'),
  O(/^\.ic \.badge\b/, 'color', 'var(--white)', 'var(--on-accent)'),
  O(/^\.ic:hover/, 'background', 'var(--ivory)', 'var(--surface-hover)'),
  O(/^\.burger:hover/, 'background', 'var(--ivory)', 'var(--surface-hover)'),

  /* --- Héros : la photo impose ses propres couleurs (§5.1) --------------- */
  O(/^\.masthead\b/, 'background', 'var(--brown-2)', 'var(--surface-sunken)'),
  O(/^\.masthead\b/, 'color', 'var(--white)', 'var(--on-photo)'),
  OW(/^\.masthead::after/, 'background',
    'linear-gradient(180deg,rgba(8,7,7,0) 0%,rgba(8,7,7,.18) 16%,rgba(8,7,7,0) 34%,rgba(8,7,7,.34) 66%,rgba(8,7,7,.72) 100%)'),
  O(/^\.mh-scroll\b/, 'color', 'rgba(255,255,255,.8)', 'var(--on-photo-muted)'),
  O(/^\.mh-scroll:hover/, 'color', 'var(--white)', 'var(--on-photo-strong)'),
  O(/^body\.home header\.site:not\(\.solid\)/, 'color', 'var(--white)', 'var(--on-photo)'),
  O(/^body\.home header\.site:not\(\.solid\)/, '--fg', 'var(--white)', 'var(--on-photo)'),
  O(/^body\.home header\.site:not\(\.solid\)/, '--bd', 'rgba(255,255,255,.55)', 'var(--on-photo-line)'),
  O(/^body\.home header\.site:not\(\.solid\)/, '--bg', 'var(--white)', 'var(--on-photo)'),
  O(/^body\.home header\.site:not\(\.solid\)/, '--bd', 'var(--white)', 'var(--on-photo)'),
  O(/^body\.home header\.site:not\(\.solid\)/, '--fg', 'var(--ink)', 'var(--field-on-photo-text)'),
  O(/^\.btn\.ghost-light\b/, '--fg', 'var(--white)', 'var(--on-photo)'),
  O(/^\.btn\.ghost-light\b/, '--bd', 'rgba(255,255,255,.62)', 'var(--on-photo-line)'),
  O(/^\.btn\.ghost-light:hover/, '--bg', 'var(--white)', 'var(--on-photo)'),
  O(/^\.btn\.ghost-light:hover/, '--fg', 'var(--ink)', 'var(--field-on-photo-text)'),
  O(/^\.btn\.ghost-light:hover/, '--bd', 'var(--white)', 'var(--on-photo)'),

  /* --- Bandeaux & surfaces ------------------------------------------------ */
  O(/^\.section\.ivory\b/, 'background', 'var(--ivory)', 'var(--surface-sunken)'),
  O(/^\.trust\b/, 'background', 'var(--white)', 'var(--surface-base)'),
  O(/^\.mh-bridge\b/, 'background', 'var(--ivory)', 'var(--champagne-soft)'),
  O(/^\.editorial\b/, 'background', 'var(--brown)', 'var(--surface-raised)'),
  O(/^\.editorial\b/, 'color', 'var(--ivory)', 'var(--text-primary)'),
  O(/^\.editorial \.pic\b/, 'background', 'var(--brown-2)', 'var(--surface-sunken)'),
  O(/^\.editorial p\b/, 'color', 'rgba(247,243,236,.78)', 'var(--text-secondary)'),
  O(/^\.empty\b/, 'background', 'var(--ivory)', 'var(--surface-base)'),
  O(/^\.box\b/, 'background', 'var(--ivory)', 'var(--surface-raised)'),
  O(/^\.stat\b/, 'background', 'var(--ivory)', 'var(--surface-raised)'),
  O(/^\.acct \.who\b/, 'background', 'var(--ivory)', 'var(--surface-raised)'),

  /* --- Cartes produit (§4.3) -------------------------------------------- */
  O(/^\.card \.im\b/, 'background', 'var(--ivory)', 'var(--surface-sunken)'),
  O(/^\.card \.fav\b/, 'background', 'rgba(255,255,255,.82)', 'var(--surface-overlay)'),
  O(/^\.card \.fav\b/, 'background', 'var(--white)', 'var(--surface-overlay)'),
  O(/^\.card \.fav\b/, 'border', 'rgba(255,255,255,.5)', 'var(--line)'),
  O(/^\.card \.fav\b/, 'color', 'var(--ink)', 'var(--text-primary)'),
  O(/^\.card \.fav:hover/, 'background', 'var(--white)', 'var(--surface-hover)'),
  O(/^\.card \.fav\[aria-pressed/, 'color', 'var(--terra)', 'var(--accent-text)'),
  O(/^\.card \.cond-flag\b/, 'background', 'rgba(255,255,255,.9)', 'var(--surface-overlay)'),
  O(/^\.card \.cond-flag\b/, 'color', 'var(--ink)', 'var(--text-primary)'),
  O(/^\.card \.peek\b/, 'background', 'rgba(23,21,19,.72)', 'var(--scrim)'),
  O(/^\.card \.peek\b/, 'color', 'var(--white)', 'var(--on-photo)'),
  O(/^\.card \.peek:hover/, 'background', 'rgba(23,21,19,.92)', 'var(--scrim-strong)'),
  O(/^\.card \.cat-lbl\b/, 'color', 'var(--terra)', 'var(--accent-text)'),
  O(/^\.card \.by\b/, 'color', 'var(--muted-2)', 'var(--text-tertiary)'),

  /* --- Champs : la bordure est le seul indice d'existence (§7, faille 13) - */
  O(/^\.sel\b/, 'border', 'var(--line)', 'var(--line-strong)'),
  O(/^\.sel\b/, 'border-color', 'var(--ink)', 'var(--focus)'),
  O(/^\.inp\b/, 'border', 'var(--line)', 'var(--line-strong)'),
  O(/^\.inp\b/, 'border-color', 'var(--ink)', 'var(--focus)'),
  O(/^\.opt\b/, 'border', 'var(--line)', 'var(--line-strong)'),
  O(/^\.chip\b/, 'border', 'var(--line)', 'var(--line-strong)'),
  O(/^\.cbtn\b/, 'border', 'var(--line)', 'var(--line-strong)'),
  O(/^\.qty\b/, 'border', 'var(--line)', 'var(--line-strong)'),
  O(/^\.drop\b/, 'border', 'var(--champ)', 'var(--line-strong)'),
  O(/^\.drop:hover/, 'border-color', 'var(--terra)', 'var(--accent-ui)'),
  O(/^\.thumbs button\b/, 'border', 'var(--line)', 'var(--line-strong)'),
  O(/^\.thumbs button\b/, 'background', 'var(--ivory)', 'var(--surface-sunken)'),
  O(/^\.thumbs button\[aria-current/, 'border-color', 'var(--ink)', 'var(--accent-ui)'),
  O(/^\.steps \.s i\b/, 'border', 'var(--line)', 'var(--line-strong)'),
  O(/^\.opt\.on\b/, 'background', 'var(--ink)', 'var(--accent-soft)'),
  O(/^\.opt\.on\b/, 'color', 'var(--white)', 'var(--accent-text)'),
  O(/^\.opt\.on\b/, 'border-color', 'var(--ink)', 'var(--accent-ui)'),
  O(/^\.chip\.on\b/, 'background', 'var(--ink)', 'var(--accent-soft)'),
  O(/^\.chip\.on\b/, 'color', 'var(--white)', 'var(--accent-text)'),
  O(/^\.chip\.on\b/, 'border-color', 'var(--ink)', 'var(--accent-ui)'),
  O(/^\.cbtn\.primary\b/, 'background', 'var(--ink)', 'var(--accent)'),
  O(/^\.cbtn\.primary\b/, 'color', 'var(--white)', 'var(--on-accent)'),
  O(/^\.cbtn\.primary\b/, 'border-color', 'var(--ink)', 'var(--accent)'),
  O(/^\.cbtn\.facet\.on\b/, 'background', 'var(--ink)', 'var(--accent)'),
  O(/^\.cbtn\.facet\.on\b/, 'color', 'var(--white)', 'var(--on-accent)'),
  O(/^\.cbtn\.facet\.on\b/, 'border-color', 'var(--ink)', 'var(--accent)'),
  O(/^\.fx-head \.grab\b/, 'background', 'var(--line)', 'var(--line-strong)'),

  /* --- Fiche article (§5.3) --------------------------------------------- */
  O(/^\.gallery \.main\b/, 'background', 'var(--ivory)', 'var(--surface-sunken)'),
  O(/^\.line \.t\b/, 'background', 'var(--ivory)', 'var(--surface-sunken)'),
  O(/^\.preview-card \.im\b/, 'background', 'var(--ivory)', 'var(--surface-sunken)'),
  O(/^\.buy \.tag\b/, 'background', 'var(--champ)', 'var(--surface-overlay)'),
  O(/^\.buy \.tag\b/, 'color', 'var(--ink)', 'var(--text-primary)'),
  O(/^\.buy-price \.save\b/, 'background', 'rgba(200,90,42,.1)', 'var(--accent-soft)'),
  O(/^\.buy-price \.save\b/, 'color', 'var(--terra)', 'var(--accent-text)'),
  O(/^\.confbox\b/, 'background', 'var(--ivory)', 'var(--surface-overlay)'),
  O(/^\.confbox \.i\b/, 'color', 'var(--terra)', 'var(--champagne)'),
  O(/^\.note\b/, 'background', 'var(--ivory)', 'var(--surface-sunken)'),
  O(/^\.note\b/, 'border-left', 'var(--terra)', 'var(--accent-ui)'),
  O(/^\.seller \.av\b/, 'background', 'var(--brown)', 'var(--accent)'),
  O(/^\.seller \.av\b/, 'color', 'var(--champ)', 'var(--on-accent)'),
  O(/^\.acct \.who \.av\b/, 'background', 'var(--brown)', 'var(--accent)'),
  O(/^\.acct \.who \.av\b/, 'color', 'var(--champ)', 'var(--on-accent)'),
  O(/^\.buy \.cat-lbl\b/, 'color', 'var(--terra)', 'var(--accent-text)'),
  O(/^\.spec dt\b/, 'color', 'var(--muted)', 'var(--text-tertiary)'),
  O(/^\.eyebrow\b/, 'color', 'var(--terra)', 'var(--accent-text)'),
  O(/^\.trust \.i\b/, 'color', 'var(--terra)', 'var(--accent-ui)'),

  /* --- Publier (§5.8) ---------------------------------------------------- */
  O(/^\.commission\b/, 'background', 'var(--ink)', 'var(--surface-overlay)'),
  O(/^\.commission\b/, 'color', 'var(--ivory)', 'var(--text-primary)'),
  O(/^\.commission \.net\b/, 'color', 'var(--white)', 'var(--text-primary)'),
  O(/^\.drop\b/, 'background', 'var(--ivory)', 'var(--surface-base)'),
  O(/^\.drop:hover/, 'background', 'var(--ivory-2)', 'var(--surface-hover)'),
  O(/^\.drop \.i\b/, 'color', 'var(--terra)', 'var(--champagne)'),
  O(/^\.steps \.s\.done i\b/, 'background', 'var(--ink)', 'var(--champagne)'),
  O(/^\.steps \.s\.done i\b/, 'color', 'var(--white)', 'var(--on-champagne)'),
  O(/^\.steps \.s\.done i\b/, 'border-color', 'var(--ink)', 'var(--champagne)'),
  O(/^\.steps \.s\.cur i\b/, 'background', 'var(--terra)', 'var(--accent)'),
  O(/^\.steps \.s\.cur i\b/, 'color', 'var(--white)', 'var(--on-accent)'),
  O(/^\.steps \.s\.cur i\b/, 'border-color', 'var(--terra)', 'var(--accent)'),

  /* --- Compte ------------------------------------------------------------ */
  O(/^\.acct nav a\.on\b/, 'background', 'var(--ink)', 'var(--accent)'),
  O(/^\.acct nav a\.on\b/, 'color', 'var(--white)', 'var(--on-accent)'),
  O(/^\.acct nav a:hover/, 'background', 'var(--ivory)', 'var(--surface-hover)'),

  /* --- Toast ------------------------------------------------------------- */
  O(/^\.toast\b/, 'background', 'var(--ink)', 'var(--surface-overlay)'),
  O(/^\.toast\b/, 'color', 'var(--white)', 'var(--text-primary)'),

  /* --- Pied de page (§4.6) ----------------------------------------------- */
  O(/^footer\.site\b/, 'background', 'var(--brown-2)', 'var(--surface-base)'),
  O(/^footer\.site\b/, 'color', 'rgba(247,243,236,.7)', 'var(--text-secondary)'),
  O(/^footer \.logo\b/, 'color', 'var(--white)', 'var(--text-primary)'),
  O(/^footer \.col h4\b/, 'color', 'var(--white)', 'var(--text-primary)'),
  O(/^footer \.col a:hover/, 'color', 'var(--white)', 'var(--text-primary)'),
  O(/^footer \.bottom \.socials a:hover/, 'background', 'var(--white)', 'var(--accent)'),
  O(/^footer \.bottom \.socials a:hover/, 'color', 'var(--ink)', 'var(--on-accent)'),
  O(/^footer \.bottom \.socials a:hover/, 'border-color', 'var(--white)', 'var(--accent)'),
  O(/^footer \.bottom \.socials a\b/, 'background', 'rgba(255,255,255,.03)', 'transparent'),
  O(/^footer \.bottom \.socials a\b/, 'border', 'rgba(247,243,236,.22)', 'var(--line-strong)'),

  /* --- Menu mobile (§4.5) ------------------------------------------------ */
  O(/^\.mmenu\b/, 'background', 'var(--ink)', 'var(--surface-base)'),
  O(/^\.mmenu\b/, 'color', 'var(--ivory)', 'var(--text-primary)'),
  O(/^\.mmenu \.logo\b/, 'color', 'var(--white)', 'var(--text-primary)'),
  O(/^\.mmenu \.mclose\b/, 'color', 'var(--white)', 'var(--text-primary)'),
  O(/^\.mmenu \.mclose\b/, 'border', 'rgba(247,243,236,.28)', 'var(--line-strong)'),
  O(/^\.mmenu \.mclose:hover/, 'background', 'rgba(255,255,255,.12)', 'var(--surface-hover)'),
  O(/^\.mmenu \.mgrid a\b/, 'color', 'var(--ivory)', 'var(--text-primary)'),
  O(/^\.mmenu \.mlinks a\b/, 'color', 'rgba(247,243,236,.82)', 'var(--text-secondary)'),
  O(/^\.mmenu \.mlinks a:hover/, 'color', 'var(--white)', 'var(--text-primary)'),
  O(/^\.mmenu \.mlinks \.mlogout:hover/, 'color', 'var(--white)', 'var(--text-primary)'),
  O(/^\.mmenu \.mlink-all:hover/, 'color', 'var(--white)', 'var(--text-primary)'),
  O(/^\.mmenu \.mfoot \.socials a\b/, 'color', 'var(--ivory)', 'var(--text-primary)'),
  O(/^\.mmenu \.mfoot \.socials a\b/, 'border', 'rgba(247,243,236,.22)', 'var(--line-strong)'),
  O(/^\.mmenu \.mfoot \.socials a:hover/, 'background', 'rgba(255,255,255,.12)', 'var(--surface-hover)'),
  O(/^\.mmenu \.mfoot \.socials a:hover/, 'color', 'var(--white)', 'var(--text-primary)'),
  O(/^\.mmenu \.mcta\b/, 'background', 'var(--terra)', 'var(--accent)'),
  O(/^\.mmenu \.mcta\b/, 'color', 'var(--white)', 'var(--on-accent)'),
  O(/^\.mmenu \.mbadge\b/, 'background', 'var(--terra)', 'var(--accent)'),
  O(/^\.mmenu \.mbadge\b/, 'color', 'var(--white)', 'var(--on-accent)'),

  /* --- Page de connexion : la photo impose ses couleurs ------------------ */
  O(/^\.auth\b/, 'background', 'var(--ivory)', 'var(--surface-base)'),
  O(/^\.auth\b/, 'background', 'var(--brown-2)', 'var(--surface-sunken)'),
  O(/^\.auth \.art\b/, 'background', 'var(--brown)', 'var(--surface-sunken)'),
  O(/^\.auth \.art \.logo\b/, 'color', 'var(--white)', 'var(--on-photo)'),
  O(/^\.auth \.art \.logo b\b/, 'color', 'var(--terra)', 'var(--champagne)'),
  O(/^\.auth \.art-copy\b/, 'color', 'var(--white)', 'var(--on-photo)'),
  O(/^\.auth \.panel\b/, 'background', 'var(--ivory)', 'var(--surface-base)'),
  O(/^\.auth \.inp\b/, 'background', '#FFFFFF', 'var(--field-on-photo-bg)'),
  O(/^\.auth \.inp\b/, 'background', 'var(--white)', 'var(--field-on-photo-bg)'),
  O(/^\.auth \.inp\b/, 'color', 'var(--ink)', 'var(--field-on-photo-text)'),
  O(/^\.auth \.inp\b/, 'border', 'rgba(58,41,35,.15)', 'var(--field-on-photo-border)'),
  O(/^\.auth \.inp\b/, 'border-color', 'rgba(23,21,19,.14)', 'var(--field-on-photo-border)'),
  O(/^\.auth \.inp:hover/, 'border-color', 'rgba(107,23,40,.45)', 'var(--field-on-photo-border-strong)'),
  O(/^\.auth \.inp:hover/, 'border-color', 'rgba(200,90,42,.42)', 'var(--field-on-photo-border-strong)'),
  O(/^\.auth \.inp:focus/, 'border-color', 'var(--bordeaux)', 'var(--accent)'),
  O(/^\.auth \.inp:focus/, 'border-color', 'var(--terra)', 'var(--accent)'),
  O(/^\.auth \.ctl \.fi\b/, 'color', 'var(--bordeaux)', 'var(--accent)'),
  O(/^\.auth \.ctl \.fi\b/, 'color', 'rgba(23,21,19,.34)', 'var(--field-on-photo-placeholder)'),
  O(/^\.auth \.ctl label\b/, 'color', 'rgba(23,21,19,.44)', 'var(--field-on-photo-placeholder)'),
  O(/^\.auth \.ctl label\b/, 'color', 'rgba(23,21,19,.55)', 'var(--field-on-photo-placeholder)'),
  O(/^\.auth \.ctl \.inp:focus\+label/, 'color', 'var(--bordeaux)', 'var(--accent-text)'),
  O(/^\.auth \.ctl \.inp:focus\+label/, 'color', 'var(--terra)', 'var(--accent-text)'),
  O(/^\.auth \.toggle\b/, 'color', 'rgba(23,21,19,.4)', 'var(--field-on-photo-placeholder)'),
  O(/^\.auth \.toggle\b/, 'color', 'rgba(23,21,19,.45)', 'var(--field-on-photo-placeholder)'),
  O(/^\.auth \.toggle:hover/, 'color', 'var(--ink)', 'var(--field-on-photo-text)'),
  O(/^\.auth \.rules li \.i\b/, 'color', 'rgba(23,21,19,.2)', 'var(--field-on-photo-placeholder)'),
  O(/^\.auth \.check \.box\b/, 'background', 'var(--white)', 'var(--field-on-photo-bg)'),
  O(/^\.auth \.check \.box\b/, 'border', 'rgba(58,41,35,.22)', 'var(--field-on-photo-border)'),
  O(/^\.auth \.check \.box\b/, 'border-color', 'rgba(58,41,35,.22)', 'var(--field-on-photo-border)'),
  O(/^\.auth \.check \.txt a\b/, 'color', 'var(--ink)', 'var(--field-on-photo-text)'),
  O(/^\.auth \.check \.txt a\b/, 'border-bottom', 'rgba(255,255,255,.24)', 'var(--field-on-photo-border)'),
  O(/^\.auth \.check input:checked/, 'border-color', 'var(--terra)', 'var(--accent)'),
  O(/^\.auth \.check input:checked/, 'color', 'var(--white)', 'var(--on-accent)'),
  O(/^\.auth \.ctl::after/, 'background',
    'linear-gradient(90deg,var(--terra),var(--champ))',
    'linear-gradient(90deg,var(--accent),var(--champagne))'),

  /* --- Visionneuse -------------------------------------------------------- */
  O(/^\.lightbox\b/, 'background', 'rgba(23,21,19,.88)', 'var(--scrim-strong)'),
  O(/^\.lightbox \.close\b/, 'color', '#fff', 'var(--on-photo-strong)'),
]

/* ============================================================================
   6. ANALYSEUR CSS (mini, suffisant pour des feuillesplates)
   ========================================================================== */

/**
 * Index du `}` qui ferme le `{` dont le corps commence à `openIdx`.
 * `openIdx` est la position APRÈS le `{` ouvrant : on démarre donc à
 * `depth = 1` (on est déjà à l'intérieur d'un bloc).
 */
function findMatching(css, openIdx) {
  let depth = 1
  let i = openIdx
  const n = css.length
  while (i < n) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2)
      i = e < 0 ? n : e + 2
      continue
    }
    if (c === '"' || c === "'") {
      const q = c
      i++
      while (i < n) {
        if (css[i] === '\\') { i += 2; continue }
        if (css[i] === q) { i++; break }
        i++
      }
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return n
}

/**
 * Parcourt `css[from, to)` et appelle `onRule(selector, bodyStart, bodyEnd)`
 * pour chaque règle de style (les at-rules sont transparents : leurs règles
 * filles sont remontées avec le même sélecteur).
 */
function walkRules(css, from, to, onRule) {
  let i = from
  let segStart = from
  while (i < to) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2)
      i = e < 0 ? to : e + 2
      // Un commentaire de tête n'appartient à aucun sélecteur : on avance
      // `segStart` pour qu'il ne soit pas recollé au prochain préfixe.
      if (segStart < i) segStart = i
      continue
    }
    if (c === '"' || c === "'") {
      const q = c
      i++
      while (i < to) {
        if (css[i] === '\\') { i += 2; continue }
        if (css[i] === q) { i++; break }
        i++
      }
      continue
    }
    if (c === '{') {
      const prelude = css.slice(segStart, i).trim().replace(/\s+/g, ' ')
      const bodyStart = i + 1
      const bodyEnd = findMatching(css, bodyStart)
      if (prelude.startsWith('@')) {
        walkRules(css, bodyStart, bodyEnd, onRule)
      } else {
        onRule(prelude, bodyStart, bodyEnd)
      }
      i = bodyEnd + 1
      segStart = i
      continue
    }
    i++
  }
}

/** Découpe un corps de règle en déclarations `{ prop, value, valueStart, valueEnd }`. */
function declarations(css, start, end) {
  const out = []
  let i = start
  let segStart = start
  while (i <= end) {
    const c = i < end ? css[i] : ';'
    if (c === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2)
      i = e < 0 ? end : e + 2
      continue
    }
    if (c === '"' || c === "'") {
      const q = c
      i++
      while (i < end) {
        if (css[i] === '\\') { i += 2; continue }
        if (css[i] === q) { i++; break }
        i++
      }
      continue
    }
    if (c === ';' || i === end) {
      const raw = css.slice(segStart, i)
      // Retire les COMMENTAIRES avant d'analyser : un `/* … color: var(--white) … */`
      // ne doit jamais être pris pour une déclaration (sinon on réécrit à
      // l'intérieur d'un commentaire, ce qui produit des diffs sales).
      const seg = raw.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length))
      const m = /^\s*([-a-zA-Z]+)\s*:\s*([\s\S]*)$/.exec(seg)
      if (m) {
        const value = m[2]
        const trimmed = value.replace(/\s+$/, '')
        const valueStart = segStart + seg.length - value.length
        out.push({
          prop: m[1].toLowerCase(),
          value,
          valueStart,
          valueEnd: valueStart + trimmed.length,
        })
      }
      segStart = i + 1
      if (i === end) break
      i++
      continue
    }
    i++
  }
  return out
}

/* ============================================================================
   7. TRANSFORMATION
   ========================================================================== */

/** Remplace toutes les occurrences exactes de `from` par `to`. */
function replaceAll(value, from, to) {
  if (!from) return value
  return value.split(from).join(to)
}

/** Applique la table de renommages de jetons (formes, rayons, ombres). */
function renameTokens(value) {
  let out = value
  for (const [from, to] of TOKEN_RENAMES) {
    const re = new RegExp(`(?<![-\\w])${from}(?![-\\w])`, 'g')
    out = out.replace(re, to)
  }
  return out
}

/** Applique une table de littéraux. */
function applyLiterals(value, table) {
  let out = value
  for (const [lit, token] of Object.entries(table)) {
    if (out.includes(lit)) out = replaceAll(out, lit, token)
  }
  return out
}

/** Applique la table de jetons correspondant au rôle de la propriété. */
function applyPropMap(prop, value) {
  let map = null
  let literals = null
  if (prop === '--bg') { map = BTN_BG_MAP; literals = BG_LITERALS }
  else if (prop === '--bd') { map = BTN_BD_MAP; literals = BORDER_LITERALS }
  else if (prop === '--fg') { map = TEXT_MAP; literals = TEXT_LITERALS }
  else if (TEXT_PROPS.has(prop)) { map = TEXT_MAP; literals = TEXT_LITERALS }
  else if (BG_PROPS.has(prop)) { map = BG_MAP; literals = BG_LITERALS }
  else if (BORDER_PROPS.has(prop)) { map = BORDER_MAP; literals = BORDER_LITERALS }
  else if (SHADOW_PROPS.has(prop)) { map = SHADOW_MAP; literals = SHADOW_LITERALS }
  if (!map) return value
  let out = value
  for (const [from, to] of Object.entries(map)) {
    if (out.includes(`var(${from})`)) out = replaceAll(out, `var(${from})`, `var(${to})`)
  }
  return applyLiterals(out, literals)
}

/** Cherche l'exception par sélecteur qui s'applique à cette déclaration. */
function findOverride(selector, prop, value) {
  for (const o of OVERRIDES) {
    if (o.prop && o.prop !== prop) continue
    if (!o.sel.test(selector)) continue
    // `whole` : on remplace la valeur entière, aucun fragment à chercher.
    if (o.whole) return o
    if (!value.includes(o.from)) continue
    return o
  }
  return null
}

/** Transforme la valeur d'une déclaration. */
function transformValue(selector, prop, value) {
  const override = findOverride(selector, prop, value)
  let out = value
  if (override) {
    if (override.whole) return override.to
    // Une exception remplace TOUTES les occurrences du fragment source.
    out = replaceAll(out, override.from, override.to)
  }
  // …puis on laisse les tables générales finir le travail (ex. `--terra` restant).
  out = applyPropMap(prop, out)
  out = renameTokens(out)
  return out
}

/**
 * Transforme un fichier CSS complet. Retourne `{ css, changes }`.
 *
 * Les déclarations REDÉFINISSANT un jeton (`--terra: …`) sont laissées
 * intactes : elles décrivent le pont legacy (que §10 étape 30 supprime), pas
 * un usage d'accent. Ce sont les `var(--terra)` des règles qui migrent.
 */
const TOKEN_DEFS = new Set([
  ...Object.keys(TEXT_MAP), ...Object.keys(BG_MAP), ...Object.keys(BTN_BG_MAP),
  ...Object.keys(BORDER_MAP), ...Object.keys(BTN_BD_MAP), ...Object.keys(SHADOW_MAP),
  '--line-2', '--pill', '--sh', '--sh-sm', '--r',
])

function transformCss(source) {
  const edits = []
  const changes = []
  walkRules(source, 0, source.length, (selector, bodyStart, bodyEnd) => {
    for (const d of declarations(source, bodyStart, bodyEnd)) {
      if (TOKEN_DEFS.has(d.prop)) {
        // Définition de jeton : on la reporte (ne pas toucher). Pas de
        // « changement » : c'est le pont legacy, supprimé manuellement à
        // l'étape 30 du plan, pas une transformation.
        continue
      }
      const override = findOverride(selector, d.prop, d.value)
      const next = transformValue(selector, d.prop, d.value)
      if (next === d.value) continue
      // Garde de sûreté : hors remplacement « valeur entière », la
      // transformation ne doit jamais ajouter ni retirer de retour à la ligne
      // (signe d'un remplacement partiel sur une valeur multi-lignes qui
      // aurait laissé des fragments orphelins).
      if (!(override && override.whole)) {
        const nlBefore = (d.value.match(/\n/g) || []).length
        const nlAfter = (next.match(/\n/g) || []).length
        if (nlBefore !== nlAfter) {
          throw new Error(
            `transformation multi-lignes suspecte — ${selector} { ${d.prop} } : ` +
            `${JSON.stringify(d.value)} → ${JSON.stringify(next)}`,
          )
        }
      }
      edits.push({ start: d.valueStart, end: d.valueEnd, text: next })
      changes.push({ selector, prop: d.prop, from: d.value.trim(), to: next.trim() })
    }
  })
  let out = source
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }
  return { css: out, changes }
}

/* ============================================================================
   8. EXÉCUTION
   ========================================================================== */

function shortSelector(selector) {
  const s = selector.replace(/\s+/g, ' ').trim()
  return s.length <= 72 ? s : `…${s.slice(-69)}`
}

const check = process.argv.includes('--check')
let total = 0
let dirty = 0

for (const file of FILES) {
  const path = join(vendorDir, `${file}.css`)
  const source = readFileSync(path, 'utf8')
  const { css, changes } = transformCss(source)
  total += changes.length
  const changed = css !== source
  if (changed) dirty++
  console.log(`\n[migrate-accent-tokens] ${file}.css — ${changes.length} déclaration(s) transformée(s)${changed ? '' : ' (inchangé)'}`)
  for (const c of changes) {
    console.log(`    ${shortSelector(c.selector)} { ${c.prop}: ${c.from} }  →  ${c.to}`)
  }
  if (!check && changed) writeFileSync(path, css)
}

console.log(`\n[migrate-accent-tokens] total : ${total} transformation(s), ${dirty} fichier(s) modifié(s)${check ? ' — DRY-RUN, rien n\'a été écrit' : ''}`)
if (check && total > 0) process.exitCode = 1
