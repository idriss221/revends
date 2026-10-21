/**
 * Historique « Vus récents » (cahier V4 — CA-ACC-37/38, spec §3.4).
 *
 * Stockage local pur (localStorage, clé `revends:recently-viewed`) :
 * - liste d'ids produits consultés, la plus récente d'abord, sans doublons ;
 * - bornée à 8 entrées (ROUND_ROBIN simple : on évince la plus ancienne).
 *
 * Les fonctions sont pures (pas de lecture DOM) pour être testables.
 */

const STORAGE_KEY = 'revends:recently-viewed'
export const RECENT_MAX = 8

function safeParse(raw: string | null): number[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0).slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

/** Lit les ids du localStorage (naissance de la lecture au montage, CA-ACC-37). */
export function readRecentIds(): number[] {
  if (typeof window === 'undefined') return []
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

/** Écrit la liste dans le localStorage (chaque consultation publique, CA-ACC-58). */
export function writeRecentIds(ids: number[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, RECENT_MAX)))
  } catch {
    // stockage indisponible (mode privé / quota) — non bloquant
  }
}

function pushId(ids: number[], id: number): number[] {
  return [id, ...ids.filter((v) => v !== id)].slice(0, RECENT_MAX)
}

/** Ajoute une consultation (dédup + borne 8) et persiste. Renvoie la nouvelle liste. */
export function pushRecentId(id: number): number[] {
  const next = pushId(readRecentIds(), id)
  writeRecentIds(next)
  return next
}

/**
 * Purge des ids « morts » (CA-ACC-38 : attente de produits supprimés) puis persiste.
 *
 * Variante SÛRE face à la race du fetch (revue P1-2) : `initial` = la liste lue
 * au montage (avant le fetch). On ne retire que les ids présents dans `initial`
 * ET absents de la réponse (`found`). Les consultations survenues PENDANT le
 * fetch (`pushRecentId`, ids absents de `initial`) sont préservées — jamais
 * écrasées par une écriture basée sur une réponse API partiellement fraîche.
 */
export function purgeRecentIds(initial: number[], found: number[]): void {
  const current = readRecentIds()
  const dead = new Set(initial.filter((id) => !found.includes(id)))
  writeRecentIds(current.filter((id) => !dead.has(id)))
}

/** Vide l'historique (bouton « Effacer » éventuel). */
export function clearRecentIds(): void {
  writeRecentIds([])
}

/** Version pure de `pushId` exposée pour les tests. */
export function pushIdPure(ids: number[], id: number): number[] {
  return pushId(ids, id)
}