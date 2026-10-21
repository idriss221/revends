import { test, expect, type Page } from '@playwright/test'
import {
  closeSharedPage, openApp, seedApprovedProduct, sharedPage,
} from '../lib/fixtures'

/**
 * RECHERCHE RÉELLE & CAS LIMITES DE PARCOURS.
 *
 * La suite prouvait déjà la recherche **sans** résultat (`public.spec` →
 * EmptyState) et la suggestion du champ. Il manquait :
 *   · la recherche **avec** résultat réel (requête qui remonte un article) et
 *     son immunité à la casse (ILIKE côté API) ;
 *   · deux **404 explicites** (catégorie inconnue, article inconnu) : l'erreur
 *     doit être lisible, jamais une page blanche ni un crash ;
 *   · le **guichet de connexion au checkout** : un anonyme remplit le
 *     formulaire, mais confirmer exige un compte → message + redirection.
 */
test.describe('Recherche & cas limites de parcours', () => {
  let guest: Page
  let seeded: { productId: number; slug: string; name: string }
  const label = `srch-${Date.now().toString(36)}`

  test.beforeAll(async ({ browser, request }) => {
    guest = await sharedPage(browser)
    seeded = await seedApprovedProduct(request, { label })
  })

  test.afterAll(async () => {
    await closeSharedPage(guest)
  })

  test('recherche : un terme réel remonte l’article, casse ignorée', async () => {
    await openApp(guest, `/search?q=${label}`)
    const h1 = guest.getByRole('heading', { level: 1 })
    // Insensible à la casse : le titre démarre par « Résultats » (R majuscule).
    await expect(h1).toContainText(/résultats?/i)
    await expect(h1).toContainText(`« ${label} »`)
    // L'article seedé (unique porteur du jeton) est bien dans les résultats.
    await expect(guest.getByRole('heading', { name: seeded.name })).toBeVisible()

    // Même requête en MAJUSCULES → l'API est insensible à la casse (ILIKE).
    await openApp(guest, `/search?q=${label.toUpperCase()}`)
    await expect(guest.getByRole('heading', { level: 1 })).toContainText(`« ${label.toUpperCase()} »`)
    await expect(guest.getByRole('heading', { name: seeded.name })).toBeVisible()
  })

  test('catégorie inconnue → 404 explicite, pas une page blanche', async () => {
    await openApp(guest, `/category/categorie-inexistante-zzz`)
    await expect(guest.getByRole('heading', { name: 'Catégorie introuvable (404)' })).toBeVisible()
    // Apostrophe droite côté source : on tolère les deux glyphes (’, ').
    await expect(guest.getByText(/Cette catégorie n.existe pas ou n.est plus active\./)).toBeVisible()
    await expect(guest.getByRole('link', { name: /Retour à l.accueil/ })).toBeVisible()
  })

  test('article inconnu → état d’erreur lisible et rattrapable', async () => {
    // Pas d'`openApp` : la vue d'erreur n'a pas de <h1> (donc `waitForContent`
    // est inadapté). On charge le document directement sur la fiche fantôme.
    await guest.goto('/catalogue/article-inexistant-zzz')
    const alert = guest.locator('main').getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Article introuvable')
    await expect(alert).toContainText('PRODUCT_NOT_FOUND')
  })

  test('checkout anonyme : formulaire rempli mais confirmation réservée aux connectés', async () => {
    // Ajouter l'article seedé au panier depuis sa fiche réelle.
    await openApp(guest, `/catalogue/${seeded.slug}`)
    await expect(guest.getByRole('heading', { level: 1, name: seeded.name })).toBeVisible()
    await guest.getByRole('button', { name: 'Ajouter au panier' }).click()

    // Arriver au guichet : le formulaire de livraison s'affiche pour un anonyme.
    await openApp(guest, '/commande')
    await expect(guest.getByRole('heading', { level: 1, name: 'Finaliser la commande' })).toBeVisible()

    await guest.locator('#ckName').fill('Aïcha Koné')
    await guest.locator('#ckPhone').fill('07 07 00 00 00')
    await guest.locator('#ckCity').fill('Abidjan')
    await guest.locator('#ckAddr').fill('Cocody, rue des Jardins')

    await guest.getByRole('button', { name: 'Confirmer la commande' }).click()

    // On n'est PAS commandé : message d'info + renvoi vers la connexion.
    await expect(guest.getByText('Connectez-vous pour confirmer votre commande.')).toBeVisible()
    await expect.poll(() => guest.evaluate(() => location.pathname)).toBe('/login')
    await expect.poll(() => guest.evaluate(() => location.search)).toContain('next=%2Fcommande')
  })
})
