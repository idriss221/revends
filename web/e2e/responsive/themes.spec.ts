import { test, expect, type Page } from '@playwright/test'
import { closeSharedPage, sharedPage } from '../lib/fixtures'

/**
 * Audit des THÈMES (clair / sombre) — public + admin, réellement mesuré.
 *
 * Ce que ce spec prouve, et comment :
 *  1. **Le thème est appliqué** — `data-theme` sur `<html>` ET couleur de fond
 *     recalculée différente entre clair et sombre (une simple classe ne suffit
 *     pas : on lit `getComputedStyle`).
 *  2. **Il persiste** — `localStorage["rv:theme"]` survit à un rechargement.
 *  3. **Aucune régression de mise en page** — pas de débordement horizontal ni
 *     d'image cassée, à 390 px et 1440 px, dans les deux thèmes.
 *  4. **L'admin est explicitement hors thème** — `docs/design-system.md:9` :
 *     `.market-admin` n'est pas re-skinné, il garde ses tokens « REVENDS 2026 ».
 *     On ne suppose donc pas un thème sombre admin : on **vérifie l'invariant**
 *     (rendu identique sous les deux valeurs de `data-theme`). Si un jour
 *     l'admin devient thématisé, ce test échouera et forcera une décision.
 *
 * ⚠️ Une **vraie navigation** (`page.goto`) est nécessaire entre deux thèmes :
 * `openApp()` navigue ensuite par le routeur (0 rechargement), donc
 * `ThemeContext` n'est pas remonté et `data-theme` resterait celui du test
 * précédent. C'est ce qui faisait échouer la première version de ce spec.
 */

const THEMES = ['light', 'dark'] as const
type Theme = (typeof THEMES)[number]

const PUBLIC_ROUTES = ['/', '/category', '/search?q=Porte', '/panier', '/login', '/vendre']

/**
 * Charge `path` dans le thème demandé.
 *
 * `addInitScript` s'exécute **avant** le script de l'app dans chaque nouveau
 * document : le thème est donc déjà en `localStorage` quand `ThemeProvider`
 * lit sa valeur initiale — exactement le parcours d'un visiteur qui revient.
 */
async function openWithTheme(page: Page, theme: Theme, path: string) {
  await page.addInitScript((t) => window.localStorage.setItem('rv:theme', t), theme)
  await page.goto(path)
  await page.waitForLoadState('domcontentloaded')
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const clippe = (n: HTMLElement) => {
      for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if (['auto', 'scroll', 'hidden', 'clip'].includes(ox)) return true
      }
      return false
    }
    const guilty = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((n) => n.getBoundingClientRect().right > root.clientWidth + 1 && !clippe(n))
      .slice(0, 3)
      .map((n) => `${n.tagName.toLowerCase()}.${String(n.className).slice(0, 60)}`)
    const imgs = [...document.images].filter((i) => i.getAttribute('src'))
    // ⚠ Le thème sombre ne repeint PAS `<body>` : il surcharge les jetons de
    // `.market-site` (index.css §« PUBLIC · DARK »). Mesurer `body` ne prouve
    // donc rien — on lit la surface réelle du shell public.
    const site = document.querySelector<HTMLElement>('.market-site')
    const siteStyle = site ? getComputedStyle(site) : null
    return {
      theme: root.getAttribute('data-theme'),
      stored: window.localStorage.getItem('rv:theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      siteBg: siteStyle?.backgroundColor ?? null,
      siteIvory: siteStyle?.getPropertyValue('--color-ivory').trim() ?? null,
      scroll: Math.max(root.scrollWidth, document.body.scrollWidth),
      client: root.clientWidth,
      guilty,
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
    }
  })
}

test.describe('thèmes — public', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await sharedPage(browser)
  })
  test.afterAll(async () => {
    await closeSharedPage(page)
  })

  test('clair et sombre : appliqués, persistants, sans débordement ni image cassée', async () => {
    const backgrounds: Record<string, string> = {}

    for (const theme of THEMES) {
      for (const width of [390, 1440]) {
        for (const route of PUBLIC_ROUTES) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
          await openWithTheme(page, theme, route)
          const r = await measure(page)

          expect(r.theme, `${route} @${width}px — data-theme`).toBe(theme)
          expect(r.stored, `${route} @${width}px — persistance localStorage`).toBe(theme)
          expect(r.scroll, `${route} @${width}px déborde : ${r.guilty.join(', ')}`).toBeLessThanOrEqual(r.client + 1)
          expect(r.broken, `${route} @${width}px images cassées`).toEqual([])
          backgrounds[`${theme}:${width}`] ??= `${r.siteBg}|${r.siteIvory}`
        }
      }
    }

    // Le thème change VRAIMENT les couleurs : sinon `data-theme` n'est qu'un
    // attribut décoratif (le défaut le plus fréquent).
    expect(backgrounds['dark:390'], 'le thème sombre ne change pas le fond mobile').not.toBe(backgrounds['light:390'])
    expect(backgrounds['dark:1440'], 'le thème sombre ne change pas le fond desktop').not.toBe(
      backgrounds['light:1440'],
    )
  })

  test('le bouton de thème bascule réellement le rendu et persiste après F5', async ({ browser }) => {
    // ⚠ Contexte NEUF : les `addInitScript` du test précédent (qui posent le
    // thème à chaque document) resteraient actifs sur `page` et écraseraient
    // à la fois la bascule et le rechargement. L'isolation est ici la seule
    // façon de prouver la persistance réelle.
    const context = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    // ⚠ Pas de `addInitScript` ici : il rejouerait le thème à CHAQUE document,
    // y compris le rechargement final, et écraserait la bascule utilisateur.
    // On pose donc la valeur une fois, puis on recharge pour l'appliquer.
    await page.goto('/')
    await page.evaluate(() => window.localStorage.setItem('rv:theme', 'light'))
    await page.reload({ waitUntil: 'domcontentloaded' })

    const before = await page.evaluate(() => {
      const site = getComputedStyle(document.querySelector('.market-site')!)
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        bg: site.backgroundColor,
        ivory: site.getPropertyValue('--color-ivory').trim(),
        ink: site.getPropertyValue('--color-ink').trim(),
      }
    })
    await page.getByRole('button', { name: /thème|sombre|clair|mode/i }).first().click()
    const after = await page.evaluate(() => {
      const site = getComputedStyle(document.querySelector('.market-site')!)
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        bg: site.backgroundColor,
        ivory: site.getPropertyValue('--color-ivory').trim(),
        ink: site.getPropertyValue('--color-ink').trim(),
        stored: window.localStorage.getItem('rv:theme'),
      }
    })

    expect(after.theme).not.toBe(before.theme)
    // Le jeton de surface ET le jeton de texte doivent changer : c'est ce que
    // voit l'utilisateur (`.market-site` ne repeint pas `<body>`, et sa
    // `background` reste `--surface-raised` dans les deux thèmes).
    expect(after.ivory, 'jeton de fond inchangé après bascule').not.toBe(before.ivory)
    expect(after.ink, 'jeton de texte inchangé après bascule').not.toBe(before.ink)
    expect(after.stored).toBe(after.theme)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
      .toBe(after.theme)

    await context.close()
  })
})

test.describe('thèmes — admin (hors thème par design)', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await sharedPage(browser, { admin: true })
  })
  test.afterAll(async () => {
    await closeSharedPage(page)
  })

  test('l’admin reste identique sous data-theme=light et dark, sans débordement', async () => {
    const renders: Record<string, string> = {}
    const backgrounds: Record<string, string> = {}

    for (const theme of THEMES) {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await openWithTheme(page, theme, '/admin/articles')

        const r = await measure(page)
        expect(r.theme, 'data-theme bien posé sur <html>').toBe(theme)
        expect(r.scroll, `/admin/articles @${width}px (${theme}) déborde : ${r.guilty.join(', ')}`).toBeLessThanOrEqual(
          r.client + 1,
        )
        expect(r.broken, `/admin/articles @${width}px (${theme}) images cassées`).toEqual([])
        renders[`${theme}:${width}`] = await page.evaluate(
          () => getComputedStyle(document.querySelector('main.admin-main, main')!).backgroundColor,
        )
        backgrounds[`${theme}:${width}`] = r.bodyBg
      }
    }

    // Invariant documenté : l'admin n'est pas re-skinné, son rendu ne dépend
    // pas du thème du site public.
    expect(renders['dark:1440'], 'l’admin est thématisé alors que le design le déclare hors thème').toBe(
      renders['light:1440'],
    )
    expect(renders['dark:390']).toBe(renders['light:390'])
    expect(backgrounds['dark:1440']).toBe(backgrounds['light:1440'])
  })
})
