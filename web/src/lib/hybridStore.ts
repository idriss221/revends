/**
 * Logique PURE du stockage hybride panier/favoris (WS1).
 *
 * Modèle « hybride » décidé :
 *  · **visiteur anonyme** → tout vit dans `localStorage` (survit au refresh) ;
 *  · **utilisateur connecté** → source de vérité = API (`/api/cart`,
 *    `/api/favorites`) ; le panier/favoris anonyme est fusionné à la connexion.
 *
 * Ce module ne contient AUCUN import React ni navigateur (hormis les helpers de
 * `catalogPhotos`) : il est donc testable en Node pur (vitest, sans jsdom).
 */
import { categoryPhoto, resolveImageUrl } from './catalogPhotos'
import type { CartLineDto, FavoriteProductDto, ProductCardItem, ProductDetail } from './types'

/** Nombre maximum d'exemplaires par produit (design, cf. MAX_QTY panier). */
export const MAX_QTY = 9

/** Article du panier — copie figée (prix/photo au moment de l'ajout) + quantité. */
export interface CartItem {
  id: number
  name: string
  slug: string
  price: number
  /** URL résolue et prête pour <img> (photo produit sinon photo de catégorie). */
  imageUrl: string
  categoryName: string
  sellerName?: string
  /** Nombre d'exemplaires (1..9). */
  qty: number
}

/** Favori avec instantané d'affichage (rendu des cartes sans re-requêter). */
export interface FavoriteEntry {
  id: number
  slug: string
  name: string
  price: number
  oldPrice?: number | null
  location: string
  condition: string
  categoryName: string
  imageUrl?: string | null
}

/** Borne une quantité dans 1..MAX_QTY (valeur non numérique → 1). */
export function clampQty(qty: unknown): number {
  return typeof qty === 'number' && Number.isFinite(qty) ? Math.min(MAX_QTY, Math.max(1, Math.floor(qty))) : 1
}

/** Instantané produit (ajout anonyme) → `CartItem` (qty 1). */
export function snapshotToCartItem(product: ProductCardItem | ProductDetail): CartItem {
  const imageUrl =
    'images' in product
      ? resolveImageUrl(product.images[0]?.url ?? categoryPhoto(product.category.name))
      : resolveImageUrl(product.image?.url ?? categoryPhoto(product.category.name))
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    imageUrl,
    categoryName: product.category.name,
    sellerName: 'seller' in product ? product.seller.displayName : undefined,
    qty: 1,
  }
}

/** Ligne serveur `GET /api/cart` → `CartItem`. */
export function cartLineToItem(line: CartLineDto): CartItem {
  return {
    id: line.productId,
    name: line.productName,
    slug: line.productSlug,
    price: line.price,
    imageUrl: line.image ? resolveImageUrl(line.image.url) : categoryPhoto(''),
    categoryName: '',
    qty: clampQty(line.qty),
  }
}

/**
 * Normalise un item stocké : tolère l'ANCIEN format (sans `qty`) et borne la
 * quantité pour ne jamais casser le panier au refresh.
 */
export function normalizeStoredItem(i: unknown): CartItem | null {
  if (!i || typeof i !== 'object') return null
  const it = i as Partial<CartItem>
  if (typeof it.id !== 'number') return null
  return {
    id: it.id,
    name: typeof it.name === 'string' ? it.name : '',
    slug: typeof it.slug === 'string' ? it.slug : '',
    price: typeof it.price === 'number' ? it.price : 0,
    imageUrl: typeof it.imageUrl === 'string' ? it.imageUrl : '',
    categoryName: typeof it.categoryName === 'string' ? it.categoryName : '',
    sellerName: typeof it.sellerName === 'string' ? it.sellerName : undefined,
    qty: clampQty(it.qty),
  }
}

/** Ajoute un produit : 1re fois → qty 1 ; déjà présent → +1 (plafonné). */
export function addToItems(items: CartItem[], product: ProductCardItem | ProductDetail): CartItem[] {
  const existing = items.find((i) => i.id === product.id)
  if (existing) return items.map((i) => (i.id === product.id && i.qty < MAX_QTY ? { ...i, qty: i.qty + 1 } : i))
  return [...items, snapshotToCartItem(product)]
}

/** +1 (plafonné à MAX_QTY) sur une ligne. */
export function incItem(items: CartItem[], productId: number): CartItem[] {
  return items.map((i) => (i.id === productId && i.qty < MAX_QTY ? { ...i, qty: i.qty + 1 } : i))
}

/** −1 ; si la quantité atteint 0, la ligne est retirée. */
export function decItem(items: CartItem[], productId: number): CartItem[] {
  return items.flatMap((i) => {
    if (i.id !== productId) return [i]
    return i.qty <= 1 ? [] : [{ ...i, qty: i.qty - 1 }]
  })
}

/** Retire une ligne complète. */
export function removeItem(items: CartItem[], productId: number): CartItem[] {
  return items.filter((i) => i.id !== productId)
}

/** Favori serveur `GET /api/favorites` → `FavoriteEntry`. */
export function favoriteToEntry(fav: FavoriteProductDto): FavoriteEntry {
  return {
    id: fav.productId,
    slug: fav.productSlug,
    name: fav.productName,
    price: fav.price,
    oldPrice: fav.oldPrice,
    location: fav.location,
    condition: fav.condition,
    categoryName: '',
    imageUrl: fav.image ? resolveImageUrl(fav.image.url) : null,
  }
}

/** Garde de type pour une entrée favori stockée (héritage localStorage). */
export function isFavoriteEntry(v: unknown): v is FavoriteEntry {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return typeof e.id === 'number' && typeof e.slug === 'string' && typeof e.name === 'string'
}

/** Bascule une entrée dans une liste de favoris (ajout en tête ou retrait). */
export function toggleEntry(
  entries: FavoriteEntry[],
  productId: number,
  entry?: Omit<FavoriteEntry, 'id'>,
): FavoriteEntry[] {
  if (entries.some((e) => e.id === productId)) return entries.filter((e) => e.id !== productId)
  return entry ? [{ id: productId, ...entry }, ...entries] : entries
}

/** État des favoris ANONYMES (localStorage) : entrées avec instantané + ids seuls. */
export interface FavoritesLocalState {
  entries: FavoriteEntry[]
  pendingIds: number[]
}

/**
 * Bascule un favori dans l'état ANONYME. Une entrée SANS instantané (héritage V4)
 * va dans `pendingIds` : l'appartenance n'est jamais perdue silencieusement.
 */
export function toggleLocalFavorite(
  state: FavoritesLocalState,
  productId: number,
  entry?: Omit<FavoriteEntry, 'id'>,
): FavoritesLocalState {
  const adding = !(state.entries.some((e) => e.id === productId) || state.pendingIds.includes(productId))
  if (!adding) {
    return {
      entries: state.entries.filter((e) => e.id !== productId),
      pendingIds: state.pendingIds.filter((id) => id !== productId),
    }
  }
  if (entry) return { entries: [{ id: productId, ...entry }, ...state.entries], pendingIds: state.pendingIds }
  return { entries: state.entries, pendingIds: [productId, ...state.pendingIds] }
}
