import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { TOAST_COPY } from '../lib/constants'
import {
  favoriteToEntry,
  isFavoriteEntry,
  toggleEntry,
  toggleLocalFavorite,
  type FavoriteEntry,
  type FavoritesLocalState,
} from '../lib/hybridStore'

export type { FavoriteEntry } from '../lib/hybridStore'

/**
 * Favoris « Cœurs » — **hybride** (WS1) :
 *  · **anonyme** → `localStorage` (deux clés pour compatibilité ascendante) ;
 *  · **connecté** → source de vérité = `GET /api/favorites`.
 *
 * Deux clés anonymes (sans perte) : `revends:favorites:v2` → `FavoriteEntry[]`
 * (avec instantané d'affichage) ; `revends:favorites` → `number[]` (héritage V4,
 * ids seuls). L'instantané permet à l'écran « Favoris » de rendre des cartes
 * réelles sans re-requêter le catalogue.
 */

interface FavoritesContextValue {
  /** favoris avec instantané — rendus en cartes */
  entries: FavoriteEntry[]
  /** ids favoris sans instantané (héritage V4) */
  pendingIds: number[]
  /** nombre total de favoris (entrées + ids en attente) */
  count: number
  isFavorite: (productId: number) => boolean
  /** Bascule cœur — renvoie le nouvel état (ajouté ?). `entry` alimente l'instantané. */
  toggleFavorite: (productId: number, entry?: Omit<FavoriteEntry, 'id'>) => boolean
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

const STORAGE_KEY = 'revends:favorites'
const STORAGE_KEY_V2 = 'revends:favorites:v2'

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // stockage indisponible (mode privé…) — les favoris restent en mémoire
  }
}

function loadLocalState(): FavoritesLocalState {
  const rawV2 = readJson(STORAGE_KEY_V2)
  const entries = Array.isArray(rawV2) ? rawV2.filter(isFavoriteEntry) : []

  // Héritage V4 : ids seuls, sans instantané.
  const rawLegacy = readJson(STORAGE_KEY)
  const known = new Set(entries.map((e) => e.id))
  const pendingIds = Array.isArray(rawLegacy)
    ? rawLegacy.filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && !known.has(v))
    : []

  return { entries, pendingIds }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const toast = useToast()
  const authed = user !== null

  const [localState, setLocalState] = useState<FavoritesLocalState>(loadLocalState)
  const [serverEntries, setServerEntries] = useState<FavoriteEntry[]>([])

  const localRef = useRef(localState)
  useEffect(() => {
    localRef.current = localState
  }, [localState])

  // Persistance des favoris ANONYMES uniquement (les favoris serveur ne
  // « fuient » pas dans le stockage local de l'appareil).
  useEffect(() => {
    if (!authed) {
      writeJson(STORAGE_KEY_V2, localState.entries)
      writeJson(STORAGE_KEY, localState.pendingIds)
    }
  }, [localState, authed])

  const refreshServer = useCallback(async () => {
    const favs = await api.getFavorites()
    setServerEntries(favs.map(favoriteToEntry))
  }, [])

  const onError = useCallback(() => {
    toast('error', TOAST_COPY.networkError)
    void refreshServer().catch(() => {})
  }, [toast, refreshServer])

  // Synchronisation serveur à la connexion (+ fusion des favoris anonymes, une fois).
  const mergedFor = useRef<number | null>(null)
  useEffect(() => {
    if (!authed || !user) {
      setServerEntries([])
      mergedFor.current = null
      return
    }
    let cancelled = false
    void (async () => {
      try {
        if (mergedFor.current !== user.id) {
          mergedFor.current = user.id
          const { entries, pendingIds } = localRef.current
          const ids = [...entries.map((e) => e.id), ...pendingIds]
          if (ids.length > 0) {
            const server = await api.getFavorites()
            const have = new Set(server.map((f) => f.productId))
            for (const id of ids) {
              if (have.has(id)) continue
              try {
                await api.toggleFavorite(id)
              } catch {
                // produit retiré : on ignore cette ligne au lieu de bloquer la fusion
              }
            }
            if (!cancelled) setLocalState({ entries: [], pendingIds: [] })
          }
        }
        await refreshServer()
      } catch {
        // réseau indisponible : on conserve l'état courant
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authed, user, refreshServer])

  const entries = authed ? serverEntries : localState.entries
  const pendingIds = authed ? [] : localState.pendingIds
  const count = entries.length + pendingIds.length

  const isFavorite = useCallback(
    (productId: number) => entries.some((e) => e.id === productId) || pendingIds.includes(productId),
    [entries, pendingIds],
  )

  const toggleFavorite = useCallback(
    (productId: number, entry?: Omit<FavoriteEntry, 'id'>) => {
      // L'état ajouté/retiré est déterminé depuis l'état COURANT, jamais dans
      // l'updater (invoqué 2× en StrictMode, retour non fiable — P2-8).
      const adding = !isFavorite(productId)
      if (authed) {
        setServerEntries((prev) => toggleEntry(prev, productId, entry))
        api
          .toggleFavorite(productId)
          .then(() => refreshServer())
          .catch(onError)
      } else {
        setLocalState((prev) => toggleLocalFavorite(prev, productId, entry))
      }
      return adding
    },
    [authed, isFavorite, refreshServer, onError],
  )

  const value = useMemo<FavoritesContextValue>(
    () => ({ entries, pendingIds, count, isFavorite, toggleFavorite }),
    [entries, pendingIds, count, isFavorite, toggleFavorite],
  )

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites doit être utilisé dans <FavoritesProvider>')
  return ctx
}
