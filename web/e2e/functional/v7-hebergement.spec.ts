/**
 * V7 — HÉBERGEMENT DES VENDEURS · parcours navigateur contre une instance
 * LOCALE dédiée (`NODE_ENV=test`, base PostgreSQL `revends_test` **neuve** —
 * remise à zéro avant le run, JAMAIS la base de production).
 *
 * Parcours prouvés (cahier V7, grille §9) :
 *   (a) inscription → souscription → statut PENDING
 *   (b) activation par l’admin → ACTIVE (file /admin/abonnements)
 *   (c) le vendeur ajoute 3 annonces boutique (sheet)
 *   (d) boutique publique ANONYME : 200 (displayName + memberSince + 3 cartes,
 *       aucune coordonnée) ; 404 pour un slug inconnu
 *   (e) formulaire de contact → 201 + toast de confirmation
 *   (f) mobile 375 px : aucun débordement horizontal (/boutique et /mon-abonnement)
 *
 * + zéro erreur JS (pageerror/console) sur les deux pages — CA-V7-061-like.
 *
 * Screenshots → /tmp/opencode/v7-screenshots/. Aucune production.
 */
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { createProductViaApi } from '../lib/fixtures'

const SHOTS = '/tmp/opencode/v7-screenshots'
mkdirSync(SHOTS, { recursive: true })

const STAMP = Date.now().toString(36)
const SLUG = `v7e2e${STAMP}`.slice(0, 30)
const SELLER_EMAIL = `v7-vendeur-${STAMP}@test.revends`
const BUYER_EMAIL = `v7-acheteur-${STAMP}@test.revends`
const PASSWORD = 'Vendeur-Recette-42!'
const SELLER_PHONE = `77${String(Date.now()).slice(-7)}`

test.describe.configure({ mode: 'serial' })

test('parcours V7 complet (a→f) : inscription → souscription → activation → annonces → boutique publique → contact → 375 px', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180_000)
  const consoleErrors: string[] = []
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`)
  })

  const shot = (name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })

  // ── (a) Inscription vendeur via l’UI ─────────────────────────────────────
  await page.goto('/register')
  await expect(page.locator('#aName')).toBeVisible()
  await page.fill('#aName', `V7 Vendeur ${STAMP}`)
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
  await page.goto('/mon-abonnement')
  await expect(page.getByRole('heading', { level: 1, name: 'Mon abonnement' })).toBeVisible()

  // ── Seed : 3 produits du vendeur (via API, session du navigateur) ───────
  const products: Array<{ id: number; name: string; slug: string }> = []
  for (let i = 1; i <= 3; i += 1) {
    // `page.request` partage le cookie-jar de la page → session vendeur.
    const p = await createProductViaApi(page.request, `Article boutique V7 ${STAMP} numero ${i}`)
    products.push(p)
  }
  expect(products).toHaveLength(3)

  // ── (a) Souscription via l’UI → PENDING ──────────────────────────────────
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Choisissez votre forfait' })).toBeVisible()
  // Le radio est visuellement masqué (sr-only) : on clique la carte (label).
  await page.locator('label.rv-shop-plan', { hasText: 'Découverte' }).click()
  await expect(page.getByRole('radio', { name: /Découverte/ })).toBeChecked()
  await page.locator('#shop-slug').fill(SLUG)
  const [subscribe] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/subscriptions') && r.request().method() === 'POST'),
    page.locator('button[type="submit"]', { hasText: 'Soumettre ma demande' }).click(),
  ])
  expect(subscribe.status(), `souscription → ${subscribe.status()} ${await subscribe.text()}`).toBe(201)
  await expect(page.getByText("En attente d'activation").first()).toBeVisible()
  await shot('01-vendeur-pending')

  // La boutique publique n’existe pas encore (404) — exigence CA-V7-012/024.
  const pre = await request.get(`/api/storefront/${SLUG}`)
  expect(pre.status()).toBe(404)

  // ── (b) Activation admin via l’UI → ACTIVE ───────────────────────────────
  const adminContext = await browser.newContext({ locale: 'fr-FR' })
  const adminPage = await adminContext.newPage()
  adminPage.on('pageerror', (err) => consoleErrors.push(`admin pageerror: ${err.message}`))
  await adminPage.goto('/login')
  await expect(adminPage.locator('#aMail')).toBeVisible()
  await adminPage.fill('#aMail', 'admin@revends.com')
  await adminPage.fill('#aPass', 'AdminTestPass123!')
  const [login] = await Promise.all([
    adminPage.waitForResponse((r) => r.url().includes('/api/auth/login')),
    adminPage.locator('button[type="submit"]').click(),
  ])
  expect(login.status(), `login admin → ${login.status()}`).toBe(200)
  await adminPage.goto('/admin/abonnements')
  await expect(adminPage.getByRole('heading', { level: 1, name: 'Abonnements' })).toBeVisible()
  const activateButton = adminPage.getByRole('button', {
    name: new RegExp(`Activer la boutique « ${SLUG} »`),
  })
  await expect(activateButton).toBeVisible({ timeout: 15_000 })
  await activateButton.click()
  const dialog = adminPage.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const [activate] = await Promise.all([
    adminPage.waitForResponse((r) => r.url().includes('/activate')),
    dialog.getByRole('button', { name: 'Activer la boutique' }).click(),
  ])
  expect(activate.status(), `activation → ${activate.status()} ${await activate.text()}`).toBe(200)
  await expect(adminPage.getByText(`« ${SLUG} » est ouverte`).first()).toBeVisible({ timeout: 10_000 })
  await adminPage.screenshot({ path: `${SHOTS}/02-admin-activation.png`, fullPage: true })
  await adminContext.close()

  // ── (c) Le vendeur ajoute les 3 annonces via le sheet ───────────────────
  await page.goto('/mon-abonnement')
  await expect(page.getByText('Boutique ouverte').first()).toBeVisible({ timeout: 15_000 })
  for (const product of products) {
    // Sheet : ouvert via le CTA « Ajouter » / « Ajouter une annonce ».
    const openSheet = page.getByRole('button', { name: /^Ajouter( une annonce)?$/ }).first()
    await openSheet.click()
    const item = page.getByRole('button', { name: `Ajouter « ${product.name} » à votre boutique` })
    await expect(item).toBeVisible({ timeout: 10_000 })
    const [add] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/storefront/listings') && r.request().method() === 'POST'),
      item.click(),
    ])
    expect(add.status(), `ajout ${product.name} → ${add.status()}`).toBe(201)
    await expect(page.getByText(`« ${product.name} » est dans votre boutique`).first()).toBeVisible({ timeout: 10_000 })
  }
  await expect(page.getByText('Mes annonces de boutique (3)')).toBeVisible()
  await shot('03-vendeur-3-annonces')

  // ── (d) Boutique publique ANONYME ───────────────────────────────────────
  const anonContext = await browser.newContext({ locale: 'fr-FR' })
  const anonPage = await anonContext.newPage()
  anonPage.on('pageerror', (err) => consoleErrors.push(`anon pageerror: ${err.message}`))
  anonPage.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`anon console: ${msg.text()}`)
  })
  // API directe : 200 + Cache-Control + JSON sans PII.
  const shopRes = await anonContext.request.get(`/api/storefront/${SLUG}`)
  expect(shopRes.status()).toBe(200)
  expect(shopRes.headers()['cache-control'] ?? '').toContain('private')
  const shopBody = (await shopRes.json()) as Record<string, any>
  expect(shopBody.storefront.slug).toBe(SLUG)
  expect(typeof shopBody.storefront.displayName).toBe('string')
  expect(typeof shopBody.storefront.memberSince).toBe('number')
  expect(shopBody.items).toHaveLength(3)
  const raw = JSON.stringify(shopBody)
  expect(raw, 'aucune coordonnée privée dans le JSON').not.toMatch(/phone|whatsapp|mail|mailto|tel:/i)

  await anonPage.goto(`/boutique/${SLUG}`)
  await expect(anonPage.getByRole('heading', { level: 1, name: /V7 Vendeur/ })).toBeVisible({ timeout: 15_000 })
  await expect(anonPage.getByText(`Membre depuis ${new Date().getUTCFullYear()}`)).toBeVisible()
  await expect(anonPage.locator('.rv-grid article')).toHaveCount(3)
  const anonContent = await anonPage.content()
  // Coordonnées privées = canaux directs (numéro/adresse/mail du vendeur),
  // PAS les mots « téléphones » (meta description) ni « .fa-whatsapp » (CSS FA).
  expect(anonContent, 'canal direct tel:/mailto:/wa.me dans le HTML').not.toMatch(/tel:|mailto:|wa\.me/i)
  expect(anonContent, 'e-mail vendeur exposé dans le HTML').not.toContain(SELLER_EMAIL)
  expect(anonContent, 'numéro vendeur exposé dans le HTML').not.toContain(SELLER_PHONE)
  await anonPage.screenshot({ path: `${SHOTS}/04-boutique-anonyme.png`, fullPage: true })

  // Slug inconnu → page « boutique introuvable » + API 404 identique.
  const unknown = await anonContext.request.get('/api/storefront/slug-inconnu-v7-e2e')
  expect(unknown.status()).toBe(404)
  await anonPage.goto('/boutique/slug-inconnu-v7-e2e')
  await expect(anonPage.getByRole('heading', { level: 1, name: 'Cette boutique n’existe pas' })).toBeVisible({
    timeout: 15_000,
  })
  await anonPage.screenshot({ path: `${SHOTS}/05-boutique-404.png`, fullPage: true })
  await anonContext.close()

  // ── (e) Contact boutique (acheteur connecté) → 201 + confirmation ───────
  const buyerContext = await browser.newContext({ locale: 'fr-FR' })
  const buyerPage = await buyerContext.newPage()
  buyerPage.on('pageerror', (err) => consoleErrors.push(`buyer pageerror: ${err.message}`))
  await buyerPage.goto('/register')
  await buyerPage.fill('#aName', `V7 Acheteur ${STAMP}`)
  await buyerPage.fill('#aPhone', `76${String(Date.now()).slice(-7)}`)
  await buyerPage.fill('#aMail', BUYER_EMAIL)
  await buyerPage.fill('#aPass', PASSWORD)
  await buyerPage.fill('#aPass2', PASSWORD)
  await buyerPage.check('input[name="acceptedCgu"]')
  const [buyerRegister] = await Promise.all([
    buyerPage.waitForResponse((r) => r.url().includes('/api/auth/register')),
    buyerPage.locator('button[type="submit"]').click(),
  ])
  expect(buyerRegister.status()).toBe(201)
  await buyerPage.goto(`/boutique/${SLUG}`)
  const message = `Bonjour, cet article est-il toujours disponible ? (message e2e ${STAMP})`
  await buyerPage.fill('#shop-message', message)
  const [contact] = await Promise.all([
    buyerPage.waitForResponse((r) => r.url().includes(`/api/storefront/${SLUG}/contact`)),
    buyerPage.getByRole('button', { name: /Envoyer mon message/ }).click(),
  ])
  expect(contact.status(), `contact → ${contact.status()} ${await contact.text()}`).toBe(201)
  const contactBody = (await contact.json()) as { ok: boolean; notificationId: number }
  expect(contactBody.ok).toBe(true)
  expect(Number.isInteger(contactBody.notificationId)).toBe(true)
  await expect(buyerPage.getByText('Votre message est envoyé à la boutique.')).toBeVisible({ timeout: 10_000 })
  await buyerPage.screenshot({ path: `${SHOTS}/06-contact-confirmation.png`, fullPage: true })
  await buyerContext.close()

  // ── (f) Mobile 375 px : aucun débordement horizontal ─────────────────────
  await page.setViewportSize({ width: 375, height: 667 })
  for (const path of [`/boutique/${SLUG}`, '/mon-abonnement']) {
    await page.goto(path)
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width, `scrollWidth sur ${path} (375 px attendus)`).toBeLessThanOrEqual(375)
    await page.screenshot({ path: `${SHOTS}/07-mobile375-${path.includes('boutique') ? 'boutique' : 'mon-abonnement'}.png`, fullPage: true })
  }

  // Zéro erreur JS. Bruit réseau attendu et filtré (documenté) : /auth/me → 401
  // pour un visiteur anonyme (l'app interroge la session au montage — design
  // voulu, réponse propre), et 404 pour la navigation volontaire vers un slug
  // inconnu (testé exprès, réponse unique non divulgatrice). Tout le reste
  // (pageerror, TypeError, 500…) fait échouer le test.
  const benign = /401 \(Unauthorized\)|404 \(Not Found\)/
  const unexpected = consoleErrors.filter((e) => !benign.test(e))
  expect(unexpected, `erreurs JS inattendues : ${unexpected.join(' | ')}`).toEqual([])
})
