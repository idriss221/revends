import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { csrfHeaders, registerSeller, seedApprovedProduct } from '../lib/fixtures'

/**
 * Verrouillage de TOUTES les redirections et de la navigation — web (ReVends).
 *
 * Couvre la **SPA React** (`src/App.tsx`, routes en chemin) : le front
 * ancien Bureau vanilla (`public/bureau/`) a été **supprimé**, toute la surface
 * publique vit dans `SiteShell` (nouveau design) et les gardes sont React
 * (`RequireUser` / `RequireAdmin` → `/login?next=…`).
 *
 * Chaque redirection est verrouillée par une assertion sur l'**URL complète**
 * (pathname + search) **ET** sur le **contenu visible** — une URL qui change
 * vers un écran vide n'est pas une redirection réussie.
 *
 * ## Isolation
 * L'API cible (`api-e2e`, port 4002) est **sans limite de débit** : on peut donc
 * faire un `page.goto` par route. Chaque scénario crée son propre
 * `BrowserContext` (état jetable) qu'il referme.
 */

/** URL du serveur nginx de production locale (statuts HTTP niveau serveur). */
const NGINX = process.env.E2E_NGINX_URL ?? 'http://localhost:8080'

/** Découpe une URL en pathname / search (source de vérité commune). */
function loc(page: Page): { pathname: string; search: string } {
  const u = new URL(page.url())
  return { pathname: u.pathname, search: u.search }
}

/** Valeur décodée du paramètre `next` porté par la query `?next=…`. */
function nextParam(page: Page): string | null {
  return new URLSearchParams(page.url().split('?')[1] ?? '').get('next')
}

/** Exécute `fn` dans un contexte anonyme jetable, toujours refermé. */
async function withContext(
  browser: Browser,
  fn: (page: Page, context: BrowserContext) => Promise<void>,
  init?: { admin?: boolean; cart?: boolean },
): Promise<void> {
  const context = await browser.newContext({
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
  })
  try {
    if (init?.admin) {
      const raw = JSON.parse(readFileSync(join(process.cwd(), 'e2e', '.session.json'), 'utf8')) as { cookie: string }
      const eq = raw.cookie.indexOf('=')
      await context.addCookies([
        { name: raw.cookie.slice(0, eq), value: raw.cookie.slice(eq + 1), domain: '127.0.0.1', path: '/' },
      ])
    }
    if (init?.cart) {
      await context.addInitScript(() => {
        localStorage.setItem(
          'revends-cart',
          JSON.stringify([
            { id: 987654, name: 'Article nav-test', slug: 'article-nav-test', price: 15000, imageUrl: '', categoryName: '', qty: 1 },
          ]),
        )
      })
    }
    await fn(await context.newPage(), context)
  } finally {
    await context.close()
  }
}

/* ========================================================================== *
 * 1. Routes React publiques (login / register / dashboard)
 * ========================================================================== */

test.describe('routes React publiques — CA-AUTH04', () => {
  test('/login rend la page de connexion React', async ({ browser }) => {
    await withContext(browser, async (page) => {
      await page.goto('/login')
      expect(loc(page)).toMatchObject({ pathname: '/login', search: '' })
      // En-tête `Auth` (h1 `#authTitle`) + le formulaire React.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bon retour')
      await expect(page.locator('#aMail')).toBeVisible()
      await expect(page.locator('#aPass')).toBeVisible()
    })
  })

  test('/register rend la page d’inscription React', async ({ browser }) => {
    await withContext(browser, async (page) => {
      await page.goto('/register')
      expect(loc(page)).toMatchObject({ pathname: '/register', search: '' })
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rejoignez Revends')
      await expect(page.locator('#aName')).toBeVisible()
      await expect(page.locator('#aMail')).toBeVisible()
    })
  })

  test('/dashboard redirige vers l’accueil', async ({ browser }) => {
    await withContext(browser, async (page) => {
      await page.goto('/dashboard')
      // `expect(page).toHaveURL` RE-EVALUE la URL (contrairement à `loc(page)`,
      // capturée une fois) : la redirection est asynchrone.
      await expect(page).toHaveURL(/\/$/)
      expect(loc(page)).toMatchObject({ pathname: '/', search: '' })
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Donnez une seconde vie à ce qui vous ressemble.',
      )
    })
  })

  test('/vendre : connecté → /sell ; anonyme → /login en conservant la destination', async ({ browser }) => {
    // 1) connecté : la page de vente React s'affiche réellement.
    await withContext(browser, async (page) => {
      await registerSeller(page, 'nav-vendre')
      await page.goto('/sell')
      expect(loc(page)).toMatchObject({ pathname: '/sell', search: '' })
      await expect(page.getByRole('heading', { level: 1, name: 'Publier un article' })).toBeVisible()
    })
    // 2) anonyme : la garde `RequireUser` renvoie vers /login?next=%2Fvendre.
    await withContext(browser, async (page) => {
      await page.goto('/vendre')
      await expect(page).toHaveURL(/\/login\?next=/)
      expect(nextParam(page)).toBe('/vendre')
      await expect(page.locator('#aMail')).toBeVisible()
    })
  })
})

/* ========================================================================== *
 * 2. Garde RequireAdmin (anonyme / non-admin / admin)
 * ========================================================================== */

test.describe('RequireAdmin', () => {
  const ADMIN_ROUTES = [
    '/admin',
    '/admin/articles-en-attente',
    '/admin/articles',
    '/admin/commandes',
    '/admin/paiements',
    '/admin/utilisateurs',
    '/admin/categories',
    '/admin/historique',
  ]

  test('anonyme → /login en conservant la destination admin', async ({ browser }) => {
    test.setTimeout(60_000)
    await withContext(browser, async (page) => {
      for (const path of ADMIN_ROUTES) {
        await page.goto(path)
        await expect(page, `redirection admin de ${path}`).toHaveURL(/\/login\?next=/)
        expect(nextParam(page), `next pour ${path}`).toBe(path)
        await expect(page.locator('#aMail'), `connexion pour ${path}`).toBeVisible()
      }
    })
  })

  test('rôle user connecté → refus, retour à l’accueil', async ({ browser }) => {
    await withContext(browser, async (page) => {
      await registerSeller(page, 'nav-non-admin')
      await page.goto('/admin')
      await expect(page).toHaveURL(/\/$/)
      expect(loc(page)).toMatchObject({ pathname: '/', search: '' })
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Donnez une seconde vie à ce qui vous ressemble.',
      )
    })
  })

  test('compte admin → accès aux écrans /admin', async ({ browser }) => {
    await withContext(
      browser,
      async (page) => {
        await page.goto('/admin')
        await expect(page).toHaveURL(/\/admin$/)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard')

        await page.goto('/admin/commandes')
        await expect(page).toHaveURL(/\/admin\/commandes$/)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Commandes')
      },
      { admin: true },
    )
  })
})

/* ========================================================================== *
 * 3. Route inconnue (React)
 * ========================================================================== */

test.describe('routes inconnues', () => {
  test('une route React inconnue rend la page introuvable (dans la coquille)', async ({ browser }) => {
    await withContext(browser, async (page) => {
      await page.goto('/route-qui-nexiste-pas')
      expect(loc(page)).toMatchObject({ pathname: '/route-qui-nexiste-pas', search: '' })
      await expect(page.getByRole('heading', { level: 1 })).toHaveText("Cette page n'a pas trouvé de seconde vie")
      await expect(page.getByRole('link', { name: /Retour à l'accueil/ })).toBeVisible()
      // La coquille reste présente : un lien mort ne prive pas de la navbar.
      await expect(page.getByRole('banner')).toBeVisible()
    })
  })
})

/* ========================================================================== *
 * 4. nginx — statuts HTTP niveau serveur (fallback SPA)
 * ========================================================================== */

test.describe('nginx — statuts serveur', () => {
  test('fallback SPA (200) sur deep link', async ({ request }) => {
    const deep = await request.get(`${NGINX}/mes-commandes`)
    expect(deep.status(), 'GET /mes-commandes (deep link)').toBe(200)
    expect(await deep.text(), 'contenu = index.html').toContain('id="root"')

    // `/catalogue` nu : le fallback SPA (200) sert index.html et l'app y
    // affiche la page introuvable côté client (comportement réel verrouillé).
    const catalogue = await request.get(`${NGINX}/catalogue`)
    expect(catalogue.status(), 'GET /catalogue (nu) — réel : fallback SPA').toBe(200)
    expect(await catalogue.text(), 'contenu = index.html').toContain('id="root"')
  })

  test('le routeur SPA résout /catalogue nu vers la page introuvable (client)', async ({ browser }) => {
    await withContext(browser, async (page) => {
      await page.goto('/catalogue')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText("Cette page n'a pas trouvé de seconde vie")
      expect(loc(page)).toMatchObject({ pathname: '/catalogue', search: '' })
    })
  })
})

/* ========================================================================== *
 * 5. Historique navigateur, rechargement et session déjà ouverte
 * ========================================================================== */

test.describe('historique et rechargement', () => {
  test('retour (back) puis avant (forward) après une redirection', async ({ browser }) => {
    await withContext(browser, async (page) => {
      await page.goto('/panier')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre panier')

      // Navigation complète ; la garde `RequireUser` remplace l'entrée par login.
      await page.goto('/mes-commandes')
      await expect(page).toHaveURL(/\/login\?next=/)

      await page.goBack()
      await expect(page).toHaveURL(/\/panier$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre panier')

      await page.goForward()
      await expect(page).toHaveURL(/\/login\?next=/)
      await expect(page.locator('#aMail')).toBeVisible()
    })
  })

  test('rechargement (F5) sur les deep-links clés', async ({ browser }) => {
    test.setTimeout(60_000)
    // a) Route React publique.
    await withContext(browser, async (page) => {
      await page.goto('/panier')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre panier')
      await page.reload()
      expect(loc(page)).toMatchObject({ pathname: '/panier', search: '' })
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre panier')
    })

    // b) Route privée anonyme : le rechargement re-déclenche la garde.
    await withContext(browser, async (page) => {
      await page.goto('/mes-commandes')
      await expect(page).toHaveURL(/\/login\?next=/)
      await page.reload()
      await expect(page).toHaveURL(/\/login\?next=/)
      expect(nextParam(page)).toBe('/mes-commandes')
      await expect(page.locator('#aMail')).toBeVisible()
    })

    // c) Deep-link /commande avec panier local : le panier survit au F5.
    await withContext(
      browser,
      async (page) => {
        await page.goto('/commande')
        await expect(page).toHaveURL(/\/commande$/)
        await page.reload()
        await expect(page).toHaveURL(/\/commande$/)
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finaliser la commande')
      },
      { cart: true },
    )
  })

  test('/commande ouvert à froid avec panier vide redirige vers /panier (course du panier)', async ({ browser }) => {
    // Comportement ATTENDU et documenté dans CheckoutPage : arrivée directe sans
    // panier → `navigate('/panier', { replace: true })`. On le verrouille.
    await withContext(browser, async (page) => {
      await page.goto('/commande')
      await expect(page).toHaveURL(/\/panier$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre panier')
    })
  })

  test('deep-link /commande CONNECTÉ avec panier SERVEUR non vide → reste sur /commande', async ({ browser, request }) => {
    // Régression : le panier CONNECTÉ est chargé **en asynchrone** (`GET /api/cart`
    // dans CartProvider). Sans le garde `ready`, CheckoutPage voyait `items=[]` au
    // 1er rendu et redirigeait vers /panier alors que le panier n'était pas vide.
    const seeded = await seedApprovedProduct(request, { label: 'nav-checkout-auth' })
    await withContext(browser, async (page) => {
      // `registerSeller` partage le cookie-jar du contexte → la page est
      // connectée (rôle `user` par défaut, cf. 001_init.sql) : elle peut commander.
      await registerSeller(page, 'nav-checkout-auth')

      // Panier SERVEUR (≠ panier local) : c'est lui qui arrive en différé.
      const res = await page.request.post('/api/cart', {
        headers: await csrfHeaders(page.request),
        data: { productId: seeded.productId, qty: 1 },
      })
      expect(res.ok(), `ajout panier serveur → ${res.status()} ${await res.text()}`).toBe(true)

      // Deep-link À FROID.
      await page.goto('/commande')
      await expect(page).toHaveURL(/\/commande$/)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finaliser la commande')
    })
  })
})
