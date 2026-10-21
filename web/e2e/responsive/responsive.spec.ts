import { test, expect, type Page } from '@playwright/test'
import { closeSharedPage, openApp, seedPendingProduct, sharedPage } from '../lib/fixtures'
import { WIDTHS } from '../helpers/widths'

/**
 * Audits responsive + conformité DA.
 *
 * Les 5 largeurs du DA §9.9 (1440 / 1280 / 1024 / 768 / 390) sont parcourues
 * **dans** les tests via `setViewportSize`, et non en multipliant les projets
 * Playwright. Raison : `AuthContext` appelle `/api/auth/me` à chaque montage de
 * document. Une page rechargée + 5 redimensionnements prouve les 5 largeurs
 * pour 1 chargement — ce qu'un projet unique en 1440 ne prouvait pas (les
 * assertions « mobile » étaient systématiquement sautées).
 *
 * On mesure, on ne déclare pas :
 * · **débordement horizontal** — `scrollWidth ≤ clientWidth` (le symptôme n°1
 *   d'un layout cassé) ;
 * · **palette réelle** — les couleurs calculées des tokens, pas les classes ;
 * · **cibles tactiles** — WCAG 2.5.8 AA (24×24) sur tout contrôle interactif
 *   visible, 44×44 sur les CTA primaires (DA §8) ;
 * · **skip link + anneau de focus** au clavier (DA §8).
 *
 * ## Cible : la coquille React
 *
 * TOUTES les routes publiques sont rendues par la coquille React
 * (`SiteShell`), qui reproduit le chrome de `Bureau/main` : lien d'évitement
 * `#app` (`.skip`), `<main id="app">`. Il n'y a plus de second front vanilla à
 * recetter séparément (Option A — voir `public.spec.ts`).
 */

/** Tokens du DA §1.1, en RGB calculé. */
const TOKENS = {
  ivory: 'rgb(247, 243, 236)',
  ink: 'rgb(23, 21, 19)',
} as const

/**
 * Routes réellement montées dans `SiteShell` (App.tsx).
 * `/favoris` et `/mes-commandes` sont exclus : ils exigent une session et
 * redirigeraient vers `/login` — on mesurerait alors la page de connexion, ce
 * qui ne prouve rien sur la page visée.
 */
const PAGES_PUBLIQUES = ['/accueil-react', '/category', '/search?q=Portable', '/panier', '/category/mode']
const PAGES_ADMIN = ['/admin', '/admin/articles', '/admin/commandes', '/admin/categories', '/admin/historique']

/** Éléments interactifs visibles : le périmètre des cibles tactiles. */
const INTERACTIVE = 'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [role="button"]'

async function overflow(page: Page) {
  return page.evaluate(() => {
    const el = document.documentElement
    const guilty = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((n) => n.getBoundingClientRect().right > el.clientWidth + 1)
      .slice(0, 3)
      .map((n) => `${n.tagName.toLowerCase()}.${String(n.className).slice(0, 50)}`)
    return { scroll: Math.max(el.scrollWidth, document.body.scrollWidth), client: el.clientWidth, guilty }
  })
}

test.describe('responsive — pages publiques React', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await sharedPage(browser)
  })
  test.afterAll(async () => closeSharedPage(page))

  test('aucune page publique ne déborde, aux 5 largeurs du DA', async () => {
    await openApp(page, PAGES_PUBLIQUES[0])
    for (const { width, label } of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      for (const [i, path] of PAGES_PUBLIQUES.entries()) {
        if (i > 0) await openApp(page, path)
        const { scroll, client, guilty } = await overflow(page)
        expect(
          scroll,
          `${path} déborde de ${scroll - client}px à ${width}px [${label}] — ` +
            `en cause : ${guilty.join(' | ') || 'non identifié'}`,
        ).toBeLessThanOrEqual(client + 1)
      }
    }
  })

  test('accueil React : fond ivoire, CTA primaire sur aplat accent', async () => {
    await openApp(page, '/accueil-react')
    await expect(page.locator('body')).toHaveCSS('background-color', TOKENS.ivory)
    const cta = page.getByRole('link', { name: /voir|catalogue|découvrir/i }).first()
    if (await cta.count()) {
      const { bg, expected } = await cta.evaluate((el) => {
        // Le token d'accent courant vit sur `.market-site` (bordeaux « White &
        // Burgundy ») : on lit sa valeur calculée via une sonde dans le même
        // contexte CSS, pour ne pas figer une couleur en dur dans le test.
        const probe = document.createElement('span')
        probe.style.backgroundColor = 'var(--color-terracotta-strong)'
        el.appendChild(probe)
        const expected = getComputedStyle(probe).backgroundColor
        probe.remove()
        return { bg: getComputedStyle(el).backgroundColor, expected }
      })
      // Un CTA « à plat » (fond transparent) reste acceptable : on n'impose
      // l'aplat que s'il en porte réellement un.
      if (bg !== 'rgba(0, 0, 0, 0)') expect(bg).toBe(expected)
    }
  })

  test('skip link + <main id="app"> (DA §8)', async () => {
    await openApp(page, '/accueil-react')
    const skip = page.locator('a.skip[href="#app"]')
    await expect(skip).toHaveCount(1)
    await expect(page.locator('main#app')).toHaveCount(1)
    await page.keyboard.press('Tab')
    await expect(skip).toBeFocused()
  })

  test('le focus clavier est visible (anneau, DA §8)', async () => {
    await openApp(page, '/accueil-react')
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus-visible').first()
    await expect(focused).toBeVisible()
    const shadow = await focused.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shadow, 'un focus sans anneau est un échec d’accessibilité').not.toBe('none')
  })
})

test.describe('responsive — admin', () => {
  let page: Page

  test.beforeAll(async ({ browser, request }) => {
    // Autonomie de la spec : le `globalSetup` purge les PENDING résiduels, et
    // cette spec peut tourner AVANT ou APRÈS `functional/admin.spec.ts`
    // (`workers: 2`, ordre de fichiers non contractuel). S' reposer sur l'état
    // laissé par une autre spéc faisait sauter silencieusement le test
    // « une action de ligne n'ouvre qu'une modale » — un test sauté n'est pas
    // un test vert. On sème donc notre propre article à modérer.
    await seedPendingProduct(request, { label: 'e2e-responsive' })
    page = await sharedPage(browser, { admin: true })
  })
  test.afterAll(async () => closeSharedPage(page))

  test('aucun écran admin ne déborde, aux 5 largeurs du DA', async () => {
    await openApp(page, PAGES_ADMIN[0])
    for (const { width, label } of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      for (const [i, path] of PAGES_ADMIN.entries()) {
        if (i > 0) await openApp(page, path)
        const { scroll, client, guilty } = await overflow(page)
        expect(
          scroll,
          `${path} déborde de ${scroll - client}px à ${width}px [${label}] — ` +
            `en cause : ${guilty.join(' | ') || 'non identifié'}`,
        ).toBeLessThanOrEqual(client + 1)
      }
    }
  })

  test('sidebar Charcoal sur desktop, tiroir sous 968 px', async () => {
    await openApp(page, '/admin')
    const sidebar = page.getByRole('navigation', { name: 'Menu administrateur' }).first()

    // Desktop : rail visible, fond Charcoal (#171513).
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(sidebar).toBeVisible()
    await expect(sidebar.locator('xpath=ancestor::aside')).toHaveCSS('background-color', TOKENS.ink)

    // Sous 968 px : rail masqué, bouton « Ouvrir le menu » + tiroir.
    await page.setViewportSize({ width: 768, height: 1024 })
    const burger = page.getByRole('button', { name: 'Ouvrir le menu' })
    await expect(burger).toBeVisible()
    // `aria-expanded` est un attribut HTML (chaîne) : `toHaveJSProperty` compare
    // à un booléen et échoue toujours. On asserte l'attribut, sa valeur réelle.
    await expect(burger).toHaveAttribute('aria-expanded', 'false')
    await burger.click()
    const drawer = page.getByRole('dialog', { name: 'Menu administrateur' })
    await expect(drawer).toBeVisible()
    await expect(burger).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
  })

  test('tableau admin : 6 colonnes + fiche accessible au clavier', async () => {
    await openApp(page, '/admin/articles')
    const table = page.getByRole('table')
    if ((await table.count()) === 0) test.skip(true, 'aucun article seedé')
    await expect(table).toBeVisible()
    // Contrat spec-admin §4.3 : Article · Vendeur · Prix · Statut · Date · Actions.
    await expect(table.getByRole('columnheader')).toHaveCount(6)
    // Il n'existe pas de route de détail `/admin/articles/:id` : la fiche
    // s'ouvre en panneau. Le chemin clavier est un **vrai bouton** (jamais la
    // seule ligne cliquable, qui n'est pas focusable).
    const firstRow = table.locator('tbody tr').first()
    await firstRow.getByRole('button', { name: /^Voir l’article/ }).click()
    await expect(page.getByRole('dialog')).toHaveCount(1)
  })

  test('une action de ligne n’ouvre qu’une modale (non-régression)', async () => {
    await openApp(page, '/admin/articles-en-attente')
    const firstRow = page.getByRole('row').nth(1)
    test.skip((await firstRow.count()) === 0, 'aucun article en attente')
    await firstRow.getByRole('button').first().click()
    // Avant correction, le clic remontait aussi au <tr> et empilait fiche +
    // confirmation. Une seule modale attendue.
    await expect(page.getByRole('dialog')).toHaveCount(1)
  })
})

test.describe('cibles tactiles', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await sharedPage(browser)
  })
  test.afterAll(async () => closeSharedPage(page))

  // `/` et `/accueil-react` passent tous deux par `SiteShell` : mêmes
  // contrôles, mêmes cibles à mesurer.
  const ROUTES = ['/', '/accueil-react']

  test('WCAG 2.5.8 : ≥ 24×24 sur les contrôles visibles, aux 5 largeurs', async () => {
    for (const route of ROUTES) {
      await openApp(page, route)
      for (const { width, label } of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        const tooSmall = await page.evaluate((sel) => {
          const out: { label: string; w: number; h: number }[] = []
          for (const el of Array.from(document.querySelectorAll(sel))) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) continue
            const style = getComputedStyle(el)
            if (style.visibility === 'hidden' || style.display === 'none') continue
            // WCAG 2.5.8 exclut les liens de texte inline.
            if (el.tagName === 'A' && style.display.includes('inline')) continue
            if (r.width < 24 || r.height < 24) {
              out.push({
                label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
                w: Math.round(r.width),
                h: Math.round(r.height),
              })
            }
          }
          return out
        }, INTERACTIVE)
        expect(
          tooSmall,
          `contrôles sous 24px sur ${route} à ${width}px [${label}] : ${JSON.stringify(tooSmall)}`,
        ).toEqual([])
      }
    }
  })

  test('CTA primaires ≥ 44 px de haut au mobile (DA §8)', async () => {
    // Le DA compense les boutons `size="sm"` (36 px) par `max-md:min-h-[44px]` :
    // la contrainte 44 px est une règle **mobile** (`max-md` = < 768 px). À 768 px
    // exactement, la variante `sm` reste à 36 px par design — on n'y applique
    // donc pas la règle (sinon on testerait un point de rupture, pas la règle).
    // Périmètre : le CTA primaire réel = l'aplat accent (`bg-terracotta-strong`).
    // Les badges `bg-positive` et les liens de bottom nav ne sont pas des CTA.
    await openApp(page, '/accueil-react')
    for (const { width, height } of WIDTHS.filter((w) => w.width < 768)) {
      await page.setViewportSize({ width, height })
      const small = await page.evaluate(() => {
        const out: { label: string; h: number }[] = []
        for (const el of Array.from(document.querySelectorAll('.bg-terracotta-strong'))) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue
          if (r.height < 44) {
            out.push({ label: (el.textContent || el.tagName).trim().slice(0, 40), h: Math.round(r.height) })
          }
        }
        return out
      })
      expect(small, `CTA sous 44px à ${width}px : ${JSON.stringify(small)}`).toEqual([])
    }
  })
})
