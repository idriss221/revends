import { test, expect, type Page } from '@playwright/test'
import { CATEGORY, PHOTOS_3, closeSharedPage, openApp, registerSeller, sharedPage } from '../lib/fixtures'
import { findPendingRow } from '../helpers/navigation'

/**
 * PUBLICATION D'UN ARTICLE + MODÉRATION — parcours vertical complet.
 *
 * Couvre des ACTIONS que la suite ne prouvait pas de bout en bout :
 *   · le **formulaire de vente React** (`/sell`) : bouton désactivé sous 3
 *     photos (règle métier), puis soumission invalide (3 photos jointes mais
 *     champs texte vides) → erreurs par champ, jamais de navigation ; enfin une
 *     soumission valide crée l'article et l'affiche côté vendeur ;
 *   · la **modération admin** par le REFUS motivé (motif fermé
 *     `REJECTION_REASONS`) ;
 *   · la **boucle** : le vendeur voit ensuite « Refusé : <motif> » sur la page
 *     React `/mes-articles`.
 *
 * L'ancien formulaire Bureau (`#/sell`) a été supprimé : la vente passe par la
 * vue React `SellView` (guard `RequireUser`). Les champs portent les ids de la
 * maquette de référence (`sTitle`, `sCat`, `sSubcat`, `sCond`, `sDesc`,
 * `sPrice`, `sLoc`) et la soumission est le bouton « 6 · Publier l'article » —
 * il n'y a PAS de bouton « Suivant » dans la référence (formulaire unique,
 * `.steps` purement décoratif).
 *
 * `product-lifecycle.spec.ts` couvre déjà l'approbation/la suppression via
 * l'API : ici on passe par **l'UI réelle** (formulaire vendeur + modales admin).
 */
test.describe('Publication React + refus admin', () => {
  let shopper: Page
  let admin: Page

  test.beforeAll(async ({ browser }) => {
    shopper = await sharedPage(browser)
    admin = await sharedPage(browser, { admin: true })
    await registerSeller(shopper, 'act-publish')
  })

  test.afterAll(async () => {
    await closeSharedPage(shopper)
    await closeSharedPage(admin)
  })

  test('sell : erreurs de validation puis publication → refus admin → motif visible', async () => {
    // (1) Accès au formulaire de vente React (vue protégée, session déjà ouverte).
    await openApp(shopper, '/sell')
    await expect(shopper.getByRole('heading', { level: 1, name: 'Publier un article' })).toBeVisible()

    // (2) Cas limite : le bouton « Publier » est conditionné au minimum de
    //     3 photos. On joint donc d'abord 3 photos pour l'activer, puis on
    //     soumet le formulaire encore VIDE sur les champs texte : les erreurs
    //     par champ (titre, catégorie, prix…) s'affichent toujours, sans
    //     navigation. L'intention d'origine (valider les champs texte) est
    //     préservée, et la nouvelle règle photos est prouvée (disabled → enabled).
    const publishBtn = shopper.getByRole('button', { name: /Publier l’article/ })
    await expect(publishBtn).toBeDisabled()
    await shopper.locator('input[type="file"]').setInputFiles(PHOTOS_3)
    await expect(publishBtn).toBeEnabled()
    await publishBtn.click()
    await expect(shopper.locator('#sTitle')).toHaveAttribute('aria-invalid', 'true')
    await expect(shopper.locator('#sTitle ~ [role="alert"]').first()).toHaveText(/au moins 3 caractères/)
    await expect(shopper.locator('#sCat ~ [role="alert"]')).toBeVisible()
    await expect(shopper.locator('#sPrice ~ [role="alert"]')).toBeVisible()
    await expect(shopper.getByText('Veuillez corriger les champs marqués en rouge.')).toBeVisible()
    expect(shopper.url(), 'aucune publication déclenchée').toContain('/sell')

    // (3) Chemin heureux : on remplit les champs texte (les 3 photos sont déjà
    //     jointes — RG-MEDIA-1 exige 3 photos minimum), on publie et on attend
    //     la création côté API.
    const title = `Lampe artisanale e2e ${Date.now().toString(36)}`
    await shopper.fill('#sTitle', title)
    await shopper.selectOption('#sCat', String(CATEGORY.categoryId))
    await expect(shopper.locator('#sSubcat')).toBeEnabled()
    const subValues = await shopper
      .locator('#sSubcat option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ''))
    expect(subValues.length, 'sous-catégories disponibles').toBeGreaterThan(0)
    await shopper.selectOption('#sSubcat', subValues[0]!)
    await shopper.selectOption('#sCond', 'Bon état')
    await shopper.fill('#sPrice', '25000')
    await shopper.fill('#sLoc', 'Abidjan, Cocody')
    await shopper.fill('#sDesc', 'Lampe en laiton, quelques traces d’usage, fonctionne parfaitement.')
    // Les 3 fichiers sont réellement pris en compte : 3 aperçus rendus.
    await expect(shopper.locator('.pv img')).toHaveCount(3)
    await expect(shopper.locator('input[type="file"]').locator('..').getByText(/photo/i).first())
      .toBeVisible()

    const [createRes] = await Promise.all([
      shopper.waitForResponse((r) => r.url().includes('/api/products') && r.request().method() === 'POST'),
      shopper.getByRole('button', { name: /Publier l’article/ }).click(),
    ])
    expect(createRes.status(), 'création acceptée par l’API').toBe(201)
    const body = await createRes.json()
    const productId = (body.product?.id ?? body.id) as number
    expect(productId).toBeGreaterThan(0)

    // Après soumission, la page de confirmation s'affiche.
    await expect(shopper).toHaveURL(/\/confirmation$/)
    await expect(shopper.getByRole('heading', { level: 1, name: 'Article soumis avec succès !' })).toBeVisible()

    // (4) Le vendeur retrouve son annonce « En attente » dans /mes-articles.
    await openApp(shopper, '/mes-articles')
    await expect(shopper.getByRole('heading', { level: 1, name: 'Mes articles' })).toBeVisible()
    const sellerRow = shopper.getByRole('row', { name: new RegExp(title) })
    await expect(sellerRow).toBeVisible()
    await expect(sellerRow.getByText('En attente')).toBeVisible()

    // (5) Refus admin motivé via l'UI (motif dans la liste fermée).
    const reason = 'Photos insuffisantes'
    await admin.goto('/admin/articles-en-attente')
    // File PENDING en FIFO + paginée : l'article vient d'être créé, il peut
    // être en page 2. `findPendingRow` parcourt les pages (cf. navigation.ts).
    const adminRow = await findPendingRow(admin, title)
    await expect(adminRow).toBeVisible()
    await adminRow.getByRole('button', { name: new RegExp(`Refuser l['’]article « ${title} »`) }).click()

    const dialog = admin.getByRole('dialog', { name: new RegExp(`Refuser « ${title}`) })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('radio', { name: reason }).check()
    const [rejectRes] = await Promise.all([
      admin.waitForResponse((r) => r.url().includes(`/api/admin/products/${productId}/reject`) && r.request().method() === 'POST'),
      dialog.getByRole('button', { name: 'Confirmer le refus' }).click(),
    ])
    expect(rejectRes.status(), 'refus accepté par l’API').toBe(200)
    await expect(dialog).toBeHidden()

    // (6) Plus en attente de modération.
    await admin.goto('/admin/articles-en-attente')
    await expect(admin.getByRole('row', { name: new RegExp(title) })).toHaveCount(0)

    // (7) Le vendeur voit le refus ET son motif (boucle complète).
    //     On recharge : l'écran `/mes-articles` était déjà monté (étape 4),
    //     et React Query servirait un cache « En attente ».
    await openApp(shopper, '/confirmation')
    await shopper.reload()
    await openApp(shopper, '/mes-articles')
    await expect(shopper.getByRole('heading', { level: 1, name: 'Mes articles' })).toBeVisible()
    const rejectedRow = shopper.getByRole('row', { name: new RegExp(title) })
    await expect(rejectedRow).toBeVisible()
    await expect(rejectedRow.getByText('Refusé', { exact: true })).toBeVisible()
    await expect(rejectedRow.getByText(`Refusé : ${reason}`)).toBeVisible()
  })
})

