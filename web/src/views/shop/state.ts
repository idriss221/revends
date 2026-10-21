import type { Condition, ProductListParams, ProductSort } from '../../lib/types'

/* ============================================================================
   Moteur de filtres de la vue Shop — reprise de `facetDefs()` / `readFilters` /
   `buildQuery` / `toggleQuery` / `activeCount` de `Bureau/main/assets/app.js`
   (lignes 335-374), adaptés aux données réelles :

   · URL = état (`useSearchParams`) : lecture DES DEUX vocabulaires — noms de
     la référence (`q`, `c`, `e`, `price`, `sort`, `brand`, `location`, `page`)
     ET anciens noms du projet (`category_id`, `subcategory_id`, `condition`,
     `price_min`, `price_max`) pour que les liens déjà publiés continuent de
     fonctionner ; écriture AVEC LES NOMS DE LA RÉFÉRENCE uniquement ;
   · facettes en sélection UNIQUE (une seule valeur) : l'API n'accepte qu'une
     valeur par filtre (contrat §3.2) — une multi-sélection serait un mensonge
     (deux valeurs affichées dans l'URL, une seule appliquée au serveur) ;
   · pas de `matchProducts` côté client : le filtrage, le tri et la pagination
     sont serveur (`api.products`) — le total affiché est toujours le vrai.
   ========================================================================== */

/** 4 tris de l'API, dans l'ordre descriptif de la référence. */
export const SORTS = [
  { v: 'recent', t: 'Plus récents' },
  { v: 'popular', t: 'Plus populaires' },
  { v: 'price_asc', t: 'Prix croissant' },
  { v: 'price_desc', t: 'Prix décroissant' },
] as const satisfies { v: ProductSort; t: string }[]

export type ShopSort = ProductSort

/** États du type contrat `Condition` — la facette « État » de la référence. */
export const CONDITIONS: readonly Condition[] = ['Neuf', 'Très bon état', 'Bon état', 'Correct', 'À réparer']

/** Bornes du slider prix (identiques à la référence : 5 000 → 250 000, pas 5 000). */
export const PRICE_FLOOR = 5_000
export const PRICE_CEIL = 250_000
export const PRICE_STEP = 5_000

export const sortLabel = (s: ProductSort): string =>
  (SORTS.find((o) => o.v === s) ?? SORTS[0]).t

/** État filtré de la boutique. Toutes les facettes sont en sélection unique. */
export interface ShopFilters {
  q: string
  /** catégorie OU sous-catégorie (id) — `c` référence / `category_id`·`subcategory_id` projet */
  c: string
  /** état — `e` référence / `condition` projet */
  e: string
  /** prix maximum — `price` référence (`max`/`price_max` projet) ; `null` = sans limite */
  priceMax: number | null
  /** prix minimum — la référence n'en a pas ; lu/écrit `price_min` (ancien projet) */
  priceMin: number | null
  brand: string
  location: string
  sort: ProductSort
  page: number
}

/** Part « brouillon » du bottom-sheet mobile (pas de q/sort/page, comme `pendFrom()`). */
export interface PendFilters {
  c: string
  e: string
  brand: string
  location: string
  priceMax: number | null
  priceMin: number | null
}

export const EMPTY_PEND: PendFilters = {
  c: '',
  e: '',
  brand: '',
  location: '',
  priceMax: null,
  priceMin: null,
}

/** Nombre positif strict, ou `null`. */
function numOf(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Première valeur non vide d'une liste CSV (`e`/`brand`/`location` sont uniques côté API). */
function firstOf(raw: string | null): string {
  return (raw ?? '').split(',').map((x) => x.trim()).filter(Boolean)[0] ?? ''
}

/**
 * `readFilters()` — lit l'URL courante. Accepte les noms de la référence ET
 * les anciens noms du projet (un ancien lien ne doit jamais « casser »).
 */
export function readFilters(sp: URLSearchParams): ShopFilters {
  const rawSort = sp.get('sort')
  const sort = (SORTS.find((o) => o.v === rawSort) ?? SORTS[0]).v
  const page = Math.max(1, Math.floor(Number(sp.get('page') ?? '1')) || 1)
  return {
    q: (sp.get('q') ?? '').trim(),
    c: firstOf(sp.get('c') ?? sp.get('category_id') ?? sp.get('subcategory_id')),
    e: firstOf(sp.get('e') ?? sp.get('condition')),
    priceMax: numOf(sp.get('price') ?? sp.get('max') ?? sp.get('price_max')),
    priceMin: numOf(sp.get('price_min')),
    brand: firstOf(sp.get('brand')),
    location: firstOf(sp.get('location')),
    sort,
    page,
  }
}

/**
 * `buildQuery()` — reconstruit l'URL **avec les noms de la référence**.
 * Les valeurs par défaut sont omises (comme `s=rel` / `max=250000` le sont
 * dans la référence).
 */
export function buildSp(f: ShopFilters): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.q) sp.set('q', f.q)
  if (f.c) sp.set('c', f.c)
  if (f.e) sp.set('e', f.e)
  if (f.brand) sp.set('brand', f.brand)
  if (f.location) sp.set('location', f.location)
  if (f.priceMax !== null) sp.set('price', String(f.priceMax))
  if (f.priceMin !== null) sp.set('price_min', String(f.priceMin))
  if (f.sort !== SORTS[0].v) sp.set('sort', f.sort)
  if (f.page > 1) sp.set('page', String(f.page))
  return sp
}

/** `toggleQuery()` — bascule une facette en sélection unique (toggle on/off). */
export function toggleOne(current: string, value: string): string {
  return current === value ? '' : value
}

/** `activeCount()` — nombre de filtres actifs (q compris, comme la référence). */
export function activeCount(f: ShopFilters): number {
  return (
    (f.c ? 1 : 0) +
    (f.e ? 1 : 0) +
    (f.brand ? 1 : 0) +
    (f.location ? 1 : 0) +
    (f.priceMax !== null ? 1 : 0) +
    (f.priceMin !== null ? 1 : 0) +
    (f.q ? 1 : 0)
  )
}

/** Filtres appliqués au brouillon du panneau mobile. */
export function pendFrom(f: ShopFilters): PendFilters {
  return { c: f.c, e: f.e, brand: f.brand, location: f.location, priceMax: f.priceMax, priceMin: f.priceMin }
}

/** Brouillon du panneau → filtres complets (q/sort/page repris de l'état URL). */
export function pendToFilters(f: ShopFilters, pend: PendFilters): ShopFilters {
  return { ...f, ...pend }
}

/**
 * Paramètres `GET /api/products` — tout le filtrage est serveur
 * (catégorie, état, marque, localisation, prix, tri, pagination).
 */
export function toApiParams(f: ShopFilters, perPage = 12): ProductListParams {
  return {
    q: f.q || undefined,
    category_id: f.c || undefined,
    condition: (f.e || undefined) as Condition | undefined,
    brand: f.brand || undefined,
    location: f.location || undefined,
    price_min: f.priceMin ?? undefined,
    price_max: f.priceMax ?? undefined,
    sort: f.sort,
    page: f.page,
    per_page: perPage,
  }
}

/** Plafond du slider : la borne de la référence, étendue si des articles la dépassent. */
export function priceCeilFor(topPrice: number | undefined): number {
  const top = topPrice ?? PRICE_CEIL
  return Math.max(PRICE_CEIL, Math.ceil(top / PRICE_STEP) * PRICE_STEP)
}
