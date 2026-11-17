/**
 * V7 — HÉBERGEMENT DES VENDEURS · accessibilité (CA-V7-027 / CA-V7-062)
 * axe-core sur les 3 écrans : /boutique/:slug (publique), /mon-abonnement,
 * /admin/abonnements. Instance locale NODE_ENV=test (base revends_test),
 * jamais la production. Exige 0 violation critique ou sérieuse.
 */
import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { createProductViaApi, primeCsrf } from '../lib/fixtures'

test.describe.configure({ mode: 'serial' })

const STAMP = Date.now().toString(36)
const DISPLAY = `A11y Vendeur ${STAMP}`
const EMAIL = `a11y-vendeur-${STAMP}@test.revends`
const PHONE = `77${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
const PASSWORD = 'Vendeur-Recette-42!'
const SLUG = `a11yb${STAMP}`.slice(0, 30)

test('a11y — boutique/mon-abonnement/admin : 0 violation critique/sérieuse', async ({ page, browser }) => {
  test.setTimeout(240_000)

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
    data: { planId: 1, slug: SLUG },
  })
  expect(subRes.status(), `subscribe → ${subRes.status()} ${await subRes.text()}`).toBe(201)
  const subId = ((await subRes.json()) as { subscription: { id: number } }).subscription.id

  const prod = await createProductViaApi(page.request, `A11y Article ${STAMP}`)

  const adminContext = await browser.newContext({ locale: 'fr-FR' })
  const adminPage = await adminContext.newPage()
  await adminPage.goto('/login')
  await adminPage.fill('#aMail', 'admin@revends.com')
  await adminPage.fill('#aPass', 'AdminTestPass123!')
  await Promise.all([
    adminPage.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
    adminPage.locator('button[type="submit"]').click(),
  ])
  const approve = await adminPage.request.post(`/api/admin/products/${prod.id}/approve`, {
    headers: await primeCsrf(adminPage.request),
    data: {},
  })
  expect(approve.status(), `approve → ${approve.status()}`).toBe(200)
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

  const anonContext = await browser.newContext({ locale: 'fr-FR' })
  const anonPage = await anonContext.newPage()
  await anonPage.goto(`/boutique/${SLUG}`, { waitUntil: 'networkidle' })
  const shopViolations = (
    await new AxeBuilder({ page: anonPage }).analyze()
  ).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  await anonContext.close()

  await page.goto('/mon-abonnement', { waitUntil: 'networkidle' })
  const subViolations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')

  await adminPage.goto('/admin/abonnements', { waitUntil: 'networkidle' })
  const adminViolations = (
    await new AxeBuilder({ page: adminPage }).analyze()
  ).violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  await adminContext.close()

  const total = shopViolations.length + subViolations.length + adminViolations.length
  expect(
    total,
    `boutique:${JSON.stringify(shopViolations.map((v) => v.id))} abonnement:${JSON.stringify(subViolations.map((v) => v.id))} admin:${JSON.stringify(adminViolations.map((v) => v.id))}`,
  ).toBe(0)
})
