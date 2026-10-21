/**
 * Tests unitaires — client API (src/lib/api.ts).
 * `fetch` global mocké : on vérifie la CONSTRUCTION des requêtes
 * (chemins, method, body JSON, credentials, query string) et le
 * contrat d'erreur uniforme `{ error: { code, message } }` (docs/api.md §1.6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiError, api, fetchProductBySlug } from './api'

/** Signaler un fetch typé (input + init) → Response factice. */
type FetchImpl = (input?: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type MockFetch = ReturnType<typeof vi.fn<FetchImpl>>

function fakeResponse(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response
}

/** Installe un mock fetch qui répond toujours avec `body`/`status`. */
function installFetch(body: unknown, status = 200): MockFetch {
  const mock = vi.fn<FetchImpl>(async () => fakeResponse(body, status))
  vi.stubGlobal('fetch', mock)
  return mock
}

/** Installe un mock fetch qui échoue côté réseau. */
function installNetworkError(): MockFetch {
  const mock = vi.fn<FetchImpl>(async () => {
    throw new TypeError('fetch failed')
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

/** (url, init) de la dernière requête. */
function lastCall(mock: MockFetch): { url: string; init?: RequestInit } {
  const call = mock.mock.calls.at(-1) as unknown as [string, RequestInit?]
  return { url: call[0], init: call[1] }
}

beforeEach(() => vi.unstubAllGlobals())

describe('requêtes HTTP (base + credentials)', () => {
  it("envoie credentials:'include' et Content-Type JSON partout", async () => {
    const mock = installFetch({ user: null })
    await api.me()
    expect(mock).toHaveBeenCalledTimes(1)
    const { url, init } = lastCall(mock)
    expect(url).toBe('/api/auth/me')
    expect(init?.credentials).toBe('include')
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })
  it('login : POST /api/auth/login avec body JSON', async () => {
    const mock = installFetch({ user: { id: 1 } })
    await api.login('aicha@test.revends', 'motdepasse123')
    const { url, init } = lastCall(mock)
    expect(url).toBe('/api/auth/login')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ identifier: 'aicha@test.revends', password: 'motdepasse123' }))
  })
  it('204 → résolution sans corps (logout)', async () => {
    const mock = vi.fn<FetchImpl>(async () => fakeResponse(null, 204))
    vi.stubGlobal('fetch', mock)
    await expect(api.logout()).resolves.toBeUndefined()
    expect(mock).toHaveBeenCalledTimes(1)
  })
})

describe("contrat d'erreur uniforme ApiError (§1.6)", () => {
  it('drape l’erreur de SERVEUR via le code du body', async () => {
    installFetch({ error: { code: 'PRODUCT_RESERVED', message: 'Article déjà réservé' } }, 409)
    try {
      await api.createOrder(42)
      expect.unreachable('doit lever')
    } catch (e) {
      const err = e as ApiError
      expect(err).toBeInstanceOf(ApiError)
      expect(err.status).toBe(409)
      expect(err.code).toBe('PRODUCT_RESERVED')
      expect(err.readableMessage()).toBe('Article déjà réservé')
    }
  })
  it('NETWORK_ERROR quand fetch échoue (serveur injoignable)', async () => {
    installNetworkError()
    await expect(api.me()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })
  it('readableMessage : priorité aux erreurs de champ (details)', async () => {
    installFetch(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Données invalides',
          details: [
            { field: 'price', message: 'Le prix doit être ≥ 500' },
            { field: 'name', message: '3 caractères minimum' },
          ],
        },
      },
      400,
    )
    try {
      await api.createProduct(new FormData())
      expect.unreachable('doit lever')
    } catch (e) {
      const err = e as ApiError
      expect(err.readableMessage()).toBe('Le prix doit être ≥ 500\n3 caractères minimum')
    }
  })
})

describe('construction des requêtes produit/notifications', () => {
  it('products : défauts page=1&per_page=12, catégorie vide ignorée', async () => {
    const mock = installFetch({ items: [], page: 1, perPage: 12, total: 0, totalPages: 0 })
    await api.products({ q: 'iphone', category_id: '' })
    expect(lastCall(mock).url).toBe('/api/products?q=iphone&page=1&per_page=12')
  })
  it('products : tri prix_asc et catégorie explicite', async () => {
    const mock = installFetch({ items: [], page: 1, perPage: 12, total: 0, totalPages: 0 })
    await api.products({ category_id: 3, sort: 'price_asc' })
    expect(lastCall(mock).url).toBe('/api/products?category_id=3&sort=price_asc&page=1&per_page=12')
  })
  it('products V4 : section avec per_page personnalisé', async () => {
    const mock = installFetch({ items: [], page: 1, perPage: 10, total: 0, totalPages: 0 })
    await api.products({ section: 'promotions', per_page: 10 })
    expect(lastCall(mock).url).toBe('/api/products?section=promotions&page=1&per_page=10')
  })
  it('products V4 : filtres combinés (sous-catégorie, prix, état, localisation, marque, not_in)', async () => {
    const mock = installFetch({ items: [], page: 1, perPage: 12, total: 0, totalPages: 0 })
    await api.products({
      subcategory_id: 13,
      price_min: 1000,
      price_max: 50000,
      condition: 'Bon état',
      location: 'Abidjan, Cocody',
      brand: 'Samsung',
      not_in: [1, 2],
    })
    expect(lastCall(mock).url).toBe(
      '/api/products?subcategory_id=13&price_min=1000&price_max=50000&condition=Bon+%C3%A9tat&location=Abidjan%2C+Cocody&brand=Samsung&not_in=1%2C2&page=1&per_page=12',
    )
  })
  it('products V4 : mode ids EXCLUSIF (pas de page/per_page)', async () => {
    const mock = installFetch({ items: [], page: 1, perPage: 4, total: 4, totalPages: 0 })
    await api.products({ ids: [9, 7, 5] })
    expect(lastCall(mock).url).toBe('/api/products?ids=9%2C7%2C5')
  })
  it('notifications : unread_only=true en clair', async () => {
    const mock = installFetch({ items: [], unreadCount: 0, page: 1, perPage: 20, total: 0, totalPages: 0 })
    await api.notifications({ unread_only: true })
    expect(lastCall(mock).url).toBe('/api/me/notifications?page=1&per_page=20&unread_only=true')
  })
  it('fetchProductBySlug encode le slug (espaces, caractères spéciaux)', async () => {
    const mock = installFetch({ id: 1 })
    await fetchProductBySlug('iphone 13 pro')
    expect(lastCall(mock).url).toBe('/api/products/iphone%2013%20pro')
  })
})

describe('endpoints V4-Accueil (bannières, localisations, contact)', () => {
  it('banners : GET /api/banners (public)', async () => {
    const mock = installFetch({ banners: [{ id: 1, title: 'Braderie', subtitle: null, imagePath: '/uploads/banners/x.jpg', linkUrl: '/search', position: 1 }] })
    const res = await api.banners()
    expect(lastCall(mock).url).toBe('/api/banners')
    expect(res.banners).toHaveLength(1)
    expect(res.banners[0].imagePath).toBe('/uploads/banners/x.jpg')
  })
  it('productLocations : GET /api/products/locations', async () => {
    const mock = installFetch({ locations: ['Abidjan, Cocody', 'Yamoussoukro'] })
    const res = await api.productLocations()
    expect(lastCall(mock).url).toBe('/api/products/locations')
    expect(res.locations).toEqual(['Abidjan, Cocody', 'Yamoussoukro'])
  })
  // [C6-SUPPRIMÉ] contactSeller retiré (CA-V5-097/102) — tests supprimés.
})

describe('administration — cycle commande V3', () => {
  it('markShipped : POST /api/admin/orders/:id/mark-shipped sans body autres que {}', async () => {
    const mock = installFetch({ order: { id: 12 } })
    await api.markShipped(12)
    const { url, init } = lastCall(mock)
    expect(url).toBe('/api/admin/orders/12/mark-shipped')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{}')
  })
  it('adminOrders transmet le filtre payout (due/pending/paid) en clair', async () => {
    const mock = installFetch({ items: [], page: 1, perPage: 12, total: 0, totalPages: 0 })
    await api.adminOrders({ payout: 'due', page: 1, per_page: 12 })
    expect(lastCall(mock).url).toBe('/api/admin/orders?payout=due&page=1&per_page=12')
  })
})

/**
 * Suppression admin d'un article (vague 1 — CA-V5-065).
 *
 * Contrat serveur (docs/api.md) :
 * · `204` sans corps, **idempotent** (un 2ᵉ appel sur un article déjà supprimé
 *   renvoie `204`, pas `404` — l'API ne distingue pas « absent » de « supprimé ») ;
 * · `404 PRODUCT_NOT_FOUND` quand l'id n'a jamais existé ;
 * · `409 PRODUCT_HAS_ACTIVE_ORDER` quand l'article est lié à une commande en cours.
 *
 * Le front garde `hasActiveOrder` pour l'UX, mais le **409 serveur reste la vérité** :
 * la page doit gérer les deux chemins.
 */
describe('suppression admin d’un article (CA-V5-065)', () => {
  it('204 sans corps : la promesse résout undefined (idempotent)', async () => {
    const mock = installFetch(null, 204)
    await expect(api.adminDeleteProduct(42)).resolves.toBeUndefined()
    const { url, init } = lastCall(mock)
    expect(url).toBe('/api/admin/products/42')
    expect(init?.method).toBe('DELETE')
  })
  it('404 PRODUCT_NOT_FOUND : identifiant inconnu', async () => {
    installFetch({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Article introuvable' } }, 404)
    try {
      await api.adminDeleteProduct(999)
      expect.unreachable('doit lever')
    } catch (e) {
      const err = e as ApiError
      expect(err.status).toBe(404)
      expect(err.code).toBe('PRODUCT_NOT_FOUND')
      expect(err.readableMessage()).toBe('Article introuvable')
    }
  })
  it('409 PRODUCT_HAS_ACTIVE_ORDER : commande en cours → suppression refusée', async () => {
    installFetch(
      { error: { code: 'PRODUCT_HAS_ACTIVE_ORDER', message: 'Article lié à une commande en cours' } },
      409,
    )
    await expect(api.adminDeleteProduct(7)).rejects.toMatchObject({ status: 409, code: 'PRODUCT_HAS_ACTIVE_ORDER' })
  })
})

describe('checkout groupé « Jumia » (§3.4)', () => {
  it('POST /api/orders/checkout avec corps groupé (productIds + quantities + livraison + note)', async () => {
    const mock = installFetch({ orders: [], count: 0 })
    await api.checkout({
      productIds: [15, 16],
      quantities: { '15': 2, '16': 1 },
      paymentMethod: 'MOBILE_MONEY',
      shipping: { name: 'Aïcha Koné', phone: '07 07 00 00 00', city: 'Abidjan, Cocody', address: 'Rue des jardins, villa 12' },
      note: 'Disponible le soir',
    })
    const { url, init } = lastCall(mock)
    expect(url).toBe('/api/orders/checkout')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      productIds: [15, 16],
      quantities: { '15': 2, '16': 1 },
      paymentMethod: 'MOBILE_MONEY',
      shipping: {
        name: 'Aïcha Koné',
        phone: '07 07 00 00 00',
        city: 'Abidjan, Cocody',
        address: 'Rue des jardins, villa 12',
      },
      note: 'Disponible le soir',
    })
  })
  it('sans livraison ni note : quantities/shipping/note absents du corps JSON', async () => {
    const mock = installFetch({ orders: [], count: 0 })
    await api.checkout({ productIds: [7] })
    const { init } = lastCall(mock)
    expect(JSON.parse(init?.body as string)).toEqual({ productIds: [7] })
  })
  it('drape l’erreur métier du checkout (409 → produit indisponible)', async () => {
    installFetch({ error: { code: 'PRODUCT_RESERVED', message: 'Article déjà réservé' } }, 409)
    try {
      await api.checkout({ productIds: [42] })
      expect.unreachable('doit lever')
    } catch (e) {
      const err = e as ApiError
      expect(err.status).toBe(409)
      expect(err.readableMessage()).toBe('Article déjà réservé')
    }
  })
})
describe('sécurité des chemins (M3) — encodage des identifiants', () => {
  it('myOrderDetail encode la saisie utilisateur dans l’URL', async () => {
    const mock = installFetch({ order: { id: 1 } })
    await api.myOrderDetail('../admin/orders')
    expect(lastCall(mock).url).toBe('/api/orders/..%2Fadmin%2Forders')
  })
  it('myOrderDetail laisse passer un id numérique propre', async () => {
    const mock = installFetch({ order: { id: 1 } })
    await api.myOrderDetail(12)
    expect(lastCall(mock).url).toBe('/api/orders/12')
  })
})
