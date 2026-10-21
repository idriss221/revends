/**
 * Client API — parle au backend ReVends (docs/api.md).
 *
 * - Base : `VITE_API_URL` si défini (prod = même origine → relatif), sinon
 *   chemin relatif `/api/...` (proxy Vite en dev vers localhost:4001).
 * - Authentification par cookie de session HTTP-only : `credentials: 'include'`
 *   sur chaque requête (jamais de token).
 * - Erreurs uniformes : `{ error: { code, message, details? } }` → ApiError.
 * - Timeouts : 5 s auth, 10 s catalogue/commandes, 7,5 s par défaut ; annulable
 *   via un AbortSignal (recherche à suggestions).
 */
import type {
  AdminCategoriesResponse,
  AdminHistoryItem,
  AdminOrderDetail,
  AdminOrderItem,
  AdminStats,
  AdminUser,
  ApiErrorBody,
  AuthResponse,
  BannersResponse,
  CartLineDto,
  CategoriesResponse,
  CheckoutPayload,
  CheckoutResponse,
  FavoriteProductDto,
  LocationsResponse,
  MyProductsResponse,
  Notification,
  NotificationsResponse,
  OrderDetail,
  OrderSummary,
  OwnerProduct,
  Paged,
  ProductAdmin,
  ProductDetail,
  ProductListParams,
  ProductsResponse,
  RegisterPayload,
  SearchSuggestionsResponse,
  SelfUser,
} from './types'

const BASE_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '')

/** Modèle d'erreur standardisé côté client (contrat §1.6). */
import { ApiError } from './apiClient'
export { ApiError }

/** Timeout par défaut par type d'appel (ms). */
const TIMEOUTS = {
  auth: 5_000, // login / register / logout
  command: 10_000, // checkout, myOrders, catalogue
  default: 7_500, // fallback
} as const

/** Méthode qui modifie l'état → exige le jeton CSRF (double soumission). */
function isMutatingMethod(method?: string): boolean {
  const m = (method ?? 'GET').toUpperCase()
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE'
}

/**
 * Jeton CSRF lu dans le cookie lisible `csrf_token` posé par le serveur
 * (`middleware/csrf.ts`). `null` hors navigateur (SSR/tests) ou si absent.
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Intercepteur global : exécute le fetch, applique credentials + headers JSON,
 * gère timeout/abandon, et transforme la réponse en données… ou en ApiError.
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = TIMEOUTS.default,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  }
  // Protection CSRF : en-tête `X-CSRF-Token` sur toute méthode mutante.
  if (isMutatingMethod(options.method)) {
    const csrf = getCsrfToken()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }

  try {
    let res: Response
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        credentials: 'include',
        headers,
        signal: controller.signal,
      })
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Impossible de joindre le serveur. Vérifiez votre connexion.')
    }

    if (res.status === 204) {
      return undefined as T
    }

    let data: (ApiErrorBody & T) | null = null
    try {
      data = (await res.json()) as ApiErrorBody & T
    } catch {
      data = null
    }

    if (!res.ok) {
      const err = data?.error
      throw new ApiError(
        res.status,
        err?.code ?? 'UNKNOWN_ERROR',
        err?.message ?? `Erreur du serveur (${res.status})`,
        err?.details,
      )
    }

    return data as T
  } finally {
    clearTimeout(timeoutId)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

/** Construit la query string de GET /api/products (api.md §3.2). */
function buildCatalogQuery(params: ProductListParams): string {
  const sp = new URLSearchParams()

  // Mode ids EXCLUSIF : aucun autre paramètre, pas de pagination.
  if (params.ids && params.ids.length > 0) {
    sp.set('ids', params.ids.join(','))
    return sp.toString()
  }

  if (params.q) sp.set('q', params.q)
  if (params.category_id !== undefined && params.category_id !== '') {
    sp.set('category_id', String(params.category_id))
  }
  if (params.subcategory_id !== undefined && params.subcategory_id !== '') {
    sp.set('subcategory_id', String(params.subcategory_id))
  }
  if (params.section) sp.set('section', params.section)
  if (params.sort) sp.set('sort', params.sort)
  if (params.price_min !== undefined) sp.set('price_min', String(params.price_min))
  if (params.price_max !== undefined) sp.set('price_max', String(params.price_max))
  if (params.condition) sp.set('condition', params.condition)
  if (params.location) sp.set('location', params.location)
  if (params.brand) sp.set('brand', params.brand)
  if (params.not_in && params.not_in.length > 0) sp.set('not_in', params.not_in.join(','))

  sp.set('page', String(params.page ?? 1))
  sp.set('per_page', String(params.per_page ?? 12))
  return sp.toString()
}

/**
 * Client API ReVends. Toutes les méthodes renvoient la donnée utile (déjà
 * désenveloppée) ou lèvent une `ApiError`.
 */
export class ApiClient {
  /* --- Auth (§3.1) --- */

  me(): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/me', {}, TIMEOUTS.auth)
  }

  login(identifier: string, password: string): Promise<{ user: SelfUser }> {
    return request<{ user: SelfUser }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ identifier, password }) },
      TIMEOUTS.auth,
    )
  }

  register(payload: RegisterPayload): Promise<AuthResponse> {
    return request<AuthResponse>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(payload) },
      TIMEOUTS.auth,
    )
  }

  logout(): Promise<void> {
    return request<void>('/api/auth/logout', { method: 'POST' }, TIMEOUTS.auth)
  }

  /** Réinitialisation de mot de passe — `POST /api/auth/reset-password`. */
  resetPassword(token: string, password: string): Promise<void> {
    return request<void>(
      '/api/auth/reset-password',
      { method: 'POST', body: JSON.stringify({ token, password }) },
      TIMEOUTS.auth,
    )
  }

  /* --- Catalogue (§3.2) --- */

  categories(): Promise<CategoriesResponse> {
    return request<CategoriesResponse>('/api/categories')
  }

  products(params: ProductListParams = {}): Promise<ProductsResponse> {
    return request<ProductsResponse>(`/api/products?${buildCatalogQuery(params)}`, {}, TIMEOUTS.command)
  }

  productBySlug(slug: string): Promise<ProductDetail> {
    return request<ProductDetail>(`/api/products/${encodeURIComponent(slug)}`, {}, TIMEOUTS.command)
  }

  searchSuggestions(q: string, signal?: AbortSignal): Promise<SearchSuggestionsResponse> {
    const sp = new URLSearchParams({ q })
    return request<SearchSuggestionsResponse>(`/api/products/suggestions?${sp.toString()}`, {}, TIMEOUTS.command, signal)
  }

  productLocations(): Promise<LocationsResponse> {
    return request<LocationsResponse>('/api/products/locations')
  }

  banners(): Promise<BannersResponse> {
    return request<BannersResponse>('/api/banners')
  }

  /* --- Vente / achat (§3.3, §3.4) --- */

  createOrder(productId: number, paymentMethod = 'MOBILE_MONEY'): Promise<{ order: OrderSummary }> {
    return request<{ order: OrderSummary }>(
      '/api/orders',
      { method: 'POST', body: JSON.stringify({ productId, paymentMethod }) },
      TIMEOUTS.command,
    )
  }

  checkout(payload: CheckoutPayload): Promise<CheckoutResponse> {
    const body: Record<string, unknown> = { productIds: payload.productIds }
    if (payload.quantities !== undefined) body.quantities = payload.quantities
    if (payload.paymentMethod !== undefined) body.paymentMethod = payload.paymentMethod
    if (payload.shipping !== undefined) body.shipping = payload.shipping
    if (payload.note !== undefined) body.note = payload.note
    return request<CheckoutResponse>(
      '/api/orders/checkout',
      { method: 'POST', body: JSON.stringify(body) },
      TIMEOUTS.command,
    )
  }

  myOrders(): Promise<{ items: OrderSummary[] }> {
    return request<{ items: OrderSummary[] }>('/api/me/orders')
  }

  mySales(): Promise<{ items: OrderSummary[] }> {
    return request<{ items: OrderSummary[] }>('/api/me/sales')
  }

  myOrderDetail(id: number | string): Promise<{ order: OrderDetail }> {
    // `id` vient de `useParams()` (saisie utilisateur) : encodé comme
    // `productDetail` pour ne pas injecter de chemin (`../`, `%2F`…).
    return request<{ order: OrderDetail }>(`/api/orders/${encodeURIComponent(String(id))}`)
  }

  /* --- Mes articles --- */

  myProducts(): Promise<MyProductsResponse> {
    return request<MyProductsResponse>('/api/me/products')
  }

  createProduct(formData: FormData): Promise<OwnerProduct> {
    return request<OwnerProduct>('/api/products', { method: 'POST', body: formData }, TIMEOUTS.command)
  }

  updateProduct(id: number, formData: FormData): Promise<OwnerProduct> {
    return request<OwnerProduct>(`/api/products/${id}`, { method: 'PUT', body: formData }, TIMEOUTS.command)
  }

  // C4 / ARB-V5-04 : la suppression d'article est réservée à l'administration
  // (`DELETE /api/admin/products/:id`). Aucune méthode cliente de suppression
  // côté vendeur (CA-V5-055) — la route user n'existe plus côté serveur.

  /* --- Panier (§3.4) — le serveur renvoie un TABLEAU de lignes --- */

  getCart(): Promise<CartLineDto[]> {
    return request<CartLineDto[]>('/api/cart')
  }

  addToCart(productId: number, qty = 1): Promise<CartLineDto> {
    return request<CartLineDto>('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ productId, qty }),
    })
  }

  /** PATCH renvoie la ligne, ou 204 (vide) si le produit n'y était plus. */
  updateCartQty(productId: number, qty: number): Promise<CartLineDto | undefined> {
    return request<CartLineDto | undefined>(`/api/cart/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ qty }),
    })
  }

  removeFromCart(productId: number): Promise<void> {
    return request<void>(`/api/cart/${productId}`, { method: 'DELETE' })
  }

  /** Vide entièrement le panier serveur (DELETE /api/cart). */
  clearCart(): Promise<void> {
    return request<void>('/api/cart', { method: 'DELETE' })
  }

  /* --- Favoris (§3.5) — le serveur renvoie un TABLEAU --- */

  getFavorites(): Promise<FavoriteProductDto[]> {
    return request<FavoriteProductDto[]>('/api/favorites')
  }

  /** POST bascule : renvoie `{ added }` (ajouté ? sinon retiré). */
  toggleFavorite(productId: number): Promise<{ added: boolean }> {
    return request<{ added: boolean }>('/api/favorites', {
      method: 'POST',
      body: JSON.stringify({ productId }),
    })
  }

  removeFavorite(productId: number): Promise<void> {
    return request<void>(`/api/favorites/${productId}`, { method: 'DELETE' })
  }

  /* --- Notifications --- */

  notifications(params: { page?: number; per_page?: number; unread_only?: boolean } = {}): Promise<NotificationsResponse> {
    const sp = new URLSearchParams()
    sp.set('page', String(params.page ?? 1))
    sp.set('per_page', String(params.per_page ?? 20))
    if (params.unread_only) sp.set('unread_only', 'true')
    return request<NotificationsResponse>(`/api/me/notifications?${sp.toString()}`)
  }

  markNotificationRead(id: number): Promise<{ notification: Notification }> {
    return request<{ notification: Notification }>(`/api/me/notifications/${id}/read`, { method: 'POST' })
  }

  markAllNotificationsRead(): Promise<{ updated: number }> {
    return request<{ updated: number }>('/api/me/notifications/read-all', { method: 'POST' })
  }

  /* --- Administration (§3.6) --- */

  adminStats(): Promise<AdminStats> {
    return request<AdminStats>('/api/admin/stats')
  }

  adminProducts(
    params: { status?: string; q?: string; page?: number; per_page?: number } = {},
  ): Promise<Paged<ProductAdmin>> {
    const sp = new URLSearchParams()
    if (params.status) sp.set('status', params.status)
    if (params.q) sp.set('q', params.q)
    sp.set('page', String(params.page ?? 1))
    sp.set('per_page', String(params.per_page ?? 12))
    return request<Paged<ProductAdmin>>(`/api/admin/products?${sp.toString()}`)
  }

  approveProduct(id: number): Promise<{ product: ProductAdmin }> {
    return request<{ product: ProductAdmin }>(`/api/admin/products/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  rejectProduct(id: number, reason: string): Promise<{ product: ProductAdmin }> {
    return request<{ product: ProductAdmin }>(`/api/admin/products/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  adminDeleteProduct(id: number): Promise<void> {
    return request<void>(`/api/admin/products/${id}`, { method: 'DELETE' })
  }

  adminOrders(
    params: { status?: string; payout?: string; page?: number; per_page?: number } = {},
  ): Promise<Paged<AdminOrderItem>> {
    const sp = new URLSearchParams()
    if (params.status) sp.set('status', params.status)
    if (params.payout) sp.set('payout', params.payout)
    sp.set('page', String(params.page ?? 1))
    sp.set('per_page', String(params.per_page ?? 12))
    return request<Paged<AdminOrderItem>>(`/api/admin/orders?${sp.toString()}`)
  }

  adminOrderDetail(id: number): Promise<{ order: AdminOrderDetail }> {
    return request<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}`)
  }

  confirmPayment(id: number, body: { method: string; reference?: string }): Promise<{ order: AdminOrderDetail }> {
    return request<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  markProductReceived(id: number, note?: string): Promise<{ order: AdminOrderDetail }> {
    const body = note ? { note } : {}
    return request<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}/mark-product-received`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  markShipped(id: number): Promise<{ order: AdminOrderDetail }> {
    return request<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}/mark-shipped`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  startDelivery(
    id: number,
    body: { carrier?: string; trackingNumber?: string },
  ): Promise<{ order: AdminOrderDetail }> {
    return request<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}/start-delivery`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  markDelivered(id: number): Promise<{ order: AdminOrderDetail }> {
    return request<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}/mark-delivered`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  cancelOrder(id: number, note: string): Promise<{ order: AdminOrderDetail }> {
    return request<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    })
  }

  sellerPayout(id: number, reference?: string): Promise<{ order: AdminOrderDetail }> {
    const body = reference ? { reference } : {}
    return request<{ order: AdminOrderDetail }>(`/api/admin/orders/${id}/seller-payout`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  adminCategories(): Promise<AdminCategoriesResponse> {
    return request<AdminCategoriesResponse>('/api/admin/categories')
  }

  patchCategory(id: number, body: { name?: string; active?: boolean }): Promise<{ category: unknown }> {
    return request<{ category: unknown }>(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
  }

  adminUsers(params: { q?: string; page?: number; per_page?: number } = {}): Promise<Paged<AdminUser>> {
    const sp = new URLSearchParams()
    if (params.q) sp.set('q', params.q)
    sp.set('page', String(params.page ?? 1))
    sp.set('per_page', String(params.per_page ?? 20))
    return request<Paged<AdminUser>>(`/api/admin/users?${sp.toString()}`)
  }

  adminHistory(
    params: { action?: string; page?: number; per_page?: number } = {},
  ): Promise<Paged<AdminHistoryItem>> {
    const sp = new URLSearchParams()
    if (params.action) sp.set('action', params.action)
    sp.set('page', String(params.page ?? 1))
    sp.set('per_page', String(params.per_page ?? 20))
    return request<Paged<AdminHistoryItem>>(`/api/admin/history?${sp.toString()}`)
  }
}

/** Instance partagée du client API. */
export const api = new ApiClient()

/** ENDPOINT PUBLIC : fiche article par slug (GET /api/products/:slug). */
export async function fetchProductBySlug(slug: string): Promise<ProductDetail> {
  return request<ProductDetail>(`/api/products/${encodeURIComponent(slug)}`, {}, TIMEOUTS.command)
}
