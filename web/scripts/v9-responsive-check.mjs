/**
 * V9 — preuve [EXEC] responsive et liens hébergés (aucun backend, aucun appel Wave).
 *
 * Rend les VRAI composants V9 en SSR via Vite, injecte le CSS du build réel
 * (`web/dist/assets/*.css`), puis mesure dans Chromium à 280/320/360/375 px :
 *   - aucun débordement horizontal (document ET chaque panneau) ;
 *   - les 3 liens hébergés restent présents ;
 *   - un clic sur ces 3 liens ne déclenche AUCUNE requête /api (donc aucune
 *     création de session, aucun webhook, aucune activation).
 *
 * Prérequis : `npm run build` dans web/ (le CSS compile doit exister).
 * Usage : node scripts/v9-responsive-check.mjs
 */
import { createServer } from 'vite'
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { chromium } from '@playwright/test'

const WEB = fileURLToPath(new URL('../', import.meta.url))
const WIDTHS = [280, 320, 360, 375]
const assetDir = join(WEB, 'dist/assets')
const cssFiles = readdirSync(assetDir).filter((f) => f.endsWith('.css'))
if (cssFiles.length === 0) {
  console.error('❌ Aucun CSS compilé dans web/dist/assets — lancer `npm run build` d’abord.')
  process.exit(1)
}
const css = cssFiles.map((f) => readFileSync(join(assetDir, f), 'utf8')).join('\n')

const vite = await createServer({ root: WEB, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let browser
try {
  const { WaveCheckoutPanel } = await vite.ssrLoadModule('/src/components/storefront/WaveCheckoutPanel.tsx')
  const { SubscriptionStatusPanel } = await vite.ssrLoadModule('/src/components/storefront/SubscriptionStatusPanel.tsx')
  const { WaveSucces } = await vite.ssrLoadModule('/src/pages/WaveSucces.tsx')
  const { WaveEchec } = await vite.ssrLoadModule('/src/pages/WaveEchec.tsx')

  const subscription = (status, wavePaymentPending) => ({
    id: 42,
    status,
    slug: 'boutique-test',
    plan: { id: 1, name: 'Découverte', priceFcfa: 2000, quota: 10, durationDays: 30 },
    supersedesId: null,
    startedAt: null,
    endsAt: null,
    daysRemaining: 0,
    activatedBy: null,
    activatedAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    ...(wavePaymentPending === undefined ? {} : { wavePaymentPending }),
  })

  const wrap = (node) =>
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(MemoryRouter, null, node),
    )

  const fixtures = [
    ['panneau-desactive', React.createElement(WaveCheckoutPanel, { waveEnabled: false, subscription: subscription('PENDING', true) })],
    ['panneau-active', React.createElement(WaveCheckoutPanel, { waveEnabled: true, subscription: subscription('PENDING', true) })],
    ['statut-wave-pending', React.createElement(SubscriptionStatusPanel, { subscription: subscription('PENDING', true) })],
    ['page-succes', React.createElement(WaveSucces, null)],
    ['page-echec', React.createElement(WaveEchec, null)],
  ]

  const body = fixtures
    .map(([name, node], index) => `<section class="v9-fixture" id="fx-${index}" data-fixture="${name}">${renderToString(wrap(node))}</section>`)
    .join('\n')

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div class="wrap"><div class="section tight">${body}</div></div></body></html>`

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const requests = []
  page.on('request', (request) => requests.push(request.url()))
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('data:') || url === 'about:blank') return route.continue()
    return route.abort()
  })
  await page.setContent(html, { waitUntil: 'domcontentloaded' })

  const results = []
  let failures = 0
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    const measure = await page.evaluate(() => {
      const root = document.documentElement
      const panels = [...document.querySelectorAll('.v9-fixture')].map((el) => ({
        name: el.dataset.fixture,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
      }))
      return {
        document: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth },
        panels,
        hostedLinks: document.querySelectorAll('.wave-hosted-link').length,
        ctaCount: document.querySelectorAll('.wave-cta').length,
      }
    })
    const docOk = measure.document.scrollWidth <= measure.document.clientWidth
    const panelsOk = measure.panels.every((p) => p.scrollWidth <= p.clientWidth + 1)
    // Exactement 3 liens dans chacun des 2 panneaux Wave, 1 seul CTA (mode activé).
    const linksOk = measure.hostedLinks === 6
    const ctaOk = measure.ctaCount === 1
    const ok = docOk && panelsOk && linksOk && ctaOk
    if (!ok) failures += 1
    results.push({ width, ok, ...measure })
  }

  // Clics sur les 3 liens hébergés : aucune requête /api, donc aucune session
  // Checkout créée et aucune activation possible par ce chemin.
  await page.setViewportSize({ width: 375, height: 900 })
  const before = requests.filter((url) => url.includes('/api/')).length
  const hrefs = await page.locator('#fx-1 .wave-hosted-link').evaluateAll((links) => links.map((a) => a.href))
  for (let i = 0; i < hrefs.length; i += 1) {
    await page.locator('#fx-1 .wave-hosted-link').nth(i).click({ noWaitAfter: true })
  }
  const apiRequests = requests.filter((url) => url.includes('/api/'))
  const clickOk =
    hrefs.length === 3 &&
    hrefs.every((href) => href.startsWith('https://pay.wave.com/m/') && href.includes('?amount=')) &&
    apiRequests.length === before
  if (!clickOk) failures += 1

  const report = {
    widths: WIDTHS,
    cssFiles,
    results,
    hostedLinksClicked: hrefs,
    apiRequestsBeforeClicks: before,
    apiRequestsAfterClicks: apiRequests.length,
    clickOk,
    failures,
  }
  const outDir = join(WEB, 'test-results')
  mkdirSync(outDir, { recursive: true })
  const outFile = join(outDir, 'v9-responsive-check.json')
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`)

  for (const row of results) {
    console.log(
      `${row.ok ? '✅' : '❌'} ${String(row.width).padStart(3)}px — document ${row.document.scrollWidth}/${row.document.clientWidth} ; ` +
        `panneaux ${row.panels.map((p) => `${p.name}:${p.scrollWidth}/${p.clientWidth}`).join(' ')} ; liens=${row.hostedLinks}`,
    )
  }
  console.log(
    `${clickOk ? '✅' : '❌'} 3 clics liens hébergés — href=${hrefs.length}, requêtes /api avant=${before} après=${apiRequests.length}`,
  )
  console.log(`Preuve JSON : ${outFile}`)
  if (failures > 0) {
    console.error(`❌ ${failures} contrôle(s) en échec`)
    process.exitCode = 1
  } else {
    console.log('✅ V9 responsive + repli manuel : 0 débordement, 0 appel API sur les liens hébergés')
  }
} finally {
  if (browser) await browser.close()
  await vite.close()
}
