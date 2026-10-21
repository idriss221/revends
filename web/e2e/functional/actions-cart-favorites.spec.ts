import { test, expect, type Page } from '@playwright/test'
import {
  closeSharedPage, openApp, seedApprovedProduct, sharedPage,
} from '../lib/fixtures'

/**
 * ACTIONS PANIER & FAVORIS — les gestes réels que la suite ne prouvait pas.
 *
 * Les specs existantes vérifient surtout des chemins heureux « une fois » :
 *   · `order-journey` : ajouter → commander (jamais les bornes, le retrait, le
 *     vidage ni la persistance).
 *
 * Ici on cible les **actions** et leurs **cas limites** (CA-V5 panier/favoris,
 * cf. `strategie-tests` : heureux + bornes + vide) :
 *   · panier : bornes 1..9 (boutons désactivés), persistance au F5,
 *     retrait d'une ligne → état vide, vidage ;
 *   · favoris : ajout, badge, écran `/favoris`, retrait → état vide.
 *
 * ## Session
 * `anon` : aucune session → le panier/favoris vivent en **localStorage**
 *          (clés `revends-cart`, `revends:favorites*`), donc testables sans
 *          bruit serveur. Les comptes se créent via l'API (voir fixtures).
 */
test.describe('Panier & favoris — actions réelles (React)', () => {
  let anon: Page

  test.beforeAll(async ({ browser }) => {
    anon = await sharedPage(browser)
  })

  test.afterAll(async () => {
    await closeSharedPage(anon)
  })

  // ------------------------------------------------------------------------
  // Panier
  // ------------------------------------------------------------------------

  test('panier : bornes 1..9, persistance F5, retrait, vidage', async ({ request }) => {
    const seeded = await seedApprovedProduct(request, { label: 'act-cart' })

    // — Ajout depuis la fiche produit -------------------------------------
    await openApp(anon, `/catalogue/${seeded.slug}`)
    await anon.getByRole('button', { name: /Ajouter au panier/ }).click()

    // Le badge de la navbar reflète le panier (source de vérité = contexte).
    await expect(anon.getByRole('link', { name: /^Panier \(1 article\)$/ })).toBeVisible()

    // — Page panier : une ligne, quantité 1, décrément déjà borné ---------
    await openApp(anon, '/panier')
    await expect(anon.getByRole('heading', { level: 1, name: 'Votre panier' })).toBeVisible()

    // La référence (`Cart()`) rend chaque ligne en `<div class="line">`, pas en `<li>`.
    const line = anon.locator('.line').filter({ hasText: seeded.name })
    await expect(line).toHaveCount(1)
    const qty = line.locator('[aria-live="polite"]')
    const inc = line.getByRole('button', { name: 'Augmenter la quantité' })
    const dec = line.getByRole('button', { name: 'Diminuer la quantité' })

    await expect(qty).toHaveText('1')
    await expect(dec, 'borne basse : on ne descend pas sous 1').toBeDisabled()

    // — Montée jusqu'au plafond 9 (MAX_QTY) -------------------------------
    for (let i = 0; i < 8; i++) await inc.click()
    await expect(qty).toHaveText('9')
    await expect(inc, 'borne haute : on ne monte pas au-delà de 9').toBeDisabled()

    // — Persistance au rechargement (panier anonyme = localStorage) -------
    await anon.reload()
    await expect(anon.getByRole('heading', { level: 1, name: 'Votre panier' })).toBeVisible()
    await expect(line.locator('[aria-live="polite"]')).toHaveText('9')

    // — Retrait de la ligne → état vide -----------------------------------
    await anon.getByRole('button', { name: 'Retirer', exact: true }).click()
    await expect(anon.getByText('Votre panier est vide')).toBeVisible()
    await expect(line).toHaveCount(0)

    // — Ré-ajout puis retrait : le panier finit à zéro ---------------------
    await openApp(anon, `/catalogue/${seeded.slug}`)
    await anon.getByRole('button', { name: /Ajouter au panier/ }).click()
    await openApp(anon, '/panier')
    await expect(line).toHaveCount(1)
    // Pas de « Vider le panier » : c'est un marqueur de l'ancienne interface.
    // On vide ligne par ligne, comme `Cart()` de Bureau/main.
    await anon.getByRole('button', { name: 'Retirer', exact: true }).click()
    await expect(anon.getByText('Votre panier est vide')).toBeVisible()
    await expect(anon.getByRole('link', { name: /^Panier$/ })).toBeVisible()
  })

  // ------------------------------------------------------------------------
  // Favoris
  // ------------------------------------------------------------------------

  test('favoris : ajout, badge, écran /favoris, retrait → vide', async ({ request }) => {
    const seeded = await seedApprovedProduct(request, { label: 'act-fav' })

    await openApp(anon, `/catalogue/${seeded.slug}`)

    // Le bouton expose un libellé d'action exploitable par lecteur d'écran.
    const addFav = anon.getByRole('button', { name: 'Ajouter aux favoris', exact: true })
    await expect(addFav).toHaveAttribute('aria-pressed', 'false')
    await addFav.click()
    // Après bascule, le même bouton devient « Retirer… » (aria-pressed=true).
    await expect(anon.getByRole('button', { name: 'Retirer des favoris', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(anon.getByRole('link', { name: /^Favoris \(1 article\)$/ })).toBeVisible()

    // — Écran favoris : la carte de l'article est bien rendue -------------
    await openApp(anon, '/favoris')
    await expect(anon.getByRole('heading', { level: 1, name: 'Vos favoris' })).toBeVisible()
    await expect(anon.getByRole('link', { name: new RegExp(seeded.name) }).first()).toBeVisible()

    // — Retrait depuis l'écran favoris → état vide dédié ------------------
    await anon.getByRole('button', { name: /^Retirer des favoris/ }).click()
    await expect(anon.getByText("Aucun favori pour l'instant")).toBeVisible()
  })
})
