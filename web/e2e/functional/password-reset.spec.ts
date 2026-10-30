import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { closeSharedPage, collectPageErrors, openApp, primeCsrf, sharedPage } from '../lib/fixtures'

/**
 * MOT DE PASSE OUBLIÉ — parcours réel de bout en bout (CA-AUTH02-01, §9.1).
 *
 * ## Ce qui est prouvé (PASS) et comment
 *
 * | Cas | Preuve |
 * |-----|--------|
 * | (d) anti-énumération | `POST /api/auth/forgot-password` → **202** ET **corps identique** pour un e-mail connu et un inconnu ; aucune adresse/aucun jeton dans la réponse. En base, seule la demande du compte connu crée un jeton. |
 * | (a) jeton inconnu | `POST /api/auth/reset-password` → **410 `INVALID_OR_EXPIRED_RESET_TOKEN`** (contrat `server/src/services/password-reset.service.ts`). |
 * | (a bis) jeton mal formé | jeton < 20 caractères → **400 `VALIDATION_ERROR`** (jamais 500). |
 * | (c) expiration | jeton inséré avec `expires_at = now() - 1 h` → **410** ; le mot de passe reste inchangé (connexion ancienne toujours OK). |
 * | nominal | jeton **réel** fabriqué en base (voir ci-dessous) → `reset-password` **200**, **ancien mot de passe refusé (401)**, **nouveau accepté (200)**. |
 * | (b) réutilisation | le **même** jeton rejoué après consommation → **410**. |
 * | UI | `/reset-password?token=…` : formulaire réel (`#aPass`/`#aPass2`), « Réinitialiser » → 200 + redirection `/login` + connexion API avec le **nouveau** mot de passe ; sans jeton, l'écran refuse de soumettre. |
 *
 * ## Comment le jeton « réel » est obtenu (et pourquoi pas autrement)
 *
 * `MAIL_ENABLED=false` sur l'API e2e : `sendMail()` sort **avant** de rendre le
 * message (`server/src/mail/mailer.ts` — `if (!isEnabled()) return false`), donc
 * le journal mémoire du mailer n'est jamais alimenté. Et même avec le mail
 * activé, `password_reset_tokens.token_hash` ne stocke que le **SHA-256** du
 * jeton (`password-resets.repository.ts`) : impossible de reconstituer le jeton
 * brut depuis la base ni depuis une réponse HTTP.
 *
 * Le test fait donc ce que fait le service à l'identique : il **choisit** un
 * jeton brut (256 bits, `base64url`), calcule son SHA-256 et l'insère dans
 * `password_reset_tokens`. Le serveur le retrouve via `hashResetToken(raw)` —
 * c'est exactement le chemin nominal (`findValidResetToken` → consommation →
 * `bcrypt` → `updateUserPassword` + `password_changed_at`), sans toucher au code
 * serveur.
 *
 * ## NON TESTÉ (assumé, pas compté comme PASS)
 *
 * · **Lecture du jeton depuis le lien du mail** : impossible ici, cf. ci-dessus
 *   (mail désactivé + hachage en base). Couvert indirectement : le jeton utilisé
 *   suit le même format et le même hachage que `generateResetToken()`.
 * · **TTL par variable d'environnement** : il n'existe aucune variable de TTL
 *   (`RESET_TOKEN_TTL_MS` est une constante de 1 h). L'expiration est appliquée
 *   par `WHERE expires_at > now()` ; on la prouve en semant `expires_at` dans le
 *   passé, ce qui est équivalent fonctionnellement.
 *
 * ## Isolation
 *
 * Chaque test crée son propre compte jetable (`@test.revends`) via l'API et
 * utilise le contexte `request` de Playwright (isolé, pas de page) : aucune
 * session admin n'est touchée. Les écritures psql passent par le conteneur
 * `revends_postgres` (mêmes variables que `e2e/global-setup.ts`).
 */

const OLD_PASSWORD = 'Ancien-MotDePasse-42!'
const NEW_PASSWORD = 'Nouveau-MotDePasse-43!'

/** Compteur local : garantit des e-mails uniques même dans la même milliseconde. */
let seq = 0

function newEmail(prefix: string): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 8)}@test.revends`
}

/**
 * Accès psql à la base de recette (même conteneur que `e2e/global-setup.ts`).
 * Lève une erreur explicite si docker/postgres est indisponible.
 */
function psql(sql: string): string {
  const container = process.env.E2E_PG_CONTAINER ?? 'revends_postgres'
  const user = process.env.E2E_PG_USER ?? 'revends'
  const db = process.env.E2E_PG_DB ?? 'revends_e2e'
  try {
    return execFileSync('docker', ['exec', container, 'psql', '-U', user, '-d', db, '-tAc', sql], {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (err) {
    throw new Error(`psql indisponible (docker exec ${container} psql -U ${user} -d ${db}) : ${String(err)}`)
  }
}

/** Échappe une chaîne pour un littéral SQL (les e-mails sont générés par le test). */
function sqlStr(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function userIdOf(email: string): number {
  const raw = psql(`SELECT id FROM users WHERE email = ${sqlStr(email)}`)
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`compte introuvable en base : ${email} (sortie psql: ${JSON.stringify(raw)})`)
  }
  return id
}

/** SHA-256 hex — identique à `hashResetToken()` côté serveur. */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Fabrique un jeton de réinitialisation réel en base : le test connaît le jeton
 * brut, la base reçoit son haché (comme `insertResetToken`).
 *
 * @param expiresIn intervalle SQL, ex. `'1 hour'` ou `'-1 hour'` (expiré).
 */
function mintToken(userId: number, expiresIn = '1 hour', used = false): string {
  const raw = randomBytes(32).toString('base64url')
  const hash = hashToken(raw)
  psql(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used_at)
     VALUES (${userId}, ${sqlStr(hash)}, now() + interval ${sqlStr(expiresIn)}, ${used ? 'now()' : 'NULL'})`,
  )
  return raw
}

/** Nombre de jetons encore utilisables pour un compte. */
function unusedTokenCount(userId: number): number {
  return Number(psql(`SELECT count(*) FROM password_reset_tokens WHERE user_id = ${userId} AND used_at IS NULL`))
}

/** Inscription réelle d'un compte jetable (mot de passe connu du test). */
async function registerAccount(request: APIRequestContext, email: string, password: string): Promise<void> {
  const res = await request.post('/api/auth/register', {
    headers: await primeCsrf(request),
    data: {
      displayName: `Reset E2E ${Date.now().toString(36)}`,
      name: `Reset E2E ${Date.now().toString(36)}`,
      email,
      phone: `77${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`,
      password,
      acceptedCgu: true,
    },
  })
  expect(res.ok(), `inscription du compte de test → ${res.status()} ${await res.text()}`).toBe(true)
}

/** Connexion réelle (statut + corps), sans jamais afficher le mot de passe. */
async function login(request: APIRequestContext, email: string, password: string) {
  return request.post('/api/auth/login', {
    headers: await primeCsrf(request),
    data: { identifier: email, password },
  })
}

test.describe('Mot de passe oublié — contrat et parcours réels', () => {
  let page: Page
  let dbReady = false

  test.beforeAll(async ({ browser }) => {
    page = await sharedPage(browser)
    try {
      psql('SELECT 1')
      dbReady = true
    } catch {
      dbReady = false
    }
  })

  test.afterAll(async () => {
    await closeSharedPage(page).catch(() => undefined)
  })

  // -------------------------------------------------------------------------
  // (d) Anti-énumération — même statut, même corps, compte connu ou non
  // -------------------------------------------------------------------------
  test('DEMANDE — 202 et corps identiques pour un compte connu et inconnu (CA-AUTH02-01)', async ({ request }) => {
    const email = newEmail('reset-known')
    await registerAccount(request, email, OLD_PASSWORD)

    const known = await request.post('/api/auth/forgot-password', {
      headers: await primeCsrf(request),
      data: { email },
    })
    expect(known.status(), 'demande pour un compte connu').toBe(202)
    const knownBody = (await known.json()) as Record<string, unknown>

    const unknownEmail = newEmail('reset-unknown')
    const unknown = await request.post('/api/auth/forgot-password', {
      headers: await primeCsrf(request),
      data: { email: unknownEmail },
    })
    expect(unknown.status(), 'demande pour une adresse inconnue').toBe(202)
    const unknownBody = (await unknown.json()) as Record<string, unknown>

    // Le cœur de l'anti-énumération : rien ne distingue les deux réponses.
    expect(unknownBody, 'réponse strictement identique quel que soit le compte').toEqual(knownBody)

    // Ni l'adresse interrogée ni un quelconque jeton ne fuitent.
    const serialized = JSON.stringify(knownBody)
    expect(serialized).not.toContain(email)
    expect(knownBody).not.toHaveProperty('token')
    expect(serialized).not.toMatch(/reset-password\?token=/)

    // Preuve que la demande du compte réel a bien fait quelque chose : un jeton
    // est créé, alors que l'adresse inconnue n'en crée aucun (même réponse HTTP).
    if (dbReady) {
      const knownId = userIdOf(email)
      expect(unusedTokenCount(knownId), 'un jeton ouvert pour le compte connu').toBe(1)
    }
  })

  // -------------------------------------------------------------------------
  // (a) Jeton invalide / mal formé
  // -------------------------------------------------------------------------
  test('JETON INVALIDE — 410 INVALID_OR_EXPIRED_RESET_TOKEN, jamais 500', async ({ request }) => {
    // Jeton bien formé (même longueur qu’un vrai) mais jamais émis par le serveur.
    const fake = randomBytes(32).toString('base64url')
    const res = await request.post('/api/auth/reset-password', {
      headers: await primeCsrf(request),
      data: { token: fake, password: NEW_PASSWORD },
    })
    expect(res.status(), 'jeton inconnu → 410').toBe(410)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('INVALID_OR_EXPIRED_RESET_TOKEN')
    expect(body.error.message).toContain('invalide ou expiré')

    // Contrat de validation : un jeton trop court est un 400, pas un 410 ni un 500.
    const short = await request.post('/api/auth/reset-password', {
      headers: await primeCsrf(request),
      data: { token: 'trop-court', password: NEW_PASSWORD },
    })
    expect(short.status(), 'jeton trop court → 400 (validation)').toBe(400)
    expect(((await short.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR')
  })

  // -------------------------------------------------------------------------
  // Chemin nominal + réutilisation du jeton
  // -------------------------------------------------------------------------
  test('NOMINAL — jeton valide : reset 200, ancien mot de passe refusé, nouveau accepté, jeton à usage unique', async ({
    request,
  }) => {
    test.skip(
      !dbReady,
      'NON TESTÉ — psql/docker indisponible : impossible de fabriquer un jeton (la base ne stocke que son SHA-256 et MAIL_ENABLED=false empêche de le lire).',
    )

    const email = newEmail('reset-nominal')
    await registerAccount(request, email, OLD_PASSWORD)

    // Base de référence : l'ancien mot de passe fonctionne avant le reset.
    const before = await login(request, email, OLD_PASSWORD)
    expect(before.status(), 'connexion initiale avec l’ancien mot de passe').toBe(200)

    const userId = userIdOf(email)
    const raw = mintToken(userId, '1 hour')

    // — Réinitialisation avec le jeton réel ——————————————————————————————
    const reset = await request.post('/api/auth/reset-password', {
      headers: await primeCsrf(request),
      data: { token: raw, password: NEW_PASSWORD },
    })
    expect(reset.status(), `réinitialisation → ${reset.status()} ${await reset.text()}`).toBe(200)
    const resetBody = (await reset.json()) as { message: string }
    expect(resetBody.message).toContain('a été modifié')

    // Le jeton est consommé en base (usage unique, pas seulement rejeté en surface).
    expect(
      psql(`SELECT used_at IS NOT NULL FROM password_reset_tokens WHERE token_hash = ${sqlStr(hashToken(raw))}`),
      'used_at posé après consommation',
    ).toBe('t')

    // — L'ancien mot de passe ne fonctionne plus ——————————————————————————
    const oldLogin = await login(request, email, OLD_PASSWORD)
    expect(oldLogin.status(), 'ancien mot de passe refusé après reset').toBe(401)
    expect(((await oldLogin.json()) as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS')

    // — Le nouveau mot de passe fonctionne ————————————————————————————————
    const newLogin = await login(request, email, NEW_PASSWORD)
    expect(newLogin.status(), `nouveau mot de passe accepté → ${await newLogin.text()}`).toBe(200)
    const newBody = (await newLogin.json()) as { user: { email: string } }
    expect(newBody.user.email).toBe(email)

    // — (b) Réutilisation du même jeton → 410 (déjà consommé) ——————————————
    const replay = await request.post('/api/auth/reset-password', {
      headers: await primeCsrf(request),
      data: { token: raw, password: OLD_PASSWORD },
    })
    expect(replay.status(), 'un jeton déjà consommé est refusé').toBe(410)
    expect(((await replay.json()) as { error: { code: string } }).error.code).toBe('INVALID_OR_EXPIRED_RESET_TOKEN')
  })

  // -------------------------------------------------------------------------
  // (c) Expiration — expires_at dans le passé
  // -------------------------------------------------------------------------
  test('EXPIRATION — un jeton expiré renvoie 410 et ne change pas le mot de passe', async ({ request }) => {
    test.skip(
      !dbReady,
      'NON TESTÉ — psql/docker indisponible : impossible de semer un jeton expiré.',
    )

    const email = newEmail('reset-expired')
    await registerAccount(request, email, OLD_PASSWORD)
    const userId = userIdOf(email)

    const expired = mintToken(userId, '-1 hour')
    const res = await request.post('/api/auth/reset-password', {
      headers: await primeCsrf(request),
      data: { token: expired, password: NEW_PASSWORD },
    })
    expect(res.status(), 'jeton expiré → 410').toBe(410)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_OR_EXPIRED_RESET_TOKEN')

    // Le refus n'a rien modifié : l'ancien mot de passe (et lui seul) marche.
    expect((await login(request, email, OLD_PASSWORD)).status(), 'mot de passe inchangé').toBe(200)
    expect((await login(request, email, NEW_PASSWORD)).status(), 'le mot de passe expiré n’a pas été appliqué').toBe(401)
  })

  // -------------------------------------------------------------------------
  // UI — le lien du mail ouvre l'écran React de réinitialisation
  // -------------------------------------------------------------------------
  test('UI — /reset-password?token=… réinitialise puis redirige vers /login', async ({ request }) => {
    test.skip(
      !dbReady,
      'NON TESTÉ — psql/docker indisponible : impossible de fabriquer le jeton présent dans l’URL.',
    )

    const email = newEmail('reset-ui')
    await registerAccount(request, email, OLD_PASSWORD)
    const raw = mintToken(userIdOf(email), '1 hour')

    const { errors } = collectPageErrors(page)
    await openApp(page, `/reset-password?token=${encodeURIComponent(raw)}`)

    // Écran réel (`AuthView` mode « reset »).
    await expect(page.getByRole('heading', { level: 1, name: 'Nouveau mot de passe' })).toBeVisible()
    await page.fill('#aPass', NEW_PASSWORD)
    await page.fill('#aPass2', NEW_PASSWORD)

    const [resetResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/reset-password') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Réinitialiser' }).click(),
    ])
    expect(resetResponse.status(), 'la soumission UI doit réussir (CSRF inclus)').toBe(200)

    // Succès → retour à la connexion (aucun message d'erreur affiché).
    await expect(page, 'succès → /login').toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Bon retour' })).toBeVisible()
    await expect(page.locator('.note.warn')).toHaveCount(0)

    // Preuve indépendante : le nouveau mot de passe ouvre une vraie session.
    const loginRes = await login(request, email, NEW_PASSWORD)
    expect(loginRes.status(), 'connexion avec le mot de passe défini dans l’UI').toBe(200)
    expect((await login(request, email, OLD_PASSWORD)).status()).toBe(401)

    // Aucune erreur JavaScript non gérée pendant le parcours.
    expect(errors.filter((e) => e.startsWith('pageerror:'))).toEqual([])
  })

  test('UI — sans jeton, l’écran refuse de soumettre (lien invalide)', async () => {
    await openApp(page, '/reset-password')
    await expect(page.getByRole('heading', { level: 1, name: 'Nouveau mot de passe' })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: /Lien de réinitialisation invalide ou expiré/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled()
  })
})
