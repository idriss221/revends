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

  test('accueil : tuiles de catégories = photos locales, toutes chargées', async ({ page }) => {
    await openApp(page, '/')
    const grid = page.locator('.catgrid')
    await expect(grid, 'section Catégories absente').toBeVisible()
    await grid.scrollIntoViewIfNeeded()

    const tiles = page.locator('.catgrid .cat img')
    const count = await tiles.count()
    expect(count, 'au moins 3 tuiles de catégories attendues').toBeGreaterThanOrEqual(3)
    for (let i = 0; i < count; i++) await loaded(tiles.nth(i), `tuile ${i + 1}/${count}`)

    // Aucune photo de tuile ne doit fuir vers une origine externe.
    const srcs = await tiles.evaluateAll((els) =>
      els.map((el) => (el as HTMLImageElement).getAttribute('src') ?? ''),
    )
    for (const src of srcs) expect(src).toMatch(/^\/categories\/[a-z0-9-]+\.jpg\?v=\d{4}-\d{2}-\d{2}$/)
  })

  test('accueil : bloc éditorial = RV.SCENE.editorial, chargé', async ({ page }) => {
    await openApp(page, '/')
    const pic = page.locator('.editorial .pic img')
    await expect(pic).toHaveCount(1)
    await pic.scrollIntoViewIfNeeded()
    await loaded(pic, 'bloc éditorial')
    expect(await pic.getAttribute('src')).toBe(`/categories/editorial.jpg?v=${PHOTO_VERSION}`)
  })

  test('connexion : aside.art = RV.SCENE.auth, chargé', async ({ page }) => {
    await openApp(page, '/login')
    const art = page.locator('.art-media img')
    await expect(art, 'visuel de la page connexion absent').toHaveCount(1)
    await loaded(art, 'art connexion')
    expect(await art.getAttribute('src')).toBe(`/categories/auth.jpg?v=${PHOTO_VERSION}`)
  })
})
