import { test, expect, type Page } from '@playwright/test'
import {
  closeSharedPage,
  collectPageErrors,
  createProductViaApi,
  csrfHeaders,
  openApp,
  primeCsrf,
  registerSeller,
  sharedPage,
} from '../lib/fixtures'
import { findPendingRow } from '../helpers/navigation'

/**
 * APPROBATION ADMIN → FICHE PUBLIQUE → PANIER → COMMANDE (parcours réel).
 *
 * Ce que la suite ne prouvait pas encore :
 *   · `product-lifecycle` approuve et supprime, mais ne **rouvre jamais** la
 *     fiche publique après approbation ;
 *   · `actions-cart-favorites` ajoute au panier depuis une fiche **déjà**
 *     approuvée par `seedApprovedProduct`, sans passer par l'UI d'approbation ;
 *   · `order-journey` enchaîne panier → commande sur un article seedé, jamais
 *     sur un article qui vient d'être approuvé dans la même exécution.
 *
 * Le bug historique visé : après approbation, la fiche publique n'affichait
 * plus le bouton « Ajouter au panier » (bouton conditionné par un statut qui
 * n'était pas rafraîchi). Le test rejoue donc **le chemin complet**, avec les
 * vrais libellés du code (`ProductView.tsx`, `CartView.tsx`, `CheckoutView.tsx`).
 *
 * ## Critères couverts
 *   · l'article naît PENDING et n'est pas public (GET → 404) ;
 *   · l'admin l'approuve depuis « Articles en attente » (UI + modale réelle,
 *     `POST /api/admin/products/:id/approve` → 200) ;
 *   · la fiche publique expose « Ajouter au panier » (le bug visé) ;
 *   · le clic ajoute l'article : bouton « Dans le panier » + badge
 *     « Panier (1 article) » ;
 *   · `/panier` contient la ligne **et son prix** (25 000 FCFA) ;
 *   · « Passer la commande » mène bien à `/commande` (aucun paiement réel) ;
 *   · aucune erreur console / `pageerror` / 404 sur le parcours acheteur.
 *
 * ## Sessions (contrainte `/api/auth` : 20 appels / 10 min)
 *   · `seller` : page **sans chargement de document** (uniquement `request`)
 *     → 0 appel `/auth/me` ; il crée l'article, comme un vrai vendeur ;
 *   · `admin` : une page partagée, chargée une fois ;
 *   · `buyer` : une page **acheteur réel** partagée (inscription API avant le
 *     premier chargement → session valide, panier **serveur**). Un acheteur
 *     anonyme produirait un `GET /api/auth/me` → 401 attendu côté app, que
 *     Chrome journalise en erreur console : on veut au contraire un parcours
 *     sans aucune erreur parasite.
 *   Total : ~2 chargements de document pour toute la spec.
 */
test.describe('Approbation admin → fiche publique → panier → commande', () => {
  let seller: Page
  let admin: Page
  let buyer: Page

  /** Inscrit l'acheteur AVANT le premier chargement : sa session est déjà posée. */
  async function registerBuyer(page: Page, label: string): Promise<void> {
    const email = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}@test.revends`
    const res = await page.request.post('/api/auth/register', {
      headers: await primeCsrf(page.request),
      data: {
        displayName: `Acheteur ${label.replace(/[^A-Za-z0-9]/g, ' ')}`,
        name: `Acheteur ${label.replace(/[^A-Za-z0-9]/g, ' ')}`,
        email,
        phone: `76${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
        password: 'Acheteur-Recette-42!',
        acceptedCgu: true,
      },
    })
    expect(res.ok(), `inscription acheteur → ${res.status()} ${await res.text()}`).toBe(true)
  }

  test.beforeAll(async ({ browser }) => {
    seller = await sharedPage(browser)
    admin = await sharedPage(browser, { admin: true })
    buyer = await sharedPage(browser)
    // 2 inscriptions (~2 appels /api/auth) ; l'acheteur n'a pas encore chargé
    // de document : son cookie de session sera valide dès le `page.goto`.
    await registerSeller(seller, 'e2e-approval-cart')
    await registerBuyer(buyer, 'e2e-approval-buy')
  })

  test.afterAll(async () => {
    await Promise.all(
      [seller, admin, buyer].map((page) => closeSharedPage(page).catch(() => undefined)),
    )
  })

  test('article PENDING → approbation UI → « Ajouter au panier » → /panier avec prix → /commande', async () => {
    const name = `Article approuvé panier e2e ${Date.now().toString(36)}`

    // — 0. Le vendeur crée l'article AVEC ses 3 photos (multipart réel) —————
    const product = await createProductViaApi(seller.request, name)

    // Un PENDING est masqué au public (CA-CAT03-04) : on ne peut pas encore
    // ouvrir sa fiche, donc pas de bouton panier possible à ce stade.
    const beforeApproval = await seller.request.get(`/api/products/${product.id}`)
    expect(beforeApproval.status(), 'un article PENDING ne doit pas être public').toBe(404)

    // — 1. L'admin l'approuve depuis la file de modération (UI réelle) ——————
    await openApp(admin, '/admin/articles-en-attente')
    // File FIFO paginée 12/page : un article tout juste créé peut être en
    // dernière page, `findPendingRow` pagine jusqu'à lui.
    const row = await findPendingRow(admin, name)
    await expect(row, 'l’article en attente doit apparaître dans la file admin').toBeVisible()
    await row.getByRole('button', { name: /Approuver/i }).click()

    const approveDialog = admin.getByRole('dialog')
    await expect(approveDialog).toBeVisible()
    const approveResponsePromise = admin.waitForResponse(
      (r) => r.url().includes('/approve') && r.request().method() === 'POST',
    )
    await approveDialog.getByRole('button', { name: /Confirmer l['’]approbation/i }).click()
    const approveResponse = await approveResponsePromise
    expect(approveResponse.status(), 'la mutation approve doit réussir (pas 403 CSRF)').toBe(200)
    await expect(approveDialog).toBeHidden({ timeout: 15_000 })

    // — 2. La fiche publique est désormais visible (API, puis UI) ——————————
    const afterApproval = await seller.request.get(`/api/products/${product.id}`)
    expect(afterApproval.status(), 'approuvé = visible au public').toBe(200)
    const detail = (await afterApproval.json()) as {
      id: number
      status: string
      price: number
      images: unknown[]
      seller: { id: number }
    }
    expect(detail.id).toBe(product.id)
    expect(detail.status, 'approbation → AVAILABLE').toBe('AVAILABLE')
    expect(detail.price, 'le prix créé par la fixture').toBe(25000)
    expect(detail.images, 'l’article a bien ses 3 photos').toHaveLength(3)

    const { errors } = collectPageErrors(buyer)

    // — 3. Le bug historique : le bouton panier doit être présent ——————————
    await openApp(buyer, `/catalogue/${product.slug}`)
    await expect(buyer.getByRole('heading', { level: 1, name })).toBeVisible()
    const addToCart = buyer.getByRole('button', { name: /Ajouter au panier/i })
    await expect(addToCart, 'après approbation, la fiche doit proposer « Ajouter au panier »').toBeVisible()

    // — 4. Le clic ajoute réellement l'article au panier ————————————————————
    await addToCart.click()
    await expect(buyer.getByRole('button', { name: /Dans le panier/i })).toBeVisible()
    // Badge de la navbar : source de vérité = contexte panier.
    await expect(buyer.getByRole('link', { name: /^Panier \(1 article\)$/ })).toBeVisible()

    // — 5. /panier contient l'article ET son prix ——————————————————————————
    await openApp(buyer, '/panier')
    await expect(buyer.getByRole('heading', { level: 1, name: 'Votre panier' })).toBeVisible()
    const line = buyer.locator('.line').filter({ hasText: name })
    await expect(line, 'le panier doit contenir exactement la ligne de l’article').toHaveCount(1)
    // Le titre de la ligne est un lien (`.nm a`) — on cible ce lien exact :
    // `getByRole('link', { name })` matcherait aussi le lien image (aria-label
    // « Voir … »), d'où le strict-mode de Playwright.
    await expect(line.locator('.nm a')).toHaveText(name)
    // `CartView.CartLine` rend `fmt(item.price * item.qty)` dans `.pr`.
    await expect(line.locator('.pr')).toHaveText('25 000 FCFA')
    // Récapitulatif : le total reprend le prix (quantité 1).
    await expect(buyer.locator('.box .sum')).toContainText('25 000 FCFA')

    // — 6. Le bouton de commande existe et mène à /commande ————————————————
    const checkoutLink = buyer.getByRole('link', { name: /Passer la commande/i })
    await expect(checkoutLink).toBeVisible()
    await checkoutLink.click()
    await expect(buyer, '« Passer la commande » doit mener à /commande').toHaveURL(/\/commande$/)
    await expect(buyer.getByRole('heading', { level: 1, name: 'Finaliser la commande' })).toBeVisible()
    // Formulaire réel prêt à saisir — on s'arrête là : aucun paiement joué.
    await expect(buyer.locator('#ckForm')).toBeVisible()
    await expect(buyer.locator('#ckName')).toBeVisible()

    // — 7. Aucune erreur console / pageerror / 404 pendant le parcours ——————
    expect(errors).toEqual([])

    // — 8. Nettoyage : suppression admin (204) de l'article jetable —————————
    const deleteRes = await admin.request.delete(`/api/admin/products/${product.id}`, {
      headers: await csrfHeaders(admin.request),
    })
    expect(deleteRes.status(), 'nettoyage : DELETE admin → 204').toBe(204)
    const gone = await seller.request.get(`/api/products/${product.id}`)
    expect(gone.status(), 'l’article nettoyé a disparu du catalogue').toBe(404)
  })
})
