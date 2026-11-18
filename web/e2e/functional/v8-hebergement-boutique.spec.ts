/**
 * V8 — HÉBERGEMENT BOUTIQUE · parcours navigateur contre une instance LOCALE
 * dédiée (`NODE_ENV=test`, base PostgreSQL `revends_test` **neuve** — remise à
 * zéro avant le run, JAMAIS la base de production).
 *
 * Parcours prouvés (cahier V8, grille §9 — scénarios 2 / 9 partiels) :
 *   (a) inscription vendeur → /mon-abonnement → souscription « Boutique » avec
 *       lecture Wave (`paymentMethod=wave` + référence) → PENDING (201) →
 *       activation admin (file /admin/abonnements) → ACTIVE ;
 *   (b) acheteur connecté achète l'article de la boutique → paiement confirmé
 *       (admin) → SOLD ; /account montre la commande ; la carte catalogue et la
 *       fiche portent le badge « Boutique Vérifiée » (vendeur ACTIVE + téléphone
 *       strict +221 7…) ;
 *   (c) routes admin : un utilisateur NON-admin reçoit 403 sur les routes V8 et
 *       historiques /api/admin/* ; l'admin obtient 200 sur /api/admin/auto-approvals ;
 *       la page /admin/abonnements exige le rôle admin (RequireAdmin) ;
 *   (d) 375 px : scrollWidth ≤ 375 sur /boutique/:slug et /mon-abonnement ;
 *   (f) GET /api/subscriptions/me/report?period=<mois précédent> :
 *       404 REPORT_NOT_AVAILABLE quand monthly_metrics est vide (base neuve).
 *       Le chemin 200 est prouvé ensuite via une ligne monthly_metrics semée
 *       en SQL (fixture EXEC) — voir le rapport de recette.
 *
 * ⚠️ L'instance API V8 (port 4050) tourne avec AUTO_APPROVE_V8=true (défaut
 * produit) — c'est ce qui permet l'auto-approbation (b). Aucune prod.
 * Screenshots → /tmp/opencode/v8-screenshots/.
 */
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { createProductViaApi, primeCsrf } from '../lib/fixtures'

const SHOTS = '/tmp/opencode/v8-screenshots'
mkdirSync(SHOTS, { recursive: true })

const STAMP = Date.now().toString(36)
const SLUG = `v8e2e${STAMP}`.slice(0, 30)
const SELLER_EMAIL = `v8-vendeur-${STAMP}@test.revends`
const BUYER_EMAIL = `v8-acheteur-${STAMP}@test.revends`
const PASSWORD = 'Vendeur-Recette-42!'
const SELLER_PHONE = `77${String(Date.now()).slice(-7)}`
const BUYER_PHONE = `76${String(Date.now()).slice(-7)}`

/** Mois précédent au format YYYY-MM (periode du bilan à interroger). */
function previousMonthUTC(): string {
  const now = new Date()
  const firstOfThisMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const prev = new Date(firstOfThisMonth - 1)
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}

test.describe.configure({ mode: 'serial' })

test('parcours V8 (a→f) : inscription → souscription Wave → ACTIVE → badge « Boutique Vérifiée » → achat → SOLD → 403 user / 200 admin → 375 px → PDF', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000)
  const consoleErrors: string[] = []
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`)
  })
  const shot = (name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })

  // (a) Inscription vendeur via l’UI — téléphone strict +221 7… (éligibilité V8-D2).
  await page.goto('/register')
  await expect(page.locator('#aName')).toBeVisible()
  await page.fill('#aName', `V8 Vendeur ${STAMP}`)
  await page.fill('#aPhone', SELLER_PHONE)
  await page.fill('#aMail', SELLER_EMAIL)
  await page.fill('#aPass', PASSWORD)
  await page.fill('#aPass2', PASSWORD)
  await page.check('input[name="acceptedCgu"]')
  const [register] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/register')),
    page.locator('button[type="submit"]').click(),
  ])
  expect(register.status(), `inscription → ${register.status()}`).toBe(201)

  // (a) Souscription « Boutique » + Wave + référence via l’UI → PENDING (201).
  await page.goto('/mon-abonnement')
  await expect(page.getByRole('heading', { level: 1, name: 'Mon abonnement' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Choisissez votre forfait' })).toBeVisible()
  const boutiquePlan = page.locator('label.rv-shop-plan', { has: page.getByText('Boutique', { exact: true }) })
  await boutiquePlan.click()
  await expect(page.getByRole('radio', { name: 'Boutique — 5 000 FCFA par mois, 30 annonces' })).toBeChecked()
  await page.locator('#shop-slug').fill(SLUG)
  await page.locator('#subscribe-payment-method').selectOption('wave')
  await page.locator('#subscribe-payment-reference').fill('WAVE-20261118-8392')
  const [subscribe] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/subscriptions') && r.request().method() === 'POST'),
    page.locator('button[type="submit"]', { hasText: 'Soumettre ma demande' }).click(),
  ])
  expect(subscribe.status(), `souscription → ${subscribe.status()} ${await subscribe.text()}`).toBe(201)
  await expect(page.getByText("En attente d'activation").first()).toBeVisible()
  await shot('v8-01-vendeur-pending-wave')

  // (f) Bilan PDF — monthly_metrics vide (base neuve) ⇒ 404 REPORT_NOT_AVAILABLE.
  const reportEmpty = await page.request.get(`/api/subscriptions/me/report?period=${previousMonthUTC()}`, {
    headers: await primeCsrf(page.request),
  })
  expect(reportEmpty.status(), `report monthly_metrics vide → ${reportEmpty.status()}`).toBe(404)

  // (a) Activation admin via l’UI → ACTIVE.
  const adminContext = await browser.newContext({ locale: 'fr-FR' })
  const adminPage = await adminContext.newPage()
  adminPage.on('pageerror', (err) => consoleErrors.push(`admin pageerror: ${err.message}`))
  await adminPage.goto('/login')
  await adminPage.fill('#aMail', 'admin@revends.com')
  await adminPage.fill('#aPass', 'AdminTestPass123!')
  const [login] = await Promise.all([
    adminPage.waitForResponse((r) => r.url().includes('/api/auth/login')),
    adminPage.locator('button[type="submit"]').click(),
  ])
  expect(login.status(), `login admin → ${login.status()}`).toBe(200)
  await adminPage.goto('/admin/abonnements')
  await expect(adminPage.getByRole('heading', { level: 1, name: 'Abonnements' })).toBeVisible()
  // La file admin montre la méthode et la référence MASQUÉE (jamais entière).
  await expect(adminPage.getByText('WAVE-20261118-8392')).toHaveCount(0)
  const activateButton = adminPage.getByRole('button', { name: new RegExp(`Activer la boutique « ${SLUG} »`) })
  await expect(activateButton).toBeVisible({ timeout: 15_000 })
  await activateButton.click()
  const dialog = adminPage.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const [activate] = await Promise.all([
    adminPage.waitForResponse((r) => r.url().includes('/activate')),
    dialog.getByRole('button', { name: 'Activer la boutique' }).click(),
  ])
  expect(activate.status(), `activation → ${activate.status()} ${await activate.text()}`).toBe(200)
  await adminPage.screenshot({ path: `${SHOTS}/v8-02-admin-activation.png`, fullPage: true })

  // (c) Admin : auto-approvals — l’admin obtient 200 et voit la file paginée.
  const autoApprovals = await adminPage.request.get('/api/admin/auto-approvals')
  expect(autoApprovals.status(), `auto-approvals admin → ${autoApprovals.status()}`).toBe(200)
  const autoApprovalsBody = (await autoApprovals.json()) as Record<string, unknown>
  // La forme JSON exactes est servie par l’API (items/pagination) — on exige au moins un objet.
  expect(typeof autoApprovalsBody, 'corps auto-approvals JSON objet').toBe('object')

  await adminContext.close()

  // Le vendeur recharge : ACTIVE (message « Boutique ouverte »).
  await page.goto('/mon-abonnement')
  await expect(page.getByText('Boutique ouverte').first()).toBeVisible({ timeout: 15_000 })
  await shot('v8-03-vendeur-active')

  // (b) Le vendeur publie un article — éligible (ACTIVE + +221 7…) ⇒ AVAILABLE (auto-approbation).
  const product = await createProductViaApi(page.request, `Article boutique V8 ${STAMP}`)
  const prodStatus = await page.request.get(`/api/products/${product.slug}`)
  const prodBody = (await prodStatus.json()) as { status?: string }
  expect(prodBody.status, 'article publié par un éligible ⇒ AVAILABLE').toBe('AVAILABLE')

  // L’article apparaît dans le catalogue (visible) — sinon la suite du parcours s’écroule.
  const listing = await page.request.post('/api/storefront/listings', {
    headers: await primeCsrf(page.request),
    data: { productId: product.id },
  })
  expect(listing.status(), `ajout listing → ${listing.status()} ${await listing.text()}`).toBe(201)

  // (b) Catalogue public : la carte du produit porte le badge « Boutique Vérifiée ».
  const anonContext = await browser.newContext({ locale: 'fr-FR' })
  const anonPage = await anonContext.newPage()
  await anonPage.goto('/catalogue')
  await expect(anonPage.getByText(`Article boutique V8 ${STAMP}`).first()).toBeVisible({ timeout: 20_000 })
  const cardBadge = anonPage.locator('article.rv', { hasText: `Article boutique V8 ${STAMP}` }).getByText('Boutique Vérifiée')
  await expect(cardBadge.first()).toBeVisible()
  await anonPage.screenshot({ path: `${SHOTS}/v8-04-catalogue-badge.png`, fullPage: true })

  // (b) Fiche produit : badge « Boutique Vérifiée » visible également.
  await anonPage.goto(`/catalogue/${product.slug}`)
  await expect(anonPage.locator('h1')).toBeVisible()
  await expect(anonPage.getByText('Boutique Vérifiée').first()).toBeVisible({ timeout: 15_000 })
  await anonPage.screenshot({ path: `${SHOTS}/v8-05-fiche-badge.png`, fullPage: true })
  await anonContext.close()

  // hostName en output (preuve d’instance locale, jamais la prod).
  const hostName = new URL(page.url()).hostname
  console.log(`[v8-e2e] hostName = ${hostName}`)
  expect(['127.0.0.1', 'localhost']).toContain(hostName)

  // (b) Acheteur : inscription → achat (panier → checkout) → order créé.
  const buyerContext = await browser.newContext({ locale: 'fr-FR' })
  const buyerPage = await buyerContext.newPage()
  buyerPage.on('pageerror', (err) => consoleErrors.push(`buyer pageerror: ${err.message}`))
  await buyerPage.goto('/register')
  await buyerPage.fill('#aName', `V8 Acheteur ${STAMP}`)
  await buyerPage.fill('#aPhone', BUYER_PHONE)
  await buyerPage.fill('#aMail', BUYER_EMAIL)
  await buyerPage.fill('#aPass', PASSWORD)
  await buyerPage.fill('#aPass2', PASSWORD)
  await buyerPage.check('input[name="acceptedCgu"]')
  const [buyerRegister] = await Promise.all([
    buyerPage.waitForResponse((r) => r.url().includes('/api/auth/register')),
    buyerPage.locator('button[type="submit"]').click(),
  ])
  expect(buyerRegister.status()).toBe(201)

  await buyerPage.goto(`/catalogue/${product.slug}`)
  await buyerPage.getByRole('button', { name: /Ajouter au panier/ }).click()
  await buyerPage.goto('/checkout')
  await buyerPage.fill('#ckName', `V8 Acheteur ${STAMP}`)
  await buyerPage.fill('#ckPhone', BUYER_PHONE)
  await buyerPage.fill('#ckCity', 'Dakar')
  await buyerPage.fill('#ckAddr', 'Rue 10, Dakar Plateau — livraison test recette')
  const [checkout] = await Promise.all([
    buyerPage.waitForResponse((r) => r.url().includes('/api/orders/checkout')),
    buyerPage.getByRole('button', { name: /Confirmer la commande/ }).click(),
  ])
  expect(checkout.status(), `checkout → ${checkout.status()} ${await checkout.text()}`).toBe(201)
  const checkoutBody = (await checkout.json()) as { orders?: Array<{ id: number; orderNumber: string }> }
  const orderId = checkoutBody.orders?.[0]?.id
  const orderNumber = checkoutBody.orders?.[0]?.orderNumber
  expect(orderId, 'orderId présent dans la réponse checkout').toBeTruthy()
  expect(orderNumber, 'orderNumber présent dans la réponse checkout').toBeTruthy()
  await buyerPage.screenshot({ path: `${SHOTS}/v8-06-acheteur-commande.png`, fullPage: true })

  // (b) /account acheteur : la commande y apparaît.
  await buyerPage.goto('/account')
  await expect(buyerPage.getByText(orderNumber!).first()).toBeVisible({ timeout: 20_000 })
  await buyerPage.screenshot({ path: `${SHOTS}/v8-07-compte-acheteur.png`, fullPage: true })
  await buyerContext.close()

  // (b) Paiement confirmé par l’admin → PAID ; le produit devient SOLD.
  const adminContext2 = await browser.newContext({ locale: 'fr-FR' })
  const adminPage2 = await adminContext2.newPage()
  adminPage2.on('pageerror', (err) => consoleErrors.push(`admin2 pageerror: ${err.message}`))
  await adminPage2.goto('/login')
  await adminPage2.fill('#aMail', 'admin@revends.com')
  await adminPage2.fill('#aPass', 'AdminTestPass123!')
  await Promise.all([
    adminPage2.waitForResponse((r) => r.url().includes('/api/auth/login')),
    adminPage2.locator('button[type="submit"]').click(),
  ])
  const confirm = await adminPage2.request.post(`/api/admin/orders/${orderId}/confirm-payment`, {
    headers: await primeCsrf(adminPage2.request),
    data: { method: 'MOBILE_MONEY', reference: `RECEIPT-${STAMP}` },
  })
  expect(confirm.status(), `confirm-payment → ${confirm.status()} ${await confirm.text()}`).toBe(200)
  await adminContext2.close()

  const soldCheck = await page.request.get(`/api/products/${product.slug}`)
  const soldBody = (await soldCheck.json()) as { status?: string }
  expect(soldBody.status, 'après confirm-payment ⇒ SOLD').toBe('SOLD')

  // (c) 403 propagation : un utilisateur NON-admin est refusé sur les routes admin.
  const userContext = await browser.newContext({ locale: 'fr-FR' })
  const userPage = await userContext.newPage()
  await userPage.goto('/login')
  await userPage.fill('#aMail', BUYER_EMAIL)
  await userPage.fill('#aPass', PASSWORD)
  await Promise.all([
    userPage.waitForResponse((r) => r.url().includes('/api/auth/login')),
    userPage.locator('button[type="submit"]').click(),
  ]).catch(() => undefined) // la session acheteur est déjà en place via le checkout ? non — nouveau contexte : login réel
  const adminRoutes: Array<{ method: 'GET' | 'POST'; path: string }> = [
    { method: 'GET', path: '/api/admin/stats' },
    { method: 'GET', path: '/api/admin/products' },
    { method: 'GET', path: '/api/admin/orders' },
    { method: 'GET', path: '/api/admin/users' },
    { method: 'GET', path: '/api/admin/history' },
    { method: 'GET', path: '/api/admin/auto-approvals' },
    { method: 'POST', path: `/api/admin/subscriptions/${1}/activate` },
    { method: 'POST', path: `/api/admin/products/${product.id}/retrograde` },
  ]
  for (const route of adminRoutes) {
    const res = await userPage.request[route.method.toLowerCase() as 'get' | 'post'](route.path, {
      headers: await primeCsrf(userPage.request),
      ...(route.method === 'POST' ? { data: {} } : {}),
    })
    expect(
      res.status(),
      `user sur ${route.method} ${route.path} → attendu 403 (forbidden), obtenu ${res.status()}`,
    ).toBe(403)
  }
  // Restriction UI : /admin/* renvoie un utilisateur vers l’accueil (RequireAdmin).
  await userPage.goto('/admin/abonnements')
  await expect(userPage.getByRole('heading', { level: 1, name: 'Abonnements' })).toHaveCount(0)
  await userContext.close()

  // (d) 375 px : aucun débordement horizontal.
  await page.setViewportSize({ width: 375, height: 667 })
  for (const path of [`/boutique/${SLUG}`, '/mon-abonnement']) {
    await page.goto(path)
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width, `scrollWidth sur ${path} (375 px attendus)`).toBeLessThanOrEqual(375)
    await page.screenshot({ path: `${SHOTS}/v8-08-mobile375-${path.includes('boutique') ? 'boutique' : 'mon-abonnement'}.png`, fullPage: true })
  }

  // Zéro erreur JS inattendue (401 /auth/me + 404 volontaires = bruit filtré).
  const benign = /401 \(Unauthorized\)|404 \(Not Found\)/
  const unexpected = consoleErrors.filter((e) => !benign.test(e))
  expect(unexpected, `erreurs JS inattendues : ${unexpected.join(' | ')}`).toEqual([])
})
