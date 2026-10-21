import type { Page } from '@playwright/test'

/**
 * Navigation **intra-SPA** : change d'URL sans recharger le document.
 *
 * Pourquoi c'est indispensable ici (et pas un simple raccourci) :
 * `AuthContext` appelle `api.me()` une fois par **montage de document**
 * (`src/context/AuthContext.tsx:33`). Or le serveur limite `/api/auth` à
 * **20 appels / 10 min par IP** (`server/src/app.ts:87`, non modifiable).
 * Avec 10 routes publiques × 5 projets, un `page.goto` par route consommait
 * ~50 appels : la suite s'auto-saturait et le 429 sur `/auth/me` faisait
 * basculer `RequireAdmin` sur « anonyme » — un **faux négatif** de recette.
 *
 * Un clic dans l'application, lui, passe par React Router : le routeur change,
 * `AuthContext` reste monté, **zéro appel réseau supplémentaire**. C'est
 * aussi le trajet réel d'un utilisateur, donc le test reste représentatif.
 */
export async function spaGoto(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
  }, path)
  // On attend que le routeur ait rendu : `#contenu` existe sur les pages
  // coquillées, sinon on se contente d'un tick pour les formulaires seuls.
  await page
    .waitForFunction(() => !document.body.innerText.includes('Chargement…'), undefined, { timeout: 15_000 })
    .catch(() => undefined)
}

/**
 * Localise la ligne d'un article dans la file de modération
 * (`/admin/articles-en-attente`), **en paginant si nécessaire**.
 *
 * Pourquoi ce helper plutôt qu'un simple `getByRole('row', …)` :
 * la file PENDING est en **FIFO** (`ORDER BY created_at ASC` —
 * `server/src/repositories/products.repository.ts`) et paginée (12/page).
 * Un article tout juste créé arrive donc en **dernière page**, jamais en
 * page 1 dès que la file dépasse une page — et la base e2e n'est pas remise
 * à zéro entre deux exécutions (les articles non nettoyés s'accumulent ; cf.
 * `e2e/global-setup.ts`, qui n'efface aucune table). On parcourt donc les
 * pages jusqu'à trouver la ligne, au lieu de supposer qu'elle est en tête.
 *
 * @returns un locator de ligne (même vide, pour laisser `expect().toBeVisible()`
 *          produire le message d'erreur utile si l'article n'existe vraiment pas).
 */
export async function findPendingRow(page: Page, name: string | RegExp) {
  const re = typeof name === 'string' ? new RegExp(name) : name
  const row = page.getByRole('row', { name: re })
  const next = page.getByRole('button', { name: 'Page suivante' })
  const table = page.getByRole('table')

  for (let guard = 0; guard < 30; guard++) {
    // Le tableau arrive après un fetch React Query : on attend d'abord qu'il
    // soit rendu, sinon on lirait un état transitoire « pas encore de lignes ».
    await table.first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => undefined)

    if ((await row.count()) > 0) return row.first()

    // ⚠️ Ne JAMAIS appeler `isEnabled()` sur un bouton **absent** : il attend
    // alors son propre timeout (~30 s) et fait exploser le budget du test.
    // Or la pagination n'est **pas rendue** quand la file tient sur une seule
    // page — c'est le cas normal. On teste donc l'**existence** d'abord.
    if ((await next.count()) === 0) break
    if (!(await next.isEnabled())) break

    await next.click()
    // Laisse le refetch React Query (page suivante) remplacer les lignes.
    await page.waitForTimeout(300)
  }
  return row.first()
}
