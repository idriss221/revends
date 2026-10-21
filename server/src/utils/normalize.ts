/**
 * Normalisation des entrées HTTP avant validation Zod.
 *
 * Ces fonctions ne valident RIEN : elles ne font que réconcilier les alias de
 * nommage (snake_case V4 → camelCase) et les chaînes vides, pour que les
 * schémas Zod puissent rester stricts. Extraites des routes pour être
 * réutilisables et testables sans Express.
 */

/**
 * Alias snake_case → camelCase (nommage JSON V4) sur les paramètres de requête
 * de catalogue : `category_id`/`per_page`. La valeur camelCase prime si les
 * deux sont fournies.
 */
export function normalizeCatalogParams(query: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...query };
  if (out.category_id !== undefined && out.categoryId === undefined) out.categoryId = out.category_id;
  if (out.per_page !== undefined && out.perPage === undefined) out.perPage = out.per_page;
  return out;
}

/**
 * Champs textes optionnels vides → absents (stockés NULL, api.md §3.3).
 * Mutation volontaire du corps (multipart : `req.body` est un objet simple).
 */
export function normalizeOptionalFields(body: Record<string, unknown>): Record<string, unknown> {
  for (const k of ['brand', 'model', 'ageYears', 'defects', 'accessories', 'notes']) {
    if (typeof body[k] === 'string' && body[k].trim() === '') delete body[k];
  }
  return body;
}

/**
 * Paramètres de pagination des listes `/api/me/*` : accepte `per_page` et
 * `perPage` comme alias rétrocompatibles de `limit`. La clé canonique prime.
 */
export function normalizeMeListParams(query: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...query };
  if (out.limit === undefined) {
    if (out.per_page !== undefined) out.limit = out.per_page;
    else if (out.perPage !== undefined) out.limit = out.perPage;
  }
  return out;
}

/**
 * Paramètres des listes ADMIN (`/api/admin/*`) : les alias contractuels
 * snake_case (api.md §1.5 `per_page`, §3.6 `target_type`) sont convertis en
 * les clés camelCase (`perPage`/`targetType`) attendues par les schémas Zod.
 * La clé canonique prime si les deux formes sont fournies. Aucune validation
 * ici : les bornes (ex. `perPage ≤ 48` → 400) restent celles des schémas.
 */
export function normalizeAdminListParams(query: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...query };
  if (out.perPage === undefined && out.per_page !== undefined) out.perPage = out.per_page;
  if (out.targetType === undefined && out.target_type !== undefined) out.targetType = out.target_type;
  return out;
}
