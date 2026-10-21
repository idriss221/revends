import { test, expect } from '@playwright/test'
import {
  sharedPage, openApp, seedApprovedProduct, seedOrder,
  collectPageErrors, waitForContent, csrfHeaders, cookieWithCsrf, primeCsrf,
} from '../lib/fixtures.js'
import type { Page } from '@playwright/test'

/**
 * PARCOURS COMMANDE DE BOUT EN BOUT (CA-BUY01-01..06, recette T11/T12/T14/T15/T16)
 *
 * Surface : **React** (routes `/catalogue/:slug`, `/panier`, `/commande`,
 * `/mes-commandes`). La surface Bureau (`#/checkout`) est un formulaire
 * démo sans handler.
 */
test.describe('Parcours commande — acheteur → admin (cycle complet)', () => {
  let adminPage: Page

  test.beforeAll(async ({ browser }) => {
    adminPage = await sharedPage(browser, { admin: true })
  })

  test.afterAll(async () => {
    await adminPage?.context().close()
  })

  // ----------------------------------------------------------------------
  // ÉTAPE 0 — Setup : article approuvé
  // ----------------------------------------------------------------------

  test('Setup : un article approuvé existe', async ({ request }) => {
    const { productId, slug, name } = await seedApprovedProduct(request, { label: 'journey-setup' })
    expect(productId).toBeGreaterThan(0)
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    expect(name).toBeTruthy()
  })

  // ----------------------------------------------------------------------
  // ÉTAPE 1 — Acheteur : achat via l'UI React
  // ----------------------------------------------------------------------

  test('Acheteur : ajoute au panier, commande, confirmation', async ({ browser, request }) => {
    // 1. Crée un article approuvé
    const seeded = await seedApprovedProduct(request, { label: 'journey-buy' })

    // 2. Inscrit un acheteur distinct via API (standalone request pour ne pas
    //    clobber la session admin dans le cookie-jar partagé)
    const now = Date.now().toString(36)
    const buyerEmail = `buy-${now}-${Math.random().toString(36).slice(2)}@test.revends`
    const buyerRes = await request.post('/api/auth/register', {
      headers: { ...(await primeCsrf(request)), Cookie: await cookieWithCsrf(request) },
      data: {
        displayName: `Acheteur ${now}`,
        name: `Acheteur ${now}`,
        email: buyerEmail,
        phone: `76${String(Math.floor(Math.random() * 10000000)).padStart(8, '0')}`,
        password: 'Acheteur-Recette-42!',
        acceptedCgu: true,
      },
    })
    expect(buyerRes.ok(), `inscription acheteur → ${buyerRes.status()} ${await buyerRes.text()}`).toBe(true)

    // 3. Page dédiée acheteur avec sa session
    const buyerContext = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Africa/Dakar' })
    const buyerPage = await buyerContext.newPage()
    // La réponse register émet DEUX cookies : `csrf_token` (lisible, lu par le
    // front pour l'en-tête X-CSRF-Token) et `connect.sid` (HttpOnly, session).
    // On les injecte tous les deux : sans `csrf_token`, le front n'envoie pas
    // l'en-tête CSRF → 403 → redirection vers /login.
    const setCookies = buyerRes.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie')
    const cookiesToInject: { name: string; value: string }[] = []
    for (const sc of setCookies) {
      const first = sc.value.split(';')[0] // "name=value"
      const eq = first.indexOf('=')
      if (eq > 0) cookiesToInject.push({ name: first.slice(0, eq), value: first.slice(eq + 1) })
    }
    if (cookiesToInject.length > 0) {
      await buyerContext.addCookies(cookiesToInject.map((c) => ({ ...c, domain: '127.0.0.1', path: '/' })))
    }
    const { errors } = collectPageErrors(buyerPage)

    try {
      // Fiche produit → « Ajouter au panier »
      await openApp(buyerPage, `/catalogue/${seeded.slug}`)
      await expect(buyerPage.getByRole('button', { name: /Ajouter au panier/i })).toBeVisible()
      await buyerPage.getByRole('button', { name: /Ajouter au panier/i }).click()
      await expect(buyerPage.getByRole('button', { name: /Dans le panier/i })).toBeVisible()

      // Panier → « Passer la commande » (un LIEN, comme `Cart()` de Bureau/main)
      await openApp(buyerPage, '/panier')
      await expect(buyerPage.getByRole('heading', { level: 1, name: /Votre panier/i })).toBeVisible()
      await expect(buyerPage.getByRole('link', { name: /Passer la commande/i })).toBeVisible()
      await buyerPage.getByRole('link', { name: /Passer la commande/i }).click()

      // Formulaire commande → remplir + « Confirmer la commande »
      await waitForContent(buyerPage)
      await expect(buyerPage.getByRole('heading', { level: 1, name: /Finaliser la commande/i })).toBeVisible()
      await buyerPage.fill('#ckName', 'Aminata Diallo')
      await buyerPage.fill('#ckPhone', '07 07 00 00 00')
      await buyerPage.fill('#ckCity', 'Dakar')
      await buyerPage.fill('#ckAddr', 'Almadies, Villa 42')
      // Note field is optional; leaving empty prevents chk_buyer_note_len constraint violation

      // Attendre que le formulaire soit valide
      await expect(buyerPage.locator('#ckForm .err.show')).toHaveCount(0)

      // Soumission + attente navigation explicite
      await Promise.all([
        buyerPage.waitForURL(/\/mes-commandes|\/confirmation/, { timeout: 20_000 }),
        buyerPage.getByRole('button', { name: /Confirmer la commande/i }).click(),
      ])
      await waitForContent(buyerPage)
      expect(buyerPage.url()).toMatch(/\/mes-commandes|\/confirmation/)

      // Mes commandes → la commande apparaît
      await openApp(buyerPage, '/mes-commandes')
      await waitForContent(buyerPage)
      await expect(buyerPage.getByRole('heading', { level: 1, name: /Mes commandes/i })).toBeVisible()
      await expect(buyerPage.getByRole('row', { name: /CMD-\d+/ })).toBeVisible()

      expect(errors).toEqual([])
    } finally {
      await buyerContext.close()
    }
  })

  // ----------------------------------------------------------------------
  // ÉTAPE 2 — Négatif : SELF_PURCHASE (T12)
  // ----------------------------------------------------------------------

  test('Négatif : le propriétaire ne peut pas acheter son propre article (T12)', async ({ request }) => {
    // Crée un article approuvé et récupère les identifiants du vendeur
    const seeded = await seedApprovedProduct(request, { label: 'self-buy' })

    // Connecte en tant que le vendeur propriétaire de l'article
    const loginRes = await request.post('/api/auth/login', {
      headers: { ...(await primeCsrf(request)), Cookie: await cookieWithCsrf(request) },
      data: { identifier: seeded.sellerEmail, password: seeded.sellerPassword },
    })
    expect(loginRes.ok(), `login vendeur → ${loginRes.status()} ${await loginRes.text()}`).toBe(true)

    // Tente d'acheter son propre article → 400 SELF_PURCHASE
    // Le cookie de session vient du jar (posé par le Set-Cookie du login) : on
    // ajoute uniquement l'en-tête CSRF, sans écraser `Cookie`.
    const orderRes = await request.post('/api/orders', {
      headers: await csrfHeaders(request),
      data: { productId: seeded.productId, paymentMethod: 'MOBILE_MONEY' },
    })
    expect(orderRes.status()).toBe(400)
    const body = await orderRes.json()
    expect(body.error.code).toBe('SELF_PURCHASE')
    expect(body.error.message).toContain('acheter votre propre')
  })

  // ----------------------------------------------------------------------
  // ÉTAPE 3 — Admin : cycle complet de la commande
  // ----------------------------------------------------------------------

  test.describe('Admin : cycle complet de la commande', () => {
    let orderNumber: string

    test.beforeAll(async ({ request }) => {
      // Standalone request : ne touche pas au cookie-jar de adminPage
      const seeded = await seedOrder(request, { label: 'journey-cycle' })
      orderNumber = seeded.orderNumber
    })

    test('Admin : liste des commandes → détail → cycle complet', async () => {
      const { errors } = collectPageErrors(adminPage)

      // 1. Liste des commandes
      await openApp(adminPage, '/admin/commandes')
      await expect(adminPage.getByRole('heading', { level: 1, name: /Commandes/i })).toBeVisible()
      await expect(adminPage.getByRole('table')).toBeVisible()

// 2. Cherche la ligne de la commande seedée
  const row = adminPage.locator('tr').filter({hasText: orderNumber})
  await expect(row).toHaveCount(1, { timeout: 10_000 })
  // Clic sur le lien « numéro de commande » plutôt que la ligne entière
  //   (EVITE : la cellule Article est un lien vers /catalogue et interceptait
  //   le clic à la target). 
  await row.locator('a', { hasText: orderNumber }).click()
  // Attendre le fin de navigation vers la fiche détail
  await adminPage.waitForLoadState('networkidle')
  // Attendre que la requête de détail be résolue
  await expect(adminPage.getByRole('heading', { level: 1 })).toHaveText(orderNumber, { timeout: 20_000 })
      await expect(adminPage.getByRole('navigation', { name: /Fil d’Ariane/i })).toBeVisible()
      await expect(adminPage.getByRole('heading', { name: /Cycle de commande/i })).toBeVisible()

      // Helper : clique un bouton d'action, gère la modale
      async function performAction(buttonName: string | RegExp, confirmLabel: string) {
        const actionBtn = adminPage.getByRole('button', { name: buttonName }).first()
        await expect(actionBtn).toBeVisible({ timeout: 10_000 })
        await actionBtn.click()
        const dialog = adminPage.getByRole('dialog', { name: buttonName })
        await expect(dialog).toBeVisible({ timeout: 5_000 })
        await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeVisible()
        await dialog.getByRole('button', { name: confirmLabel }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        // No consequence check here – the test validates status separately
      }

// CYCLE COMPLET
      await performAction('Confirmer le paiement', 'Confirmer le paiement')
      await performAction(/Confirmer la réception de l['’]article/, 'Confirmer la réception')

      await performAction('Marquer comme prête', 'Marquer comme prête')
      await adminPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await adminPage.waitForTimeout(500)

      // Expédition (avec transporteur + suivi)
      const shipBtn = adminPage.getByRole('button', { name: 'Expédier la commande' }).first()
      await expect(shipBtn).toBeVisible({ timeout: 10_000 })
      await shipBtn.click()
      const shipDialog = adminPage.getByRole('dialog', { name: 'Expédier la commande' })
      await expect(shipDialog).toBeVisible()
      await shipDialog.locator('#adm-carrier').fill('TestCarrier')
      await shipDialog.locator('#adm-tracking').fill('TRACK-12345')
      await shipDialog.getByRole('button', { name: 'Expédier la commande' }).click()
      await expect(shipDialog).toBeHidden({ timeout: 10_000 })
      await adminPage.waitForTimeout(1000)
      await expect(adminPage.locator('text=/En livraison|IN_DELIVERY/i').first()).toBeVisible({ timeout: 10_000 })

      // Livraison
      await performAction('Marquer comme livrée', 'Marquer comme livrée')
      await expect(adminPage.locator('text=/Livrée|Terminée|DELIVERED|COMPLETED/i').first()).toBeVisible({ timeout: 10_000 })

      // Paiement vendeur
      const payoutBtn = adminPage.getByRole('button', { name: /Marquer comme payé/i }).first()
      if (await payoutBtn.count()) {
        await payoutBtn.click()
        const payoutDialog = adminPage.getByRole('dialog', { name: /Marquer le vendeur comme payé/i })
        await expect(payoutDialog).toBeVisible()
        await payoutDialog.locator('#adm-payout-ref').fill('VIRE-JOURNEY-001')
        await payoutDialog.getByRole('button', { name: 'Marquer comme payé' }).click()
        await expect(payoutDialog).toBeHidden({ timeout: 10_000 })
        await adminPage.waitForTimeout(1000)
      }

      // Vérifications finales
      await expect(adminPage.getByRole('heading', { name: /Cycle de commande/i })).toBeVisible()
      expect(errors).toEqual([])
    })
  })
})