/**
 * Source de vérité unique pour la cible des tests e2e.
 *
 * Importée **à la fois** par `playwright.config.ts` et `e2e/global-setup.ts` :
 * dupliquer ce calcul avait déjà produit un bug (le global setup réveillait
 * 5180 pendant que les tests visaient 5181), donc le préchauffage mesurait un
 * serveur différent de celui sous test.
 */

/** Mode de la cible : le build livré par défaut, le dev server sur demande. */
export const MODE = (process.env.E2E_MODE ?? 'preview') as 'preview' | 'dev'

/** Port du front piloté par la config Playwright. */
export const FRONT_PORT = MODE === 'preview' ? 5181 : 5180

/** Front sous test. `E2E_BASE_URL` force une URL quelconque. */
export const BASE = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${FRONT_PORT}`

/**
 * Backend attendu — supposé **déjà lancé** : le front ne démarre pas l'API et
 * `server/` n'est pas modifiable dans le cadre de cette vague.
 *
 * Par défaut : l'instance **dédiée à la recette** `api-e2e` (port 4002,
 * `RATE_LIMIT_DISABLED=true`, démarrage via `npm run e2e:api:up`). Raison : le
 * plafond `/api/auth` (20 appels / 10 min) de la stack de prod épuise la suite
 * e2e et produit des faux négatifs (429 → session admin absente → tests admin
 * rouges). La limite est testée séparément par la suite serveur (`limits.test.ts`).
 *
 * `E2E_BACKEND_URL` permet de forcer n'importe quelle API (ex. la stack prod
 * 4001 pour une vérification ponctuelle, au prix du plafond).
 */
export const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:4002'
