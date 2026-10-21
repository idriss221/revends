import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { TOAST_COPY } from '../lib/constants'
import {
  MAX_QTY,
  addToItems,
  cartLineToItem,
  clampQty,
  decItem,
  incItem,
  normalizeStoredItem,
  removeItem,
  type CartItem,
} from '../lib/hybridStore'
import type { ProductDetail, ProductCardItem } from '../lib/types'

export { MAX_QTY } from '../lib/hybridStore'
export type { CartItem } from '../lib/hybridStore'

interface CartContextValue {
  items: CartItem[]
  /** Ajoute un produit : 1re fois → ligne qty 1 ; déjà présent → +1 (max 9). */
  add: (product: ProductCardItem | ProductDetail) => void
  /** Retire une ligne complète du panier. */
  remove: (productId: number) => void
  /** +1 (plafonné à MAX_QTY). */
  inc: (productId: number) => void
  /** −1 ; si la quantité atteint 0, l'article est retiré du panier. */
  dec: (productId: number) => void
  /** Vide entièrement le panier. */
  clear: () => void
  /** Nombre TOTAL d'exemplaires (Σ qty) — badge navbar. */
  count: number
  /** Total FCFA : Σ (prix × qty). */
  total: number
  /**
   * `true` quand le panier peut être considéré comme **fiable** : session
   * résolue (GET /api/auth/me) ET, si connecté, panier serveur chargé
   * (GET /api/cart). Tant que `false`, `items` peut être vide « à tort ».
   *
   * Indispensable aux pages qui prennent une décision sur `items.length === 0`
   * (ex. `CheckoutPage` redirige vers `/panier`) : sans ce garde-fou, un
   * **deep-link** `/commande` en étant connecté rebondit vers `/panier` le
   * temps que le panier serveur arrive (course au 1er rendu).
   */
  ready: boolean
}

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = 'revends-cart'

/** Charge le panier ANONYME depuis localStorage (tolérant aux formats anciens). */
function loadLocal(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeStoredItem).filter((x): x is CartItem => x !== null)
  } catch {
    return []
  }
}

function persistLocal(items: CartItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // stockage indisponible (mode privé…) : le panier reste en mémoire
  }
}

/**
 * Panier **hybride** (WS1) :
 *  · **anonyme** → panier local (`localStorage`), survit au refresh/login ;
 *  · **connecté** → source de vérité = `GET /api/cart` ; les mutations passent
 *    par l'API avec mise à jour optimiste + resynchronisation ;
 *  · à la **connexion**, le panier anonyme est fusionné dans le panier serveur
 *    (union des lignes, quantité maximale conservée) puis vidé localement.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth()
  const toast = useToast()
  const authed = user !== null

  const [localItems, setLocalItems] = useState<CartItem[]>(loadLocal)
  const [serverItems, setServerItems] = useState<CartItem[]>([])
  /** Panier serveur chargé (une fois) pour la session connectée courante. */
  const [serverReady, setServerReady] = useState(false)

  // Réfs pour lire l'état courant dans les callbacks sans les mettre en dépendance.
  const localRef = useRef(localItems)
  const serverRef = useRef(serverItems)
  useEffect(() => {
    localRef.current = localItems
  }, [localItems])
  useEffect(() => {
    serverRef.current = serverItems
  }, [serverItems])

  // Le panier anonyme est persisté (connecté : état serveur, rien à persister).
  useEffect(() => {
    if (!authed) persistLocal(localItems)
  }, [localItems, authed])

  const refreshServer = useCallback(async () => {
    const lines = await api.getCart()
    setServerItems(lines.map(cartLineToItem))
  }, [])

  const onError = useCallback(() => {
    toast('error', TOAST_COPY.networkError)
    void refreshServer().catch(() => {})
  }, [toast, refreshServer])

  // Synchronisation serveur à la connexion (+ fusion du panier anonyme, une fois).
  const mergedFor = useRef<number | null>(null)
  useEffect(() => {
    if (!authed || !user) {
      setServerItems([])
      mergedFor.current = null
      setServerReady(false)
      return
    }
    let cancelled = false
    setServerReady(false)
    void (async () => {
      try {
        if (mergedFor.current !== user.id) {
          mergedFor.current = user.id
          const local = localRef.current
          if (local.length > 0) {
            const server = await api.getCart()
            for (const it of local) {
              const existing = server.find((l) => l.productId === it.id)
              try {
                if (!existing) await api.addToCart(it.id, clampQty(it.qty))
                else if (existing.qty < it.qty) await api.updateCartQty(it.id, clampQty(it.qty))
              } catch {
                // une ligne en échec (produit retiré) ne bloque pas la fusion
              }
            }
            if (!cancelled) setLocalItems([])
          }
        }
        await refreshServer()
      } catch {
        // réseau indisponible : on conserve l'état courant
      } finally {
        // Même en échec réseau, on cesse d'attendre : sinon les pages qui
        // gardent `ready` pour décider (CheckoutPage) resteraient bloquées.
        if (!cancelled) setServerReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authed, user, refreshServer])

  const items = authed ? serverItems : localItems

  const add = useCallback(
    (product: ProductCardItem | ProductDetail) => {
      if (authed) {
        setServerItems((prev) => addToItems(prev, product))
        api
          .addToCart(product.id, 1)
          .then(() => refreshServer())
          .catch(onError)
      } else {
        setLocalItems((prev) => addToItems(prev, product))
      }
    },
    [authed, refreshServer, onError],
  )

  const remove = useCallback(
    (productId: number) => {
      if (authed) {
        setServerItems((prev) => removeItem(prev, productId))
        api
          .removeFromCart(productId)
          .then(() => refreshServer())
          .catch(onError)
      } else {
        setLocalItems((prev) => removeItem(prev, productId))
      }
    },
    [authed, refreshServer, onError],
  )

  const inc = useCallback(
    (productId: number) => {
      if (authed) {
        const current = serverRef.current.find((i) => i.id === productId)
        const nextQty = Math.min(MAX_QTY, (current?.qty ?? 0) + 1)
        setServerItems((prev) => incItem(prev, productId))
        if (nextQty > (current?.qty ?? 0)) {
          api
            .updateCartQty(productId, nextQty)
            .then(() => refreshServer())
            .catch(onError)
        }
      } else {
        setLocalItems((prev) => incItem(prev, productId))
      }
    },
    [authed, refreshServer, onError],
  )

  const dec = useCallback(
    (productId: number) => {
      if (authed) {
        const current = serverRef.current.find((i) => i.id === productId)
        const nextQty = (current?.qty ?? 1) - 1
        setServerItems((prev) => decItem(prev, productId))
        const op = nextQty <= 0 ? api.removeFromCart(productId) : api.updateCartQty(productId, nextQty)
        op.then(() => refreshServer()).catch(onError)
      } else {
        setLocalItems((prev) => decItem(prev, productId))
      }
    },
    [authed, refreshServer, onError],
  )

  const clear = useCallback(() => {
    if (authed) {
      setServerItems([])
      api
        .clearCart()
        .then(() => refreshServer())
        .catch(onError)
    } else {
      setLocalItems([])
    }
  }, [authed, refreshServer, onError])

  const count = useMemo(() => items.reduce((sum, i) => sum + i.qty, 0), [items])
  const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.qty, 0), [items])

  // Fiable = session résolue ET (anonyme − panier local synchrone) OU panier
  // serveur chargé. Voir `CartContextValue.ready`.
  const ready = !authLoading && (!authed || serverReady)

  const value = useMemo<CartContextValue>(
    () => ({ items, add, remove, inc, dec, clear, count, total, ready }),
    [items, add, remove, inc, dec, clear, count, total, ready],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart doit être utilisé dans <CartProvider>')
  return ctx
}
