import { test, expect, type Page } from '@playwright/test'
import { createProductViaApi, closeSharedPage, csrfHeaders, openApp, registerSeller, sharedPage } from '../lib/fixtures'
import { findPendingRow, spaGoto } from '../helpers/navigation'

/**
 * Cycle de vie réel d'un article (CA-V5-056…065) — le cœur de la vague 1 côté API.
 *
 * Le test est **autonome et répétable** : il inscrit un vendeur neuf, crée un
 * article jetable via l'API (l'UI exige 3 photos, inutile pour prouver le
 * contrat admin), puis joue les mutations admin réelles :
 *
 *   1. `POST /api/admin/products/:id/approve` → l'article devient `AVAILABLE` ;
 *   2. `DELETE /api/admin/products/:id` → **204 sans corps**, idempotent
 *      (2ᵉ appel = 204, jamais d'erreur) ;
 *   3. l'article a disparu du catalogue **et** la suppression est tracée dans
 *      l'historique.
 *
 * Le 404 `PRODUCT_NOT_FOUND` et le 409 `PRODUCT_HAS_ACTIVE_ORDER` sont couverts
 * par les tests unitaires (`src/lib/api.test.ts`) : fabriquer ici une commande
 * active exigerait un second compte, un paiement et un cycle complet.
 *
 * ## Deux pages, deux rôles — et pourquoi
 *
 * · `seller` : inscribed **une seule fois** pour toute la spec. Il ne fait
 *   qu'utiliser `page.request` (l'API), donc **jamais de chargement de
 *   document** → 0 appel `/auth/me`. C'est lui qui crée les articles : la
 *   création doit être portée par un vendeur, pas par l'admin.
 * · `admin` : une seule page partagée, utilisée pour l'UI et les mutations.
 *
 * Conséquence : si les deux rôles partageaient un contexte, le cookie admin
 * (`connect.sid`) **écraserait** la session vendeur et les articles seraient
 * créés par l'admin — la spec ne prouverait plus le parcours vendeur.
 */
test.describe('cycle de vie admin d’un article (mutations réelles)', () => {
  let seller: Page
  let admin: Page

  test.beforeAll(async ({ browser }) => {
    seller = await sharedPage(browser)
    admin = await sharedPage(browser, { admin: true })
    // Une seule inscription pour les 3 tests (~1 appel /api/auth au lieu de 3).
    await registerSeller(seller, 'e2e-vendeur')
  })

  test.afterAll(async () => {
    await closeSharedPage(seller)
    await closeSharedPage(admin)
  })

  test('création vendeur → approbation → suppression (204 idempotent) → historique', async () => {
    const name = `Article jetable e2e ${Date.now().toString(36)}`
    const product = await createProductViaApi(seller.request, name)

    // — 0. l'article naît PENDING : invisible du catalogue public ————————————
    const catalogue = await seller.request.get(`/api/products/${product.id}`).catch(() => null)
    expect(catalogue?.status() ?? 404, 'un PENDING ne doit pas être public').toBe(404)

    // — 1. l'admin le voit dans « Articles en attente » et l'approuve ————————
    await openApp(admin, '/admin/articles-en-attente')
    // File PENDING en FIFO + paginée (12/page) : l'article jetable vient d'être
    // créé, il est en **dernière** page. `findPendingRow` pagine jusqu'à lui.
    const row = await findPendingRow(admin, name)
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: /Approuver/i }).click()
    const approveDialog = admin.getByRole('dialog')
    await expect(approveDialog).toBeVisible()
    // Le libellé du bouton de confirmation est imposé par `ConfirmAction`
    // (`confirmLabel="Confirmer l'approbation"`), pas « Approuver ».
    const approveResponsePromise = admin.waitForResponse(
      (r) => r.url().includes('/approve') && r.request().method() === 'POST',
    )
    await approveDialog.getByRole('button', { name: /Confirmer l['’]approbation/i }).click()
    const approveResponse = await approveResponsePromise
    expect(approveResponse.status(), 'aprèm : mutation approve doit réussir (pas 403 CSRF)').toBe(200)
    await expect(approveDialog).toBeHidden({ timeout: 15_000 })

    // l'article est maintenant public
    const nowPublic = await seller.request.get(`/api/products/${product.id}`)
    expect(nowPublic.status(), 'approuvé = visible au public').toBe(200)

    // — 2. suppression : la modale énumère les conséquences, « 204 » au clic ——
    // ⚠️ Il n'existe pas de route `/admin/articles/:id` (la fiche est un
    // panneau, pas une page) : la suppression part de la liste, via le bouton
    // de la ligne. L'ancien `spaGoto('/admin/articles/'+id)` tombait sur le 404
    // de l'app et ne prouvait rien.
    await spaGoto(admin, '/admin/articles')
    const rowToDelete = admin.getByRole('row', { name: new RegExp(name) })
    await expect(rowToDelete).toBeVisible()
    await rowToDelete.getByRole('button', { name: /^Supprimer l['’]article/ }).click()

    const deleteDialog = admin.getByRole('dialog')
    await expect(deleteDialog).toBeVisible()
    // Textes exacts du préréglage `ConfirmDelete` (ConfirmAction §4.4).
    await expect(deleteDialog).toContainText('Cette action est irréversible')
    await expect(deleteDialog).toContainText('quitte le catalogue')
    await expect(deleteDialog).toContainText('notification')
    await expect(deleteDialog).toContainText('Aucune restauration')

    const [deleteResponse] = await Promise.all([
      admin.waitForResponse(
        (r) => r.request().method() === 'DELETE' && r.url().includes(`/api/admin/products/${product.id}`),
      ),
      // Apostrophe **droite** dans `ConfirmDelete.confirmLabel` (« l'article ») —
      // l'apostrophe courbe de la ligne (« l’article ») ne matche pas : d'où la
      // classe `['’]`.
      deleteDialog.getByRole('button', { name: /Supprimer l['’]article/i }).click(),
    ])
    expect(deleteResponse.status(), 'DELETE doit répondre 204 sans corps').toBe(204)
    // Un 204 n'a **pas** de corps (RFC 9110 §15.3.5). Lire `response.text()`
    // après la navigation déclenchée par l'invalidation est impossible
    // (« No data found for resource ») et n'apporterait rien : on prouve
    // l'absence de contenu déclaré, ce qui est l'assertion réelle.
    expect(deleteResponse.headers()['content-length'] ?? '0', '204 = corps vide').toBe('0')

    // — 3. disparition du catalogue + traçabilité ————————————————————————
    const gone = await seller.request.get(`/api/products/${product.id}`)
    expect(gone.status()).toBe(404)

    await spaGoto(admin, '/admin/historique')
    await expect(admin.getByRole('table')).toContainText(name)
  })

  test('le 2ᵉ DELETE renvoie 204 (idempotence) — jamais d’erreur', async () => {
    const product = await createProductViaApi(seller.request, `Idempotence ${Date.now().toString(36)}`)

    const first = await admin.request.delete(`/api/admin/products/${product.id}`, {
      headers: await csrfHeaders(admin.request),
    })
    const second = await admin.request.delete(`/api/admin/products/${product.id}`, {
      headers: await csrfHeaders(admin.request),
    })

    expect(first.status()).toBe(204)
    expect(second.status(), 'CA-V5-056 : le 2ᵉ appel ne doit jamais erreur').toBe(204)
  })

  test('un id inexistant → 404 PRODUCT_NOT_FOUND', async () => {
    const res = await admin.request.delete('/api/admin/products/99999999', {
      headers: await csrfHeaders(admin.request),
    })
    expect(res.status()).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('PRODUCT_NOT_FOUND')
  })
})
