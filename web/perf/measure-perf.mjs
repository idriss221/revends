/**
 * Performance frontend RÉELLE — Web Vitals mesurés dans Chromium.
 *
 * Ce script ouvre la vraie application (build de production servi par
 * `vite preview`), laisse le navigateur mesurer, et lit les métriques via
 * `PerformanceObserver` + `PerformanceNavigationTiming` :
 *   · FCP  (First Contentful Paint)
 *   · LCP  (Largest Contentful Paint)
 *   · CLS  (Cumulative Layout Shift)
 *   · TBT  (Total Blocking Time, dérivé des long tasks)
 *   · TTFB / DOMContentLoaded / load
 *   · poids transféré (ressources réseau réelles)
 *
 * 3 exécutions par page et par profil ; on publie la MÉDIANE (une seule
 * mesure est trop bruitée pour être opposable).
 *
 * Usage :
 *   node web/perf/measure-perf.mjs --base http://127.0.0.1:5181
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const BASE = arg('--base', 'http://127.0.0.1:5181')
const OUT = arg('--out', '/tmp/opencode/perf.json')
const RUNS = Number(arg('--runs', '3'))

const PAGES = ['/', '/category', '/category/mode', '/catalogue/<premier-article>']

/** Le slug produit est réel : on prend le premier article du catalogue servi. */
async function resolvePages() {
  try {
    const res = await fetch(`${BASE}/api/products?page=1&per_page=1`)
    const data = await res.json()
    const slug = data?.items?.[0]?.slug
    if (slug) return PAGES.map((p) => (p.includes('<premier-article>') ? `/catalogue/${slug}` : p))
  } catch {
    /* on garde la liste par défaut */
  }
  return PAGES.filter((p) => !p.includes('<premier-article>'))
}
const PROFILES = {
  mobile: { width: 390, height: 844, dpr: 3, cpu: 4 },
  desktop: { width: 1440, height: 900, dpr: 1, cpu: 1 },
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const r1 = (v) => (v == null ? null : +Number(v).toFixed(v < 10 ? 2 : 0))

async function measureOnce(browser, profile, path) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    isMobile: profile.width < 600,
  })
  const page = await context.newPage()
  const client = await context.newCDPSession(page)
  if (profile.cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })

  let transferred = 0
  let requests = 0
  page.on('response', async (res) => {
    requests += 1
    const len = Number(res.headers()['content-length'] ?? 0)
    transferred += Number.isFinite(len) ? len : 0
  })

  await page.addInitScript(() => {
    window.__vitals = { lcp: 0, cls: 0, tbt: 0, fcp: 0 }
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__vitals.lcp = e.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) window.__vitals.cls += e.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.duration > 50) window.__vitals.tbt += e.duration - 50
    }).observe({ type: 'longtask', buffered: true })
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') window.__vitals.fcp = e.startTime
    }).observe({ type: 'paint', buffered: true })
  })

  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 60000 })
  // Laisse le LCP se stabiliser (et les images se charger).
  await page.waitForTimeout(2500)

  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0]
    return {
      ttfb: n?.responseStart ?? null,
      dcl: n?.domContentLoadedEventEnd ?? null,
      load: n?.loadEventEnd ?? null,
      transferSize: n?.transferSize ?? null,
    }
  })
  const vitals = await page.evaluate(() => window.__vitals)
  await context.close()
  return {
    fcp: r1(vitals.fcp),
    lcp: r1(vitals.lcp),
    cls: r1(vitals.cls),
    tbt: r1(vitals.tbt),
    ttfb: r1(nav.ttfb),
    dcl: r1(nav.dcl),
    load: r1(nav.load),
    requests,
    transferredKB: Math.round(transferred / 1024),
  }
}

const main = async () => {
  const browser = await chromium.launch()
  const pages = await resolvePages()
  const results = []
  for (const [name, profile] of Object.entries(PROFILES)) {
    for (const path of pages) {
      const runs = []
      for (let i = 0; i < RUNS; i++) {
        try {
          runs.push(await measureOnce(browser, profile, path))
        } catch (e) {
          runs.push({ error: e.message })
        }
      }
      const ok = runs.filter((r) => !r.error)
      const agg = ok.length
        ? {
            fcp: r1(median(ok.map((r) => r.fcp))),
            lcp: r1(median(ok.map((r) => r.lcp))),
            cls: r1(median(ok.map((r) => r.cls))),
            tbt: r1(median(ok.map((r) => r.tbt))),
            ttfb: r1(median(ok.map((r) => r.ttfb))),
            load: r1(median(ok.map((r) => r.load))),
            requests: Math.round(median(ok.map((r) => r.requests))),
            transferredKB: Math.round(median(ok.map((r) => r.transferredKB))),
          }
        : { error: runs[0]?.error ?? 'inconnu' }
      results.push({ profile: name, path, runs: ok.length, ...agg })
      console.log(
        agg.error
          ? `❌ ${name} ${path} — ${agg.error}`
          : `${name} ${path}  FCP=${agg.fcp}ms LCP=${agg.lcp}ms CLS=${agg.cls} TBT=${agg.tbt}ms TTFB=${agg.ttfb}ms load=${agg.load}ms  ${agg.requests} req / ${agg.transferredKB} kB`,
      )
    }
  }
  await browser.close()
  writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), runs: RUNS, results }, null, 2))
  console.log(`\n✅ Rapport écrit : ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
