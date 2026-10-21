/**
 * Tests unitaires — mapping des suggestions (src/components/layout/suggestions.ts).
 *
 * Verrouille le contrat `GET /api/products/suggestions` (docs/api.md v2.4 §3.2) :
 * forme de la réponse, bornes 6/2/2, et routes cibles de chaque groupe.
 * `toSuggestions` est une fonction PURE : aucun `fetch` n'est nécessaire.
 */
import { describe, it, expect } from 'vitest'
import { toSuggestions, SUGGESTION_LIMITS, SUGGESTION_MAX_TOTAL } from './suggestions'
import type { ProductCardItem, SearchSuggestionsResponse } from '../../lib/types'

/** Carte produit du catalogue §2.2 — champs minimaux utilisés par le mapping. */
function card(over: Partial<ProductCardItem> = {}): ProductCardItem {
  return {
    id: 1,
    name: 'iPhone 13',
    slug: 'iphone-13',
    price: 250_000,
    location: 'Dakar',
    condition: 'Bon état',
    createdAt: '2026-09-20T10:15:00.000Z',
    image: null,
    category: { id: 3, name: 'Électronique', slug: 'electronique' },
    subcategory: { id: 13, name: 'Téléphones', slug: 'electronique-telephones' },
    ...over,
  }
}

function res(over: Partial<SearchSuggestionsResponse> = {}): SearchSuggestionsResponse {
  return { q: 'iphone', categories: [], brands: [], products: [], ...over }
}

describe('Contrat de forme (api.md v2.4 §3.2)', () => {
  it('les bornes totalisent bien 10 éléments', () => {
    expect(SUGGESTION_LIMITS).toEqual({ products: 6, categories: 2, brands: 2 })
    const total = SUGGESTION_LIMITS.products + SUGGESTION_LIMITS.categories + SUGGESTION_LIMITS.brands
    expect(total).toBe(SUGGESTION_MAX_TOTAL)
  })

  it('`brands` est un tableau de chaînes, pas d\'objets', () => {
    // La forme réelle du serveur est `string[]` : si quelqu'un réintroduit
    // des objets, ce test casse immédiatement.
    const out = toSuggestions(res({ brands: ['Apple', 'Samsung'] }))
    expect(out).toEqual([
      { type: 'brand', label: 'Apple', to: '/search?brand=Apple' },
      { type: 'brand', label: 'Samsung', to: '/search?brand=Samsung' },
    ])
  })

  it('une marque est échappée dans l\'URL de recherche', () => {
    const out = toSuggestions(res({ brands: ['A&B Co'] }))
    expect(out[0]?.to).toBe('/search?brand=A%26B%20Co')
  })

  it('une réponse vide donne zéro suggestion (le vide est traité par le composant)', () => {
    expect(toSuggestions(res())).toEqual([])
  })
})

describe('Bornes par groupe', () => {
  it('plafonne chaque groupe à sa limite serveur', () => {
    const out = toSuggestions(
      res({
        products: Array.from({ length: 12 }, (_, i) => card({ id: i + 1, slug: `s-${i}` })),
        categories: Array.from({ length: 5 }, (_, i) => ({ id: i, name: `Cat ${i}`, slug: `cat-${i}` })),
        brands: ['A', 'B', 'C', 'D'],
      }),
    )
    expect(out.filter((s) => s.type === 'product')).toHaveLength(6)
    expect(out.filter((s) => s.type === 'category')).toHaveLength(2)
    expect(out.filter((s) => s.type === 'brand')).toHaveLength(2)
    expect(out).toHaveLength(SUGGESTION_MAX_TOTAL)
  })

  it('ordre d\'affichage : articles, puis catégories, puis marques', () => {
    const out = toSuggestions(
      res({
        products: [card()],
        categories: [{ id: 1, name: 'Électronique', slug: 'electronique' }],
        brands: ['Apple'],
      }),
    )
    expect(out.map((s) => s.type)).toEqual(['product', 'category', 'brand'])
  })
})

describe('Cibles de navigation (aucun lien mort)', () => {
  it('produit → fiche catalogue, slug encodé', () => {
    const out = toSuggestions(res({ products: [card({ slug: 'tv samsung 55' })] }))
    expect(out[0]?.to).toBe('/catalogue/tv%20samsung%2055')
  })

  it('catégorie → page catégorie, slug encodé', () => {
    const out = toSuggestions(res({ categories: [{ id: 2, name: 'Mode & Shoes', slug: 'mode-shoes' }] }))
    expect(out[0]?.to).toBe('/category/mode-shoes')
  })

  it('produit : le prix est formaté en FCFA', () => {
    const out = toSuggestions(res({ products: [card({ price: 250_000 })] }))
    expect(out[0]?.meta).toContain('250')
  })

  it('catégorie : aucun compteur inventé (le contrat n\'en fournit pas)', () => {
    const out = toSuggestions(res({ categories: [{ id: 2, name: 'Mode', slug: 'mode' }] }))
    expect(out[0]?.meta).toBeUndefined()
  })

  it('produit sans image : `imageUrl` null, jamais une chaîne cassée', () => {
    const out = toSuggestions(res({ products: [card({ image: null })] }))
    expect(out[0]?.imageUrl).toBeNull()
  })

  it('produit avec image : URL résolue depuis `image.url` (camelCase §2.2)', () => {
    const out = toSuggestions(res({ products: [card({ image: { id: 9, url: '/uploads/products/a.jpg' } })] }))
    expect(out[0]?.imageUrl).toBe('/uploads/products/a.jpg')
  })
})
