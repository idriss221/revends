import { expect, test } from '@playwright/test'

/**
 * Authentification React — cycle d'inscription / déconnexion / connexion via
 * l'UI React (remplace l'ancien cycle Bureau vanilla, supprimé avec le front
 * `public/bureau/`).
 *
 * Verrouille :
 *  1. **Inscription** : les champs React (`#a*`), le POST `/api/auth/register`
 *     accepté (201) et la session serveur établie.
 *  2. **Déconnexion** : le bouton du pied de page (colonne « Mon compte », le
 *     seul emplacement desktop de la maquette) ouvre une modale de
 *     confirmation ; confirmer détruit la session (204 → `/api/auth/me` = 401).
 *  3. **Connexion** : le formulaire React (`#aMail` / `#aPass`) rétablit la session.
 *
 * La redirection par rôle (admin → `/admin`, sinon accueil) est couverte par
 * `redirects-nav.spec.ts`.
 */
test.describe('Auth React — inscription / déconnexion / connexion', () => {
  test('inscription → déconnexion → connexion, session serveur établie', async ({ page }) => {
    const stamp = Date.now()
    const email = `react-${stamp.toString(36)}-${Math.random().toString(36).slice(2, 6)}@test.revends`
    const phone = `77${String(stamp).slice(-8)}`
    const password = 'MotDePasse!2026'
    const displayName = `React Recette ${stamp.toString(36)}`

    /** Statut de `GET /api/auth/me` tel que vu par le navigateur (cookie inclus). */
    const selfStatus = () =>
      page.evaluate(async () => (await fetch('/api/auth/me', { credentials: 'include' })).status)

    // ---- 1) Inscription via le formulaire React ----------------------------
    await page.goto('/register')
    await expect(page.locator('#aName')).toBeVisible()
    await page.fill('#aName', displayName)
    await page.fill('#aPhone', phone)
    await page.fill('#aMail', email)
    await page.fill('#aPass', password)
    // Champ `aPass2` de la référence : le double mot de passe est obligatoire.
    await page.fill('#aPass2', password)
    await page.check('input[name="acceptedCgu"]')

    const [register] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/register')),
      page.locator('button[type="submit"]').click(),
    ])
    expect(register.status(), `inscription acceptée → ${await register.text()}`).toBe(201)

    await expect(page, 'inscription → accueil').toHaveURL(/\/$/)
    expect(await selfStatus(), 'session serveur établie après inscription').toBe(200)

    // ---- 2) Déconnexion : navbar → modale de confirmation ------------------
    await page.locator('button[aria-label="Se déconnecter"]').click()
    const modal = page.getByRole('dialog')
    await expect(modal, 'modale de confirmation visible').toBeVisible()
    const [logout] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/logout')),
      modal.getByRole('button', { name: 'Se déconnecter' }).click(),
    ])
    expect(logout.status()).toBe(204)
    await expect.poll(selfStatus, { message: 'session détruite' }).toBe(401)

    // ---- 3) Reconnexion via le formulaire React ----------------------------
    await page.goto('/login')
    await expect(page.locator('#aMail')).toBeVisible()
    await page.fill('#aMail', email)
    await page.fill('#aPass', password)

    const [login] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/login')),
      page.locator('button[type="submit"]').click(),
    ])
    expect(login.status(), `connexion acceptée → ${await login.text()}`).toBe(200)
    await expect(page, 'connexion → accueil').toHaveURL(/\/$/)
    expect(await selfStatus(), 'session serveur établie après connexion').toBe(200)
  })
})
