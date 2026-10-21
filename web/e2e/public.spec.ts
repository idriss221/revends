import { expect, test, type Page } from '@playwright/test'
import { adminCookie } from './helpers/auth'
import { spaGoto } from './helpers/navigation'
import { closeSharedPage, openApp, sharedPage } from './lib/fixtures'
import { BASE } from './helpers/target'
import { WIDTHS } from './helpers/widths'

/**
 * Recette DA §9.3 (d)-(f) + CA-V5-038 sur le **front public**.
 *
 * (d) `documentElement.scrollWidth === clientWidth` est le contrôle qui prime :
 * une page qui déborde horizontalement est un défaut bloquant sur mobile. Il
 * est mesuré sur **les 5 largeurs du DA** pour chaque route publique, sans
 * données à préparer — donc stable et reproductible.
 *
 * ## Une seule coquille publique (Option A)
 *
 * La maquette `Bureau/main` **n'est plus servie depuis ce projet** : ses vues
 * ont été reproduites dans React (`SiteShell` + `Navbar`/`Footer`), ce qui
 * supprime le second front et ses assertions parallèles. Le chrome React
 * reprend donc les identifiants de la maquette : lien d'évitement `#app`
 * (`.skip`), champ `input#q`, `<main id="app">`.
 *
 * Contrainte historique (voir `lib/fixtures.ts`) : `/api/auth` était plafonné à
 * 20 appels / 10 min. La suite e2e vise désormais l'instance dédiée `api-e2e`
 * (4002, sans plafond), mais on conserve le partage d'une page par `describe`
 * (plus rapide) et l'isolation là où l'état partagé fausserait la mesure.
 */

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:4002'

/** Routes montées dans la coquille React (`SiteShell`). */
const REACT_ROUTES = [
  { path: '/accueil-react', name: 'accueil-react' },
  { path: '/category', name: 'categories' },
  { path: '/search?q=el', name: 'recherche' },
  { path: '/category/mode', name: 'categorie' },
  { path: '/catalogue/pc-portable', name: 'fiche-produit' },
  { path: '/panier', name: 'panier' },
  { path: '/conditions', name: 'conditions' },
  { path: '/confidentialite', name: 'confidentialite' },
  { path: '/route-inexistante', name: '404' },
]

/** Attend la fin des requêtes principales (évite de mesurer un squelette). */
async function settled(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined)
}

/** Mesure le débordement et nomme les éléments fautifs (accélère le correctif). */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const el = document.documentElement
    const guilty = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((n) => n.getBoundingClientRect().right > el.clientWidth + 1)
      .slice(0, 3)
      .map((n) => `${n.tagName.toLowerCase()}.${String(n.className).slice(0, 60)}`)
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflowing: guilty }
  })
}

test.describe('DA §9.3 (d) — débordement horizontal (coquille React)', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await sharedPage(browser)
  })
  test.afterAll(async () => closeSharedPage(page))

  test('les routes React tiennent aux 5 largeurs du DA', async () => {
    await openApp(page, REACT_ROUTES[0].path)
    for (const { width, label } of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      for (const [i, route] of REACT_ROUTES.entries()) {
        if (i > 0) await spaGoto(page, route.path)
        await settled(page)
        const { scrollWidth, clientWidth, overflowing } = await overflow(page)
        expect(
          scrollWidth,
          `débordement sur ${route.name} (${route.path}) à ${width}px [${label}] — ` +
            `éléments en cause : ${overflowing.join(' | ') || 'aucun identifié'}`,
        ).toBeLessThanOrEqual(clientWidth)
      }
    }
  })
})



test.describe('DA §3.9 — coquille React (SiteShell)', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await sharedPage(browser)
  })
  test.afterAll(async () => closeSharedPage(page))

  test('navbar, footer et lien d’évitement sur chaque route', async () => {
    await openApp(page, REACT_ROUTES[0].path)
    for (const [i, route] of REACT_ROUTES.entries()) {
      if (i > 0) await spaGoto(page, route.path)
      await settled(page)
      await expect(page.getByRole('banner'), `${route.path} : navbar absente`).toBeVisible()
      await expect(page.getByRole('contentinfo'), `${route.path} : footer absent`).toBeVisible()
      await expect(
        page.getByRole('link', { name: /contenu principal/i }),
        `${route.path} : lien d’évitement absent`,
      ).toHaveCount(1)
    }
  })

  test('le lien d’évitement est focalisable et pointe vers #app', async () => {
    await openApp(page, '/accueil-react')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: /contenu principal/i })
    await expect(skip).toBeFocused()
    expect(await skip.getAttribute('href')).toBe('#app')
    await expect(page.locator('#app')).toHaveCount(1)
  })

  test('le focus clavier dessine un anneau visible (pas outline:none)', async () => {
    await openApp(page, '/accueil-react')
    const decorated = await page.evaluate(() => {
      const link = document.querySelector<HTMLElement>('a[href], button')
      if (!link) return false
      link.focus()
      const s = getComputedStyle(link)
      return s.boxShadow !== 'none' || (s.outlineStyle !== 'none' && s.outlineWidth !== '0px')
    })
    expect(decorated, 'aucun anneau de focus calculé sur le premier lien').toBe(true)
  })
})
test.describe('Suggestions — DA §3.6 / contrat api.md §3.2 (coquille React)', () => {
  const search = (page: Page) => page.getByRole('combobox', { name: 'Rechercher' })
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await sharedPage(browser)
  })
  test.afterAll(async () => closeSharedPage(page))

  test('« el » : catégories plafonnées à 2, plafond global respecté', async () => {
    await openApp(page, '/accueil-react')
    await search(page).fill('el')
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 15_000 })
    // Contrat api.md §3.2 : `categories` est plafonné à 2. Les options sont
    // étiquetées « <Nom> Catégorie » — on scope dessus (l'ancien test comptait
    // TOUTES les options et attendait 2 : faux dès que des produits remontaient).
    await expect(
      page.getByRole('option', { name: /Catégorie$/ }),
      'plafond de 2 catégories non respecté',
    ).toHaveCount(2)
    // Plafond global : 6 produits + 2 catégories + 2 marques = 10.
    const count = await page.getByRole('option').count()
    expect(count, 'plus de suggestions que le contrat n’en autorise').toBeLessThanOrEqual(10)
  })

  test('le clavier navigue les suggestions (flèche + Entrée)', async () => {
    await openApp(page, '/accueil-react')
    // Terme réellement présent au catalogue (« el » remonte produits + catégories) :
    // « Portable » n'existe pas dans le jeu de données et ne prouvait donc rien.
    await search(page).fill('el')
    await expect(page.getByRole('option').first()).toBeVisible({ timeout: 15_000 })
    await search(page).press('ArrowDown')
    const active = await page.evaluate(() => document.activeElement?.getAttribute('aria-activedescendant'))
    expect(active, 'aria-activedescendant non positionné après ArrowDown').toBeTruthy()
    await search(page).press('Enter')
    await expect(page).not.toHaveURL(/\?q=el$/)
  })
})

test.describe('États — DA §3.12 / RG-V5-08', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await sharedPage(browser)
  })
  test.afterAll(async () => closeSharedPage(page))

  test('recherche sans résultat → EmptyState', async () => {
    await openApp(page, '/search?q=zzzzqqqxx')
    await expect(page.locator('main').getByText(/Aucun article ne correspond/i)).toBeVisible()
  })

  test('erreur 500 → alerte + bouton « Réessayer »', async ({ browser }) => {
    // Page **isolée** : le `QueryClient` est monté par document et
    // `staleTime = 15 s` — sur une page partagée, `['categories']` a déjà été
    // mise en cache par un test précédent, donc aucune requête n'est refaite et
    // l'état d'erreur ne s'affiche jamais (faux négatif). Un contexte neuf
    // garantit un cache vide → la route 500 est réellement sollicitée.
    const context = await browser.newContext({ baseURL: BASE, locale: 'fr-FR' })
    const fresh = await context.newPage()
    try {
      await fresh.route('**/api/categories', (route) => route.fulfill({ status: 500, body: '{}' }))
      await fresh.goto('/category')
      await fresh.locator('[role="alert"]').first().waitFor({ state: 'visible', timeout: 15_000 })
      await expect(fresh.getByRole('button', { name: /réessayer/i }).first()).toBeVisible()
    } finally {
      await context.close()
    }
  })
})

test.describe('RBAC — CA-AUTH04-05', () => {
  // Les 3 scénarios anonymes partagent **une** page : hors session, le
  // contexte est jetable. La session admin vient du global setup (aucun login
  // par test), donc plus de saturation du plafond `/api/auth`.
  let guest: Page
  let adminPage: Page

  test.beforeAll(async ({ browser }) => {
    guest = await sharedPage(browser)
    adminPage = await sharedPage(browser, { admin: true })
  })
  test.afterAll(async () => {
    await closeSharedPage(guest)
    await closeSharedPage(adminPage)
  })

  test('un anonyme est renvoyé vers /login en gardant la destination', async () => {
    await openApp(guest, '/mes-commandes')
    await expect(guest).toHaveURL(/\/login\?next=/)
    expect(guest.url()).toContain(encodeURIComponent('/mes-commandes'))
  })

  test('un anonyme n’atteint pas /admin', async () => {
    await spaGoto(guest, '/admin')
    await expect(guest).toHaveURL(/\/login\?next=/)
    expect(guest.url()).toContain(encodeURIComponent('/admin'))
  })

  test('un admin connecté accède à /admin et n’a plus de lien « Se connecter »', async () => {
    const cookie = adminCookie()
    test.skip(!cookie, 'session admin absente (identifiants non configurés) — test sauté')
    await openApp(adminPage, '/admin')
    await expect(adminPage).toHaveURL(/\/admin$/, { timeout: 20_000 })
    await expect(adminPage.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
    await expect(adminPage.getByRole('link', { name: /connexion/i })).toHaveCount(0)
  })

  test('le rôle admin est confirmé par le serveur', async () => {
    const cookie = adminCookie()
    test.skip(!cookie, 'session admin absente — test sauté')
    // `page.request` porte le même cookie que la page : pas d'appel `/auth`
    // supplémentaire par rapport à celui déjà consommé par `openApp`.
    const res = await adminPage.request.get(`${BACKEND}/api/auth/me`)
    expect(res.status()).toBe(200)
    expect((await res.json()).user.role).toBe('admin')
  })
})
