import { describe, expect, it } from 'vitest'
import {
  MAX_QTY,
  addToItems,
  cartLineToItem,
  clampQty,
  decItem,
  favoriteToEntry,
  incItem,
  normalizeStoredItem,
  removeItem,
  snapshotToCartItem,
  toggleEntry,
  toggleLocalFavorite,
  type CartItem,
  type FavoriteEntry,
} from './hybridStore'
import type { CartLineDto, FavoriteProductDto, ProductCardItem, ProductDetail } from './types'

/* ------------------------------------------------------------------ */
/* Fabriques                                                          */
/* ------------------------------------------------------------------ */

function item(over: Partial<CartItem> = {}): CartItem {
  return { id: 1, name: 'A', slug: 'a', price: 100, imageUrl: '', categoryName: '', qty: 1, ...over }
}

const card = {
  id: 7,
  name: 'Casque',
  slug: 'casque',
  price: 5000,
  location: 'Dakar',
  condition: 'Neuf',
  category: { id: 2, name: 'Électronique', slug: 'electronique' },
  image: { id: 9, url: '/uploads/casque.jpg' },
  oldPrice: null,
} as unknown as ProductCardItem

const detail = {
  id: 8,
  name: 'Chaise',
  slug: 'chaise',
  price: 12000,
  location: 'Thiès',
  condition: 'Bon',
  category: { id: 3, name: 'Maison', slug: 'maison' },
  images: [{ id: 1, url: '/uploads/chaise.jpg' }],
  seller: { id: 4, displayName: 'Awa' },
  oldPrice: 15000,
} as unknown as ProductDetail

/* ------------------------------------------------------------------ */
/* clampQty                                                           */
/* ------------------------------------------------------------------ */

describe('clampQty', () => {
  it('borne la quantité dans 1..MAX_QTY', () => {
    expect(clampQty(0)).toBe(1)
    expect(clampQty(5)).toBe(5)
    expect(clampQty(MAX_QTY)).toBe(MAX_QTY)
    expect(clampQty(99)).toBe(MAX_QTY)
  })

  it('tronque les décimales et refuse le non-numérique', () => {
    expect(clampQty(3.9)).toBe(3)
    expect(clampQty('x')).toBe(1)
    expect(clampQty(NaN)).toBe(1)
    expect(clampQty(undefined)).toBe(1)
  })
})

/* ------------------------------------------------------------------ */
/* Instantané produit → CartItem                                      */
/* ------------------------------------------------------------------ */

describe('snapshotToCartItem', () => {
  it('mappe une carte produit (photo unique, pas de vendeur)', () => {
    const it = snapshotToCartItem(card)
    expect(it).toMatchObject({ id: 7, name: 'Casque', slug: 'casque', price: 5000, qty: 1, categoryName: 'Électronique' })
    expect(it.imageUrl).toBe('/uploads/casque.jpg')
    expect(it.sellerName).toBeUndefined()
  })

  it('mappe une fiche produit (galerie + vendeur)', () => {
    const it = snapshotToCartItem(detail)
    expect(it).toMatchObject({ id: 8, qty: 1, categoryName: 'Maison', sellerName: 'Awa' })
    expect(it.imageUrl).toBe('/uploads/chaise.jpg')
  })
})

/* ------------------------------------------------------------------ */
/* Ligne serveur → CartItem                                           */
/* ------------------------------------------------------------------ */

describe('cartLineToItem', () => {
  const line: CartLineDto = {
    productId: 3,
    productName: 'Vélo',
    productSlug: 'velo',
    price: 40000,
    oldPrice: null,
    image: { id: 1, url: '/uploads/velo.jpg' },
    qty: 2,
    stock: 1,
    sellerId: 5,
  }

  it('mappe les champs et l’image', () => {
    expect(cartLineToItem(line)).toMatchObject({ id: 3, name: 'Vélo', slug: 'velo', price: 40000, qty: 2 })
  })

  it('retombe sur la photo de catégorie sans image', () => {
    expect(cartLineToItem({ ...line, image: null }).imageUrl).toMatch(/categories\//)
  })

  it('borne la quantité serveur', () => {
    expect(cartLineToItem({ ...line, qty: 42 }).qty).toBe(MAX_QTY)
  })
})

/* ------------------------------------------------------------------ */
/* Produit / favori serveur → FavoriteEntry                           */
/* ------------------------------------------------------------------ */

describe('favoriteToEntry', () => {
  const fav: FavoriteProductDto = {
    productId: 3,
    productName: 'Vélo',
    productSlug: 'velo',
    price: 40000,
    oldPrice: 50000,
    image: { id: 1, url: '/uploads/velo.jpg' },
    sellerId: 5,
    sellerDisplayName: 'Moussa',
    condition: 'Comme neuf',
    location: 'Dakar',
    addedAt: '2026-01-01T00:00:00.000Z',
  }

  it('mappe les champs d’affichage', () => {
    expect(favoriteToEntry(fav)).toMatchObject({
      id: 3,
      slug: 'velo',
      name: 'Vélo',
      price: 40000,
      oldPrice: 50000,
      location: 'Dakar',
      condition: 'Comme neuf',
      imageUrl: '/uploads/velo.jpg',
    })
  })

  it('laisse imageUrl null sans image', () => {
    expect(favoriteToEntry({ ...fav, image: null }).imageUrl).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/* Mutations pures du panier                                          */
/* ------------------------------------------------------------------ */

describe('addToItems', () => {
  it('ajoute un nouveau produit en qty 1', () => {
    const out = addToItems([], card)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 7, qty: 1 })
  })

  it('incrémente un produit déjà présent', () => {
    const out = addToItems([item({ id: 7, qty: 2 })], card)
    expect(out[0]!.qty).toBe(3)
  })

  it('plafonne à MAX_QTY', () => {
    const out = addToItems([item({ id: 7, qty: MAX_QTY })], card)
    expect(out[0]!.qty).toBe(MAX_QTY)
  })
})

describe('incItem / decItem / removeItem', () => {
  it('inc plafonne à MAX_QTY', () => {
    expect(incItem([item({ id: 1, qty: MAX_QTY })], 1)[0]!.qty).toBe(MAX_QTY)
    expect(incItem([item({ id: 1, qty: 2 })], 1)[0]!.qty).toBe(3)
  })

  it('dec retire la ligne quand la quantité atteint 0', () => {
    expect(decItem([item({ id: 1, qty: 2 })], 1)[0]!.qty).toBe(1)
    expect(decItem([item({ id: 1, qty: 1 })], 1)).toHaveLength(0)
  })

  it('remove supprime uniquement la ligne ciblée', () => {
    const out = removeItem([item({ id: 1 }), item({ id: 2 })], 1)
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe(2)
  })
})

/* ------------------------------------------------------------------ */
/* normalizeStoredItem                                                */
/* ------------------------------------------------------------------ */

describe('normalizeStoredItem', () => {
  it('tolère l’ancien format sans qty et borne la quantité', () => {
    expect(normalizeStoredItem({ id: 1, name: 'A' })).toMatchObject({ id: 1, qty: 1 })
    expect(normalizeStoredItem({ id: 1, qty: 99 })!.qty).toBe(MAX_QTY)
  })

  it('rejette un item sans id', () => {
    expect(normalizeStoredItem({ name: 'A' })).toBeNull()
    expect(normalizeStoredItem(null)).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/* Favoris                                                            */
/* ------------------------------------------------------------------ */

describe('toggleEntry (favoris connectés)', () => {
  const entry: Omit<FavoriteEntry, 'id'> = {
    slug: 's',
    name: 'N',
    price: 1,
    location: 'L',
    condition: 'C',
    categoryName: '',
  }

  it('ajoute en tête puis retire', () => {
    const added = toggleEntry([], 5, entry)
    expect(added).toHaveLength(1)
    expect(added[0]!.id).toBe(5)
    expect(toggleEntry(added, 5, entry)).toHaveLength(0)
  })
})

describe('toggleLocalFavorite (favoris anonymes)', () => {
  const entry: Omit<FavoriteEntry, 'id'> = {
    slug: 's',
    name: 'N',
    price: 1,
    location: 'L',
    condition: 'C',
    categoryName: '',
  }

  it('range dans pendingIds sans instantané', () => {
    const s = toggleLocalFavorite({ entries: [], pendingIds: [] }, 9)
    expect(s.entries).toHaveLength(0)
    expect(s.pendingIds).toEqual([9])
  })

  it('range dans entries avec instantané', () => {
    const s = toggleLocalFavorite({ entries: [], pendingIds: [] }, 9, entry)
    expect(s.entries).toHaveLength(1)
    expect(s.pendingIds).toHaveLength(0)
  })

  it('retire des deux listes à la bascule inverse', () => {
    const added = toggleLocalFavorite({ entries: [], pendingIds: [] }, 9, entry)
    const removed = toggleLocalFavorite(added, 9, entry)
    expect(removed.entries).toHaveLength(0)
    expect(removed.pendingIds).toHaveLength(0)
  })
})
