import { test, expect, type Page } from '@playwright/test'
import { closeSharedPage, collectPageErrors, openApp, registerSeller, seedOrder, seedPendingProduct, sharedPage } from '../lib/fixtures'

/**
 * Les 9 écrans admin (spec-admin §6) — parcours de recette.
 *
 * Chaque écran est vérifié sur 3 points non négociables :
 * 1. le `h1` + le contenu réel (pas juste « la page ne plante pas ») ;
 * 2. **zéro erreur console / 404 d'asset** pendant le rendu ;
 * 3. la navigation par URL profonde fonctionne (le tri est une source d'état).
 */
test.describe('admin — 9 écrans', () => {
  // Page partagée : voir `lib/fixtures.ts` pour pourquoi (rate limit `/api/auth`).
  let page: Page

  test.beforeAll(async ({ browser, request }) => {
    // La page « Articles en attente » n'affiche un tableau que s'il existe au
    // moins un article PENDING. Le `globalSetup` purge les PENDING résiduels des
    // comptes de test (hygiène) : on sème donc NOUS-MÊMES l'article à modérer
    // (autonomie de la spec).
    await seedPendingProduct(request)
    page = await sharedPage(browser, { admin: true })
  })
  test.afterAll(async () => {
    await closeSharedPage(page)
  })

  test('dashboard : 4 compteurs, 6 actions, 8 tuiles de progression, accès rapides', async () => {
    const { errors } = collectPageErrors(page)
    await openApp(page, '/admin')

    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
    // 4 StatCard — on scope au bloc de compteurs : les libellés (« Articles en
    // attente », « Utilisateurs »…) sont aussi dans « Actions à effectuer » et
    // « Accès rapides », d'où la violation de mode strict sur `#contenu-admin`.
    const cards = page.getByTestId('admin-stat-cards')
    for (const label of ['Utilisateurs', 'Articles en attente', 'Commandes actives', 'Paiements à payer']) {
      await expect(cards.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(cards.locator('> div')).toHaveCount(4)
    // 6 lignes « Actions à effectuer »
    const actions = page.getByRole('heading', { name: 'Actions à effectuer' }).locator('..')
    await expect(actions.getByRole('link')).toHaveCount(6)
    // 8 tuiles de progression, chacune vers son filtre
    const progression = page.getByRole('heading', { name: 'Progression des commandes' }).locator('..')
    await expect(progression.getByRole('link')).toHaveCount(8)
    // Accès rapides
    await expect(page.getByRole('heading', { name: 'Accès rapides' })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('articles en attente : liste PENDING unique, article accessible au clavier', async () => {
    const { errors } = collectPageErrors(page)
    await openApp(page, '/admin/articles-en-attente')

    await expect(page.getByRole('heading', { level: 1, name: 'Articles en attente' })).toBeVisible()
    // Un seul tableau (pas de doublon de rendu).
    await expect(page.getByRole('table')).toHaveCount(1)
    const table = page.getByRole('table')
    if (await table.locator('tbody tr').count()) {
      // Il n'existe **pas** de route de détail `/admin/articles/:id` : la fiche
      // s'ouvre en panneau. Le chemin vers l'article au clavier est le bouton
      // « Voir l'article » (la ligne cliquable, elle, n'est pas focusable).
      // L'ancienne assertion « 1re cellule = vrai <a href> » testait un design
      // (lien de cellule) qui n'a jamais été livré — voir docs/journal.md.
      await expect(
        table.locator('tbody tr').first().getByRole('button', { name: /^Voir l’article/ }),
      ).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test('articles : filtres (statut + recherche) et compteur « n supprimables »', async () => {
    const { errors } = collectPageErrors(page)
    await openApp(page, '/admin/articles')

    await expect(page.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible()
    await expect(page.getByText(/\d+ produits · \d+ supprimables/)).toBeVisible()
    await expect(page.getByRole('combobox', { name: /statut/i })).toBeVisible()
    await page.getByRole('combobox', { name: /statut/i }).selectOption('PENDING')
    await expect(page).toHaveURL(/status=PENDING/)
    expect(errors).toEqual([])
  })

  test('commandes : la deep link ?status= filtre vraiment la liste', async () => {
    const { errors } = collectPageErrors(page)
    await openApp(page, '/admin/commandes?status=PAYMENT_PENDING')

    await expect(page.getByRole('heading', { level: 1, name: 'Commandes' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: /statut/i })).toHaveValue('PAYMENT_PENDING')
    expect(errors).toEqual([])
  })

  test('détail commande : fil d’Ariane, en-tête, cycle et actions contextuelles', async ({ request }) => {
    // On crée la commande via API (aucune donnée inventée) puis on prouve qu'elle
    // est atteignable **depuis la liste** — c'est tout le contrat de cet écran.
    const seeded = await seedOrder(request, { label: 'admin-spec-detail' })
    await openApp(page, '/admin/commandes')
    const rowLink = page.getByRole('table').locator('tbody tr a').filter({ hasText: seeded.orderNumber })
    await expect(rowLink).toHaveCount(1)
    await rowLink.click()
    // Attendre que la requête de détail soit résolue (le h1 passe de
    // « Commande » au numéro de commande réel).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(seeded.orderNumber, { timeout: 20_000 })
    await expect(page.getByRole('navigation', { name: 'Fil d’Ariane' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cycle de commande' })).toBeVisible()
    // Une commande fraîche est en attente de paiement : l'action contextuelle
    // proposée est « Confirmer le paiement », et toute écriture passe par une
    // modale de confirmation (jamais d'écriture directe).
    await expect(page.getByRole('button', { name: 'Confirmer le paiement' })).toBeVisible()
    await page.getByRole('button', { name: 'Confirmer le paiement' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Vocabulaire fermé : « Annuler » puis l'action.
    await expect(dialog.getByRole('button', { name: 'Annuler' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('paiements vendeurs : filtre (tous / à payer / payés) et montant', async () => {
    const { errors } = collectPageErrors(page)
    await openApp(page, '/admin/paiements')

    await expect(page.getByRole('heading', { level: 1, name: 'Paiements vendeurs' })).toBeVisible()
    await expect(page.getByText('Commission 10 % déjà déduite.')).toBeVisible()
    await expect(page.getByRole('combobox', { name: /statut|paiement/i }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('utilisateurs : recherche + filtre rôle', async () => {
    const { errors } = collectPageErrors(page)
    await openApp(page, '/admin/utilisateurs')

    await expect(page.getByRole('heading', { level: 1, name: 'Utilisateurs' })).toBeVisible()
    await expect(page.getByRole('searchbox').or(page.getByPlaceholder(/recherch/i))).toBeVisible()
    expect(errors).toEqual([])
  })

  test('catégories : hiérarchie étiquetée, renommage — jamais de suppression', async () => {
    const { errors } = collectPageErrors(page)
    await openApp(page, '/admin/categories')

    await expect(page.getByRole('heading', { level: 1, name: 'Catégories' })).toBeVisible()
    await expect(page.getByText(/racines · \d+ sous-catégories/)).toBeVisible()
    // l'étiquette textuelle « sous-catégorie » rend le niveau lisible sans la couleur
    await expect(page.getByText('sous-catégorie').first()).toBeVisible()
    // vocabulaire fermé : aucune suppression de catégorie
    await expect(page.getByRole('button', { name: /Supprimer/i })).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('historique : journal des actions + filtre fermé', async () => {
    const { errors } = collectPageErrors(page)
    await openApp(page, '/admin/historique')

    await expect(page.getByRole('heading', { level: 1, name: 'Historique' })).toBeVisible()
    const filter = page.getByRole('combobox', { name: 'Filtrer par action' })
    await expect(filter).toBeVisible()
    await expect(filter.getByRole('option').first()).toHaveText('Toutes les actions')
    expect(errors).toEqual([])
  })

  test('un utilisateur non admin est renvoyé vers la boutique', async ({ browser }) => {
    // ⚠️ Interdiction de se déconnecter depuis la page admin **partagée** : le
    // `POST /api/auth/logout` détruit la session **côté serveur** (clé Redis),
    // donc pour TOUTES les specs qui réinjectent le même `connect.sid` depuis
    // `e2e/.session.json`. C'était la cause racine des faux négatifs en cascade
    // (RBAC admin, sidebar responsive, cycle de vie article → 401). On prouve la
    // règle avec une **session vendeur dédiée** (authentifié mais non-admin) et
    // on ne touche jamais à la session admin.
    const context = await browser.newContext({ locale: 'fr-FR' })
    const seller = await context.newPage()
    try {
      await registerSeller(seller, 'e2e-non-admin')
      await seller.goto('/admin')
      await expect(seller).toHaveURL(/\/$|\/login/)
    } finally {
      await context.close()
    }
  })
})
