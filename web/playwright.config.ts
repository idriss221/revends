import { defineConfig, devices } from '@playwright/test'
import { BASE, FRONT_PORT as PORT, MODE } from './e2e/helpers/target'

/**
 * Recette DA §9.3 (d)-(f) + non-régression — Playwright.
 *
 * ## Cible par défaut : le **build de production** (E2E_MODE=preview)
 *
 * Mesure (`node` + interception réseau, 1 chargement de `/`) :
 * ```
 * dev  (5180) : 2 appels /api/auth/me
 * prod (5181) : 1 appel  /api/auth/me
 * ```
 * `AuthContext` appelle `/auth/me` à chaque montage de document, et `StrictMode`
 * ne double l'effet **qu'en développement**. Recetter le bundle réellement
 * livré est donc à la fois plus fidèle et deux fois moins coûteux en API.
 *
 * Le serveur ne lance **que le front** : le backend est supposé déjà lancé sur
 * 4001 (le front n'a pas à démarrer l'API, et `server/` n'est pas modifiable).
 *
 * `E2E_MODE=dev` cible le serveur de développement (recette à chaud, utile en
 * cours d'implémentation). `E2E_BASE_URL` force une URL quelconque.
 *
 * ⚠️ `target` est importé **une seule fois** : un doublon (ligne 2 + ligne 24)
 * faisait échouer le parseur Babel en `VarRedeclaration`, ce qui rendait
 * *toute* la suite e2e inexécutable. `BASE`/`PORT`/`MODE` sont donc réutilisés
 * depuis l'import du haut.
 */

/** Les captures écrivent ~90 PNG : hors de la suite fonctionnelle par défaut. */
const captureOnly = process.env.E2E_CAPTURE === '1'

export default defineConfig({
  testDir: './e2e',
  testIgnore: captureOnly ? [] : ['**/captures.spec.ts'],
  /* 1 seule session admin par exécution : /api/auth est limité à 20 appels/10min. */
  globalSetup: './e2e/global-setup.ts',
  /* Les e2e sont lents : on ne lance pas 8 workers sur une machine de dev. */
  workers: 2,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  /* Budget large : la première requête transforme encore les modules en dev.
   * 45 s/15 s évitent un faux négatif « l'app est cassée » sur un simple
   * ralentissement machine. */
  timeout: 45_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
  },

  /**
   * **Un seul projet Chromium**, volontairement.
   *
   * Les 5 largeurs du DA §9.9 (1440 / 1280 / 1024 / 768 / 390) sont parcourues
   * **dans** les tests via `page.setViewportSize()`, pas en multipliant les
   * projets. Raison mesurée, pas théorique : avec 5 projets, chaque test
   * rechargerait le document, donc consommerait 1 à 2 appels `/auth/me`, et le
   * serveur refuse au-delà de **20 appels / 10 min** par IP
   * (`server/src/app.ts:87`, non modifiable). La suite saturait sa propre
   * fenêtre et le 429 sur `/auth/me` faisait basculer `RequireAdmin` sur
   * « anonyme », produisant des **faux négatifs** de recette. Une page
   * rechargée + 5 redimensionnements prouve les 5 largeurs pour 1 chargement.
   */
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Le front proxifie `/api` vers l'instance **dédiée à la recette**
        // (`api-e2e`, port 4002, sans limite de débit). C'est le pendant côté
        // front de `e2e/helpers/target.ts` : sans ça, le front vise 4001 (prod)
        // et la suite sature le plafond `/api/auth`.
        command:
          MODE === 'preview'
            ? `VITE_API_PROXY_TARGET=${process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:4002'} npm run preview -- --port ${PORT} --host 127.0.0.1 --strictPort`
            : `VITE_API_PROXY_TARGET=${process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:4002'} npm run dev -- --port ${PORT} --host 127.0.0.1 --strictPort`,
        url: BASE,
        reuseExistingServer: true,
        timeout: 60_000,
      },
})
