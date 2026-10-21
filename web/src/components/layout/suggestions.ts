import { api } from '../../lib/api'
import { formatFcfa } from '../../lib/format'
import { resolveImageUrl } from '../../lib/catalogPhotos'
import type { SearchSuggestionsResponse } from '../../lib/types'
import type { SuggestLoader, Suggestion } from './SearchSuggest'

/**
 * Chargeur de suggestions — adaptateur entre le contrat API
 * `GET /api/products/suggestions` (docs/api.md v2.4 §3.2) et le composant
 * `SearchSuggest`. Le composant ne connaît QUE ce `SuggestLoader` : brancher
 * un autre backend (ou un jeu de test) ne le modifie pas.
 *
 * L'endpoint est LIVRÉ (V5, PO-V5-18) et renvoie trois groupes :
 * `{ q, categories[], brands[], products[] }`, plafond global 10 = 6 + 2 + 2.
 * Les bornes sont appliquées ici (et re-vérifiées par `suggestions.test.ts`)
 * pour que le composant n'ait jamais à connaître le détail de la répartition.
 */
export const suggestionsLoader: SuggestLoader = async (query, signal) => {
  const res = await api.searchSuggestions(query, signal)
  return toSuggestions(res)
}

/** Bornes du contrat serveur (`SUGGESTION_LIMITS` côté API). */
export const SUGGESTION_LIMITS = { products: 6, categories: 2, brands: 2 } as const
export const SUGGESTION_MAX_TOTAL = 10

/**
 * Mapping pur réponse API → lignes du panneau (fonction pure, donc testable
 * sans `fetch` : c'est elle qui encode le contrat de forme `brands: string[]`
 * et l'absence de `product_count` sur les catégories).
 *
 * Ordre d'affichage : articles d'abord (le plus utile), puis catégories, puis
 * marques — chaque groupe borné par sa limite serveur.
 */
export function toSuggestions(res: SearchSuggestionsResponse): Suggestion[] {
  const products: Suggestion[] = (res.products ?? []).slice(0, SUGGESTION_LIMITS.products).map((p) => ({
    type: 'product',
    label: p.name,
    to: `/catalogue/${encodeURIComponent(p.slug)}`,
    meta: formatFcfa(p.price),
    imageUrl: p.image ? resolveImageUrl(p.image.url) : null,
  }))

  // Le contrat ne renvoie AUCUN compteur sur les catégories : on n'invente pas
  // de « n articles » (une valeur absente ne doit pas devenir un mensonge).
  const categories: Suggestion[] = (res.categories ?? []).slice(0, SUGGESTION_LIMITS.categories).map((c) => ({
    type: 'category',
    label: c.name,
    to: `/category/${encodeURIComponent(c.slug)}`,
  }))

  // `brands` = tableau de CHAÎNES (distinctes, non vides) — pas des objets.
  // Une marque n'a pas de page dédiée : on retombe sur la recherche filtrée,
  // qui sait déjà lire `?brand=` (SearchPage).
  const brands: Suggestion[] = (res.brands ?? []).slice(0, SUGGESTION_LIMITS.brands).map((b) => ({
    type: 'brand',
    label: b,
    to: `/search?brand=${encodeURIComponent(b)}`,
  }))

  return [...products, ...categories, ...brands]
}
