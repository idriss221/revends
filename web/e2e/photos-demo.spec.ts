import { expect, test } from '@playwright/test'
import { openApp } from './lib/fixtures'
import { loaded } from './lib/images'

/**
 * Catalogue démo × photos de la maquette — recette de la passe
 * « toutes les photos de Bureau/main à leur place ».
 *
 * Le seed `server/scripts/seed-data/011_seed_demo_catalog.sql` mappe chaque
 * article démo sur un visuel `RV.PRODUCTS` hébergé dans
 * `web/public/catalog/` (0 photo distante). Ces articles n'existent que
 * dans les bases seedées (dev / prod-like) — PAS dans la base e2e remise à
 * zéro à chaque run. D'où le garde `E2E_DEMO_CATALOG=1`.
 *
 * Recette manuelle (contre nginx 8080, qui proxifie l'API seedée) :
 *   E2E_DEMO_CATALOG=1 E2E_BASE_URL=http://127.0.0.1:8080 \
 *     npx playwright test photos-demo
 */
const demo = process.env.E2E_DEMO_CATALOG === '1'

test.describe('Catalogue démo — photos locales de la maquette', () => {
  test.skip(
    !demo,
    'base sans catalogue démo : lancer avec E2E_DEMO_CATALOG=1 (ex. E2E_BASE_URL=http://127.0.0.1:8080)',
  )

  test('fiche manteau-laine-camel : galerie = photos manteau de la maquette', async ({ page }) => {
    await openApp(page, '/catalogue/manteau-laine-camel')

    const main = page.locator('main img[src^="/catalog/"]').first()
    await loaded(main, 'photo principale')
    expect(await main.getAttribute('src')).toBe('/catalog/manteau-long-en-laine-1.jpg')

    // 2ᵉ photo (survol/galerie) : vignette cliquable → bascule de la photo.
    const thumbs = page.locator('.thumbs img[src^="/catalog/"]')
    await expect(thumbs).toHaveCount(2)
    await thumbs.nth(1).click()
    await expect(page.locator('main img[src="/catalog/manteau-long-en-laine-2.jpg"]')).toBeVisible()

    // Aucune image de la page ne doit fuir vers une origine externe.
    const externals = await page
      .locator('img')
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute('src') ?? '').filter((s) => /^(https?:)?\/\//i.test(s)),
      )
    expect(externals).toEqual([])
  })

  test('fiche jeu-societe-strategy : visuel « Lot de romans » de la maquette', async ({ page }) => {
    await openApp(page, '/catalogue/jeu-societe-strategy')
    const main = page.locator('main img[src^="/catalog/"]').first()
    await loaded(main, 'photo principale (jeu de société)')
    expect(await main.getAttribute('src')).toBe('/catalog/lot-de-romans-1.jpg')
  })
})
