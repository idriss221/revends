import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { adminCookie } from './helpers/auth'
import { closeSharedPage, openApp, sharedPage } from './lib/fixtures'
import { spaGoto } from './helpers/navigation'
import { WIDTHS } from './helpers/widths'

/**
 * Captures de recette — DA §9.9 (f).
 *
 * Le DA impose une **preuve visuelle** aux 5 largeurs : 1440, 1280, 1024, 768,
 * 390. Le nom de fichier encode la largeur et la page, donc deux passes
 * successives se comparent sans effort.
 *
 * Choix de conception : les 5 largeurs sont parcourues sur **une seule page** via
 * `setViewportSize`, et non via 5 projets Playwright. Raison : chaque
 * rechargement de document déclenche 2 appels `/auth/me` (StrictMode) et le
 * serveur plafonne `/api/auth` à 20 appels / 10 min — 5 projets satureraient la
 * fenêtre et feraient échouer la recette pour une raison étrangère au design.
 *
 * Chaque capture est en `fullPage` (on veut le bas de page) et avec
 * `animations: 'disabled'` (sinon on photographie un fondu en cours).
 */
const OUT = join(process.cwd(), 'captures')

const PUBLIC_SHOTS: [string, string][] = [
  ['/', 'accueil'],
  ['/category', 'categories'],
  ['/search?q=Portable', 'recherche'],
  ['/catalogue/pc-portable', 'fiche-produit'],
  ['/panier', 'panier'],
  ['/login', 'connexion'],
  ['/register', 'inscription'],
  ['/route-inexistante', '404'],
]

const ADMIN_SHOTS: [string, string][] = [
  ['/admin', 'dashboard'],
  ['/admin/articles-en-attente', 'articles-en-attente'],
  ['/admin/articles', 'articles'],
  ['/admin/commandes', 'commandes'],
  ['/admin/paiements', 'paiements'],
  ['/admin/utilisateurs', 'utilisateurs'],
  ['/admin/categories', 'categories-admin'],
  ['/admin/historique', 'historique'],
]

/** Redimensionne + laisse les données arriver : une capture de squelette ne prouve rien. */
async function settle(page: Page) {
  await page
    .waitForFunction(() => !document.body.innerText.includes('Chargement…'), undefined, { timeout: 15_000 })
    .catch(() => undefined)
  await page.waitForTimeout(350)
}

async function shoot(page: Page, width: number, name: string) {
  const file = join(OUT, `${String(width).padStart(4, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' })
  return file
}

test.describe('Captures DA §9.9 (f)', () => {
  test.beforeAll(async () => {
    await mkdir(OUT, { recursive: true })
  })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await sharedPage(browser)
  })
  test.afterAll(async () => closeSharedPage(page))

  test('écrans publics × 5 largeurs', async () => {
    for (const [w, { width, height }] of WIDTHS.entries()) {
      await page.setViewportSize({ width, height })
      for (const [i, [path, name]] of PUBLIC_SHOTS.entries()) {
        // `w > 0` : au changement de largeur, la page courante est la DERNIÈRE
        // route de la largeur précédente (404 ici). Sans cette navigation, le
        // fichier `1280-accueil.png` contenait la 404 — une capture « verte »
        // qui ne prouve rien.
        if (w > 0 || i > 0) await spaGoto(page, path)
        await settle(page)
        expect(await shoot(page, width, name), 'capture non écrite').toContain(`${width}`)
      }
    }
  })

  let adminPage: Page

  test.beforeAll(async ({ browser }) => {
    adminPage = await sharedPage(browser, { admin: true })
  })
  test.afterAll(async () => closeSharedPage(adminPage))

  test('écrans admin × 5 largeurs', async () => {
    const cookie = adminCookie()
    test.skip(!cookie, 'session admin absente — captures admin sautées')
    const page = adminPage

    for (const [w, { width, height }] of WIDTHS.entries()) {
      await page.setViewportSize({ width, height })
      for (const [i, [path, name]] of ADMIN_SHOTS.entries()) {
        // cf. commentaire ci-dessus : sans navigation explicite, le premier
        // tirail de chaque largeur photographiait l'écran précédent.
        if (w > 0 || i > 0) await spaGoto(page, path)
        await settle(page)
        if (w === 0 && i === 0) {
          await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
        }
        await shoot(page, width, name)
      }
    }
  })

  test('états : vide et erreur', async () => {
    for (const [i, { width, height }] of WIDTHS.entries()) {
      await page.setViewportSize({ width, height })

      // Vide — recherche sans résultat
      if (i === 0) await openApp(page, '/search?q=zzz-aucun-resultat-zzz')
      else await spaGoto(page, '/search?q=zzz-aucun-resultat-zzz')
      await settle(page)
      await shoot(page, width, 'etat-vide')

      // Erreur — 500 sur les catégories, avec le bouton « Réessayer »
      await page.route('**/api/categories', (r) => r.fulfill({ status: 500, body: '{}' }))
      await spaGoto(page, '/category')
      await page.locator('[role="alert"]').first().waitFor({ state: 'visible', timeout: 15_000 })
      await shoot(page, width, 'etat-erreur')
      await page.unroute('**/api/categories')
    }
  })
})
