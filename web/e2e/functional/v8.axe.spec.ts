/**
 * V8 — HÉBERGEMENT BOUTIQUE · accessibilité (CA-V8-076/077/078)
 * axe-core sur 3 écrans : /boutique/:slug (publique, anonyme), /mon-abonnement
 * (vendeur, onglet « Statistiques »), /admin/abonnements. + 1 scan Mobile Chrome
 * (375×667) sur la boutique avec scrollWidth ≤ 375.
 * Instance locale NODE_ENV=test (base revends_test), jamais la production.
 * Exige 0 violation critique ou sérieuse.
 */
import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { createProductViaApi, primeCsrf } from '../lib/fixtures'

const STAMP = Date.now().toString(36)
const DISPLAY = `A11y V8 Vendeur ${STAMP}`
const EMAIL = `a11y-v8-${STAMP}@test.revends`
const PHONE = `77${String(Date.now()).slice(-7)}`
const PASSWORD = 'Vendeur-Recette-42!'
const SLUG = `a11yv8${STAMP}`.slice(0, 30)

test.describe.configure({ mode: 'serial' })

test('axe V8 — boutique/mon-abonnement/admin : 0 violation critique/sérieuse + Mobile Chrome 375', async ({ page, browser }) => {
  test.setTimeout(240_000)

  // Parcours minimal pour peupler la boutique (inscription → souscription Wave → activation → listing).
  await page.goto('/register')
  await page.fill('#aName', DISPLAY)
  await page.fill('#aPhone', PHONE)
  await page.fill('#aMail', EMAIL)
  await page.fill('#aPass', PASSWORD)
  await page.fill('#aPass2', PASSWORD)
  await page.check('input[name="acceptedCgu"]')
  const [registerRes] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/register')),
    page.locator('button[type="submit"]').click(),
  ])
  expect(registerRes.status(), `register → ${registerRes.status()}`).toBe(201)

  const subRes = await page.request.post('/api/subscriptions', {
    headers: await primeCsrf(page.request),
    data: { planId: 2, slug: SLUG, paymentMethod: 'wave', paymentReference: `WAVE-A11Y-${STAMP}`.slice(0, 32) },
  })
  expect(subRes.status(), `subscribe → ${subRes.status()} ${await subRes.text()}`).toBe(201)
  const subId = ((await subRes.json()) as { subscription: { id: number } }).subscription.id

  const prod = await createProductViaApi(page.request, `Article a11y V8 ${STAMP}`)

  const adminContext = await browser.newContext({ locale: 'fr-FR' })
  const adminPage = await adminContext.newPage()
  await adminPage.goto('/login')
  await adminPage.fill('#aMail', 'admin@revends.com')
  await adminPage.fill('#aPass', 'AdminTestPass123!')
  await Promise.all([
    adminPage.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
    adminPage.locator('button[type="submit"]').click(),
  ])
  const activate = await adminPage.request.post(`/api/admin/subscriptions/${subId}/activate`, {
    headers: await primeCsrf(adminPage.request),
    data: {},
  })
  expect(activate.status(), `activate → ${activate.status()}`).toBe(200)

  const listing = await page.request.post('/api/storefront/listings', {
    headers: await primeCsrf(page.request),
    data: { productId: prod.id },
  })
  expect(listing.status(), `listing → ${listing.status()} ${await listing.text()}`).toBe(201)

  const filterCriticalSerious = (violations: Array<{ id: string; impact?: string | null }>) =>
    violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')

  // 1) Boutique publique — anonyme, desktop.
  const anonContext = await browser.newContext({ locale: 'fr-FR' })
  const anonPage = await anonContext.newPage()
  await anonPage.goto(`/boutique/${SLUG}`, { waitUntil: 'networkidle' })
  const shopViolations = filterCriticalSerious((await new AxeBuilder({ page: anonPage }).analyze()).violations)
  await anonContext.close()

  // 2) /mon-abonnement — vendeur (onglet Statistiques inclus).
  await page.goto('/mon-abonnement', { waitUntil: 'networkidle' })
  const subViolations = filterCriticalSerious((await new AxeBuilder({ page }).analyze()).violations)

  // 3) /admin/abonnements — admin.
  await adminPage.goto('/admin/abonnements', { waitUntil: 'networkidle' })
  const adminViolations = filterCriticalSerious((await new AxeBuilder({ page: adminPage }).analyze()).violations)
  await adminContext.close()

  // 4) Mobile Chrome 375×667 — boutique (équivalent « cartouche dessiné en mode Mobile Chrome »).
  const mobileContext = await browser.newContext({
    locale: 'fr-FR',
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(`/boutique/${SLUG}`, { waitUntil: 'networkidle' })
  const mobileViolations = filterCriticalSerious((await new AxeBuilder({ page: mobilePage }).analyze()).violations)
  const mobileScrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth)
  await mobilePage.screenshot({ path: `/tmp/opencode/v8-screenshots/v8-axe-mobile-375-boutique.png`, fullPage: true })
  await mobileContext.close()

  expect(mobileScrollWidth, `scrollWidth mobile → ${mobileScrollWidth}`).toBeLessThanOrEqual(375)

  const total = shopViolations.length + subViolations.length + adminViolations.length + mobileViolations.length
  expect(
    total,
    `boutique:${JSON.stringify(shopViolations.map((v) => v.id))} abonnement:${JSON.stringify(subViolations.map((v) => v.id))} admin:${JSON.stringify(adminViolations.map((v) => v.id))} mobile:${JSON.stringify(mobileViolations.map((v) => v.id))}`,
  ).toBe(0)
})
