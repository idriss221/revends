/**
 * Audit responsive + images — 13 largeurs × pages publiques et admin.
 *
 * Ce script ouvre le VRAI build (`vite preview`) dans Chromium, à chaque largeur
 * de la recette (320 → 1920), et vérifie pour chaque page :
 *   1. aucun débordement horizontal (`scrollWidth > clientWidth`) hors éléments
 *      volontairement clippés par un ancêtre `overflow-x` (rails, carrousels) ;
 *   2. aucune image cassée (`naturalWidth === 0` sur `src` renseigné) ;
 *   3. aucune réponse image en erreur réseau (status ≥ 400).
 *
 * Il force le chargement paresseux des images et défile toute la page : sans
 * cela, un `loading="lazy"` masquerait une image cassée située en bas de page.
 *
 * Prérequis : `npm run build && npx vite preview --port 5181` dans `web/`, et
 * une session admin dans `e2e/.session.json` (générée par `playwright test`).
 *
 * Usage :
 *   node perf/responsive-audit.mjs --base http://127.0.0.1:5181
 */
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = arg('--base', 'http://127.0.0.1:5181')
const SESSION = arg('--session', resolve(HERE, '..', 'e2e', '.session.json'))
const OUT = arg('--out', '/tmp/opencode/responsive-audit.json')

const WIDTHS = (arg('--widths', '320,360,375,390,414,430,768,834,1024,1280,1440,1600,1920'))
  .split(',')
  .map(Number)

const PUBLIC = [
  '/',
  '/accueil-react',
  '/category',
  '/category/mode',
  '/search?q=Portable',
  '/panier',
  '/favoris',
  '/mes-commandes',
  '/vendre',
  '/login',
  '/register',
]

const ADMIN = [
  '/admin',
  '/admin/articles',
  '/admin/articles-en-attente',
  '/admin/commandes',
  '/admin/categories',
  '/admin/historique',
  '/admin/utilisateurs',
  '/admin/paiements',
]

/** Charge la session admin dans le contexte (cookie explicite, pas de login). */
function adminCookie() {
  try {
    const raw = JSON.parse(readFileSync(SESSION, 'utf8'))
    const [name, value] = raw.cookie.split('=')
    return { name, value }
  } catch {
    return null
  }
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' })
const cookie = adminCookie()
if (cookie) await ctx.addCookies([{ ...cookie, domain: '127.0.0.1', path: '/' }])
else console.warn('⚠ pas de session admin trouvée — les pages admin redirigeront vers la boutique')

const page = await ctx.newPage()
let netFails = []
page.on('response', (r) => {
  if (r.request().resourceType() === 'image' && r.status() >= 400) netFails.push(`${r.status()} ${r.url()}`)
})

const fails = []
let checked = 0
let images = 0

for (const [group, routes] of [['public', PUBLIC], ['admin', ADMIN]]) {
  for (const route of routes) {
    for (const width of WIDTHS) {
      netFails = []
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 })
      await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 45000 })
      await page.evaluate(async () => {
        const imgs = [...document.images]
        imgs.forEach((i) => {
          i.loading = 'eager'
        })
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 40))
        }
        window.scrollTo(0, 0)
        await Promise.race([
          Promise.all(
            imgs.map((i) =>
              i.complete
                ? 1
                : new Promise((r) => {
                    i.onload = i.onerror = r
                  }),
            ),
          ),
          new Promise((r) => setTimeout(r, 6000)),
        ])
      })
      await page.waitForTimeout(200)

      const r = await page.evaluate(() => {
        const el = document.documentElement
        const clippe = (n) => {
          for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX
            if (['auto', 'scroll', 'hidden', 'clip'].includes(ox)) return true
          }
          return false
        }
        const guilty = [...document.querySelectorAll('body *')]
          .filter((n) => n.getBoundingClientRect().right > el.clientWidth + 1 && !clippe(n))
          .slice(0, 3)
          .map((n) => `${n.tagName.toLowerCase()}.${String(n.className).slice(0, 60)}`)
        const imgs = [...document.images].filter((i) => i.getAttribute('src'))
        return {
          scroll: Math.max(el.scrollWidth, document.body.scrollWidth),
          client: el.clientWidth,
          guilty,
          imgs: imgs.length,
          broken: imgs
            .filter((i) => i.naturalWidth === 0 && i.complete)
            .map((i) => i.getAttribute('src'))
            .slice(0, 5),
        }
      })

      checked += 1
      images += r.imgs
      if (r.scroll > r.client + 1 || r.broken.length || netFails.length) {
        fails.push({ group, route, width, ...r, netFails: netFails.slice(0, 5) })
      }
    }
  }
}

await browser.close()

const report = { base: BASE, at: new Date().toISOString(), widths: WIDTHS, checked, images, anomalies: fails.length, fails }
const { writeFileSync } = await import('node:fs')
writeFileSync(OUT, JSON.stringify(report, null, 2))

console.log(`MESURES: ${checked} | ANOMALIES: ${fails.length} | images vues: ${images}`)
for (const f of fails.slice(0, 25)) console.log(JSON.stringify(f))
process.exit(fails.length === 0 ? 0 : 1)
