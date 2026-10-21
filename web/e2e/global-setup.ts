import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { BACKEND, BASE } from './helpers/target'

/**
 * Session admin partagée, obtenue **une seule fois** par exécution.
 *
 * Pourquoi un global setup plutôt qu'un login dans chaque test :
 * `server/src/app.ts:87` limite `/api/auth` à **20 appels / 10 min** (par IP).
 * Un `POST /api/auth/login` par test × 4 projets = blocage quasi immédiat, et le
 * 429 sur `/api/auth/me` fait fallingback « utilisateur anonyme » → `RequireAdmin`
 * redirige vers `/login` : un **faux négatif** côté front. On s'authentifie donc
 * une fois, et les tests rejouent le cookie.
 *
 * Écrit `e2e/.session.json` (git-ignoré). Si les identifiants manquent, aucun
 * fichier n'est produit et les tests admin se sautent proprement.
 */
const OUT = join(process.cwd(), 'e2e', '.session.json')

/**
 * Préchauffe le serveur sous test.
 *
 * Constaté à l'e2e : le premier chargement après un démarrage à froid laisse
 * l'app sur « Chargement… » plusieurs secondes — en mode `dev`, Vite transforme
 * alors les ~200 modules du front à la demande. Ce n'est pas un défaut
 * applicatif (l'API répond en 10 ms) mais un artefact du serveur : on
 * déclenche donc le chargement **une fois, avant les tests**, pour que chaque
 * test mesure l'application et non le compilateur.
 */
async function warmUp() {
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(5_000) })
      if (res.ok) {
        // Deuxième passe : le HTML est déjà servi, Vite a commencé à transformer.
        await fetch(BASE, { signal: AbortSignal.timeout(15_000) })
        console.log(`[e2e] serveur ${BASE} prêt (tentative ${attempt}).`)
        return
      }
    } catch {
      // Serveur pas encore là : on réessaie.
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log('[e2e] serveur de dev injoignable — les tests échoueront avec une erreur explicite.')
}

/**
 * Lit une clé dans les `.env` du dépôt.
 *
 * ⚠️ Les identifiants admin vivent dans le `.env` **racine** (celui que
 * `docker-compose.yml` consomme) — PAS dans `server/.env`, qui n'existe pas dans
 * cette disposition. L'ancien chemin (`../server/.env` seul) faisait donc
 * silencieusement avorter la connexion admin : aucun `.session.json` n'était
 * réécrit et les tests admin tournaient sur un cookie périmé (constaté : mtime
 * figé, toutes les pages admin redirigées vers l'écran de connexion vanilla).
 * On sonde donc la racine d'abord, puis `server/` par compatibilité.
 */
const ENV_FILES = [join(process.cwd(), '..', '.env'), join(process.cwd(), '..', 'server', '.env')]

function readServerEnv(key: string): string | undefined {
  for (const file of ENV_FILES) {
    try {
      const line = readFileSync(file, 'utf8')
        .split('\n')
        .find((l) => l.startsWith(`${key}=`))
      if (line) {
        // Valeur éventuellement entourée de guillemets (docker `--env-file`).
        return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
      }
    } catch {
      // Fichier absent → on tente le suivant.
    }
  }
  return undefined
}

/**
 * Hygiène de la base de recette.
 *
 * La base `revends_e2e` **n'est jamais remise à zéro** : les articles PENDING
 * créés par les exécutions précédentes s'accumulent (constaté : 45) et font
 * grossir la file de modération (paginée 12/page, FIFO). Les tests restent
 * robustes (`findPendingRow` pagine), mais on évite l'accumulation en
 * supprimant, **en début de run**, les articles PENDING des comptes de test.
 *
 * Périmètre volontairement **étroit et sûr** :
 *  · `PENDING` uniquement → jamais référencés par une commande (la FK
 *    `orders.product_id` est en RESTRICT) ;
 *  · ancrés sur le domaine des fixtures (`@test.revends`) → ne touche NI le
 *    compte admin NI les données de démonstration ;
 *  · la suppression cascade sur photos / panier / favoris (FK ON DELETE CASCADE).
 *
 * **Best-effort** : si `docker` est absent ou la base injoignable, on continue
 * (le run ne doit jamais échouer à cause de l'hygiène).
 */
function purgeStalePendingProducts(): void {
  const container = process.env.E2E_PG_CONTAINER ?? 'revends_postgres'
  const user = process.env.E2E_PG_USER ?? 'revends'
  const db = process.env.E2E_PG_DB ?? 'revends_e2e'
  const sql =
    "DELETE FROM products WHERE status = 'PENDING' AND owner_id IN (SELECT id FROM users WHERE email LIKE '%@test.revends');"
  try {
    const out = execFileSync('docker', ['exec', container, 'psql', '-U', user, '-d', db, '-tAc', sql], {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    console.log(`[e2e] hygiène BDD : ${out.trim() || '0'} article(s) PENDING résiduel(s) supprimé(s).`)
  } catch {
    console.log('[e2e] hygiène BDD ignorée (docker/postgres indisponible) — sans impact sur les tests.')
  }
}

export default async function globalSetup() {
  await warmUp()
  purgeStalePendingProducts()

  const email = process.env.E2E_ADMIN_EMAIL ?? readServerEnv('ADMIN_EMAIL')
  const password = process.env.E2E_ADMIN_PASSWORD ?? readServerEnv('ADMIN_PASSWORD')
  if (!email || !password) {
    console.log('\n[e2e] ADMIN_EMAIL/ADMIN_PASSWORD absents → les tests admin seront sautés.')
    return
  }

  // Double soumission CSRF : le POST de connexion exige un cookie `csrf_token`
  // ET l'en-tête `X-CSRF-Token` correspondant. Un GET sûr en pose un ; on le
  // renvoie ensuite, comme le ferait le SPA au chargement.
  const csrfRes = await fetch(`${BACKEND}/api/categories`)
  const csrfCookie = (csrfRes.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('csrf_token='))
  const csrfToken = csrfCookie?.slice('csrf_token='.length)
  const res = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfCookie && csrfToken ? { Cookie: csrfCookie, 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify({ identifier: email, password }),
  })
  if (!res.ok) {
    console.log(`[e2e] login admin impossible (${res.status}) → tests admin sautés.`)
    return
  }
  const sid = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('connect.sid='))
  if (!sid) {
    console.log('[e2e] pas de cookie connect.sid → tests admin sautés.')
    return
  }

  mkdirSync(join(process.cwd(), 'e2e'), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ cookie: sid, email, at: new Date().toISOString() }))
  console.log('[e2e] session admin prête (1 appel /api/auth).')
}
