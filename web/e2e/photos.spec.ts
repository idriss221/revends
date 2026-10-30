import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { openApp } from './lib/fixtures'
import { loaded } from './lib/images'

/**
 * Version des photos, lue depuis la source (`PHOTO_VERSION` dans
 * `src/lib/catalogPhotos.ts`).
 *
 * Pourquoi pas un simple `import` : ce module lit `import.meta.env`
 * (résolu par Vite, absent sous Node) → l'import direct casse à la
 * collecte Playwright. Et pourquoi pas une date en dur : le test doit
 * survivre à une rotation de photos — c'est tout son intérêt.
 */
const PHOTO_VERSION = (() => {
  const src = readFileSync(
    fileURLToPath(new URL('../src/lib/catalogPhotos.ts', import.meta.url)),
    'utf8',
  )
  const m = src.match(/export const PHOTO_VERSION = '([^']+)'/)
  if (!m) throw new Error('PHOTO_VERSION introuvable dans src/lib/catalogPhotos.ts')
  return m[1] as string
})()

/**
 * Fidélité photo à `Bureau/main` (`fidelite-maquette`).
 *
 * Recette des 3 visuels signalés lors de la passe de recette + du bloc
 * éditorial, tels que définis dans `assets/data.js` de la référence :
 *  - `RV.SCENE.hero`      → héros de l'accueil   (`/categories/hero.jpg`) ;
 *  - `RV.SCENE.auth`      → `aside.art` connexion(`/categories/auth.jpg`) ;
 *  - `RV.CAT_IMG`         → tuiles de catégories (Unsplash, hébergées) ;
 *  - `RV.SCENE.editorial` → bloc `.editorial`    (`/categories/editorial.jpg`).
 *
 * Double assertion, volontairement :
 *  1. le `<img>` **existe** — sinon `SiteImage` l'a remplacé par l'illustration
 *     SVG de secours (`art()`), ce qui signifierait « photo perdue » ;
 *  2. `naturalWidth > 0` — l'image est réellement décodée (un `src` correct
 *     qui 404 laisse `naturalWidth = 0`).
 *
 * Les tuiles sont `loading="lazy"` : on scrolle vers elles AVANT de mesurer.
 * L'helper `loaded` (existence + décodage) vit dans `lib/images.ts`.
 *
 * Les URLs portent `?v=<date>` (`PHOTO_VERSION` dans
 * `src/lib/catalogPhotos.ts`) : ces mêmes chemins existaient sous l'ancienne
 * interface avec d'autres contenus et nginx les sert `immutable` 1 an —
 * sans version, le navigateur garderait l'ancienne photo.
 */

test.describe('Photos de la maquette — hébergement local', () => {
  test("accueil : héros = RV.SCENE.hero, chargé", async ({ page }) => {
    await openApp(page, '/')
    const hero = page.locator('.masthead .mh-img')
    await expect(hero).toBeVisible()
    await loaded(hero, 'héros accueil')
    expect(await hero.getAttribute('src')).toBe(`/categories/hero.jpg?v=${PHOTO_VERSION}`)
  })

  test('accueil : catégories TEXTUELLES (rail), aucun visuel requis', async ({ page }) => {
    await openApp(page, '/')
    const rail = page.locator('.catrail')
    await expect(rail, 'rail de catégories absent').toBeVisible()

    const links = page.locator('.catrail .catlink')
    const count = await links.count()
    expect(count, 'au moins 3 catégories attendues').toBeGreaterThanOrEqual(3)

    // Navigation légère : chaque entrée est un lien réel vers une catégorie…
    const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
    for (const href of hrefs) expect(href).toMatch(/^\/category\/[a-z0-9-]+$/)

    // …et AUCUNE image de catégorie n'est rendue en accueil (exigence design).
    await expect(page.locator('.catrail img, .catgrid')).toHaveCount(0)

    // Le rail ne doit jamais provoquer de défilement horizontal de la page.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)
  })

  test('accueil : bloc « Vendre » = bannière éditoriale, chargée', async ({ page }) => {
    await openApp(page, '/')
    const pic = page.locator('.editorial.sell-cta .pic img')
    await expect(pic).toHaveCount(1)
    await pic.scrollIntoViewIfNeeded()
    await loaded(pic, 'bloc « Vendre »')
    expect(await pic.getAttribute('src')).toBe('/categories/bottom-banner.jpg?v=2026-10-22')
  })

  test('connexion : aside.art = RV.SCENE.auth, chargé', async ({ page }) => {
    await openApp(page, '/login')
    const art = page.locator('.art-media img')
    await expect(art, 'visuel de la page connexion absent').toHaveCount(1)
    await loaded(art, 'art connexion')
    expect(await art.getAttribute('src')).toBe(`/categories/auth.jpg?v=${PHOTO_VERSION}`)
  })
})
