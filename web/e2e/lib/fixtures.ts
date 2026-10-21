import { expect, type APIRequestContext, type APIResponse, type Browser, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spaGoto } from '../helpers/navigation'

/**
 * Outillage partagé des tests e2e.
 *
 * ⚠ Contrainte structurante : `/api/auth` est limité à **20 appels / 10 min par
 * IP** (`server/src/app.ts:87`, non modifiable dans le cadre de cette vague) et
 * `AuthContext` appelle `/api/auth/me` à **chaque montage de document** — deux
 * fois en dev, à cause du double-effet de `StrictMode`. Un `page.goto` par test
 * sur 50 tests = ~100 appels : la suite saturait sa propre fenêtre et le 429
 * sur `/auth/me` faisait basculer `RequireAdmin` sur « anonyme », produisant des
 * **faux négatifs**.
 *
 * D'où les deux décisions structurantes ci-dessous :
 * 1. `sharedPage()` — une seule page pour toute une spec, fermée après ;
 * 2. `openApp()` — un seul rechargement réel, puis navigation par le routeur.
 *
 * Coût réseau d'une spec complète : ~2 appels au lieu de ~2 par test.
 */

/** Session admin partagée, lue depuis `e2e/.session.json` (voir global-setup). */
function sharedAdminCookie(): { name: string; value: string } | null {
  try {
    const raw = readFileSync(join(process.cwd(), 'e2e', '.session.json'), 'utf8')
    const [name, value] = (JSON.parse(raw).cookie as string).split('=')
    return value ? { name, value } : null
  } catch {
    return null
  }
}

/**
 * En-tête `Cookie` prêt à poser sur une requête API admin (`connect.sid=…`),
 * ou `null` si la session admin est absente. Évite d'avoir à créer une page
 * juste pour appeler une route admin en setup.
 */
export function adminCookieHeader(): string | null {
  const cookie = sharedAdminCookie()
  return cookie ? `${cookie.name}=${cookie.value}` : null
}

/**
 * En-tête CSRF à poser sur un appel API **brut** (hors navigation navigateur).
 *
 * Les appels via `request` / `page.request` partagent le cookie-jar du
 * navigateur : dès qu'une ressource a été chargée, le cookie **lisible**
 * `csrf_token` existe et `server/src/middleware/csrf.ts` exige la **double
 * soumission** (`X-CSRF-Token` == cookie). Sans cet en-tête, toute mutation
 * répond `403 CSRF_INVALID` — c'est le contrat que respectent les clients web
 * (`web/src/lib/api.ts`, `web/src/lib/apiClient.ts`).
 *
 * ⚠️ Ce contrat s'applique **aussi** aux appels qui écrasent explicitement
 * `Cookie` (inscriptions anonymes de seed) : le middleware exige le cookie
 * `csrf_token` sur toute mutation. Utiliser `cookieWithCsrf()` dans ce cas, et
 * `primeCsrf()` sur un contexte API neuf (qui n'a encore fait aucun GET).
 */
export async function csrfHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  try {
    const token = await csrfToken(request)
    return token ? { 'X-CSRF-Token': token } : {}
  } catch {
    return {}
  }
}

/** Jeton CSRF courant du cookie-jar (cookie lisible posé par une requête sûre). */
async function csrfToken(request: APIRequestContext): Promise<string | undefined> {
  const { cookies } = await request.storageState()
  return cookies.find((c) => c.name === 'csrf_token')?.value
}

/**
 * Pose le cookie `csrf_token` si le contexte n'en a pas encore (GET sûr).
 * Renvoie les en-têtes CSRF prêts à l'emploi.
 */
export async function primeCsrf(request: APIRequestContext): Promise<Record<string, string>> {
  try {
    if (!(await csrfToken(request))) await request.get('/api/categories')
  } catch {
    // Contexte fermé : on laisse l'appelant échouer sur son assertion.
  }
  return csrfHeaders(request)
}

/**
 * En-tête `Cookie` pour un appel qui doit **écraser** le cookie-jar :
 * session explicite (vendeur/acheteur/admin) + cookie CSRF de double soumission.
 * `sessionCookie` vide → cookie CSRF seul (inscription volontairement anonyme).
 */
export async function cookieWithCsrf(request: APIRequestContext, sessionCookie = ''): Promise<string> {
  await primeCsrf(request)
  const token = await csrfToken(request)
  return [sessionCookie, token ? `csrf_token=${token}` : ''].filter(Boolean).join('; ')
}

/**
 * Extrait l'en-tête `Cookie` de session d'une réponse de connexion/inscription.
 *
 * ⚠️ Indispensable de le faire depuis la **réponse** : on ne peut pas compter
 * sur le cookie-jar du contexte pour porter une session anonyme, car il peut
 * déjà contenir une autre session (voir `seedOrder`).
 */
function sessionCookieFrom(res: APIResponse): string {
  const setCookies = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
  const sid = setCookies.map((v) => v.split(';')[0]).find((v) => v.startsWith('connect.sid='))
  if (!sid) throw new Error("cookie de session 'connect.sid' absent de la réponse")
  return sid
}

/**
 * Connexion admin : réinjecte la session créée **une fois** par le global setup.
 * Aucun appel réseau ici — un `POST /api/auth/login` par test était la cause
 * directe de la saturation du rate limit.
 */
export async function loginAdmin(page: Page): Promise<void> {
  const cookie = sharedAdminCookie()
  if (!cookie) {
    // Pas de session = pas de recette admin possible. On le dit explicitement
    // plutôt que de laisser une cascade d'échecs illisibles.
    console.warn('[e2e] session admin absente — les tests admin échoueront (voir global-setup)')
    return
  }
  await page.context().addCookies([{ ...cookie, domain: '127.0.0.1', path: '/' }])
}

/**
 * Page unique partagée par tous les tests d'un `describe`.
 *
 * À fermer impérativement en `afterAll` : sans cela le navigateur accumule les
 * contextes et la mémoire grimpe sur une spec de 10 tests.
 */
export async function sharedPage(
  browser: Browser,
  { admin = false }: { admin?: boolean } = {},
): Promise<Page> {
  const context = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Africa/Dakar' })
  const page = await context.newPage()
  if (admin) await loginAdmin(page)
  return page
}

/** Ferme la page partagée et son contexte. */
export async function closeSharedPage(page: Page): Promise<void> {
  await page.context().close()
}

/** Pages déjà rechargées : au-delà, on navigue par le routeur. */
const loaded = new WeakSet<Page>()

/**
 * Amène l'application sur `path` puis attend le contenu réel.
 *
 * Premier appel → `page.goto` (coût 2 appels `/auth/me`). Appels suivants →
 * navigation React Router (`spaGoto`), **0 appel** : le composant `AuthContext`
 * reste monté, seul le routeur change.
 */
export async function openApp(page: Page, path: string): Promise<void> {
  if (loaded.has(page)) await spaGoto(page, path)
  else {
    await page.goto(path)
    loaded.add(page)
  }
  await waitForContent(page)
}

/** Catégorie + sous-catégorie actives utilisées par les articles de test (seed). */
export const CATEGORY = { categoryId: 3, subcategoryId: 13 } // Électronique › Téléphones & tablettes

/**
 * Vendeur jetable : inscription via l'API publique puis session ouverte.
 * Chaque exécution crée un compte neuf → les specs ne dépendent d'aucun mot de
 * passe de seed et ne peuvent pas se contaminer.
 */
export async function registerSeller(page: Page, label: string): Promise<{ email: string }> {
  const email = `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}@test.revends`
  const password = 'Vendeur-Recette-42!'
  // `displayName` est validé côté serveur par `^[A-Za-zÀ-ÿ0-9 ]+$` (2–50) : le
  // tiret du libellé (`e2e-vendeur`) était refusé → 400. On assainit le libellé
  // pour l'affichage (l'e-mail, lui, garde son tiret : valide).
  const safeLabel = label.replace(/[^A-Za-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
  const res = await page.request.post('/api/auth/register', {
    headers: await primeCsrf(page.request),
    data: {
      displayName: `Vendeur ${safeLabel}`,
      name: `Vendeur ${safeLabel}`,
      email,
      phone: `77${String(Math.floor(Math.random() * 10000000)).padStart(8, '0')}`,
      password,
      acceptedCgu: true,
    },
  })
  expect(res.ok(), `inscription vendeur → ${res.status()} ${await res.text()}`).toBe(true)
  return { email }
}

/** PNG 1×1 valide (le serveur vérifie le MIME réel, pas l'extension). */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * Trois photos MIME-valides pour `POST /api/products` (minimum serveur).
 *
 * Noms distincts pour éviter tout écrasement côté récepteur. Utilisées par
 * `setInputFiles` (qui accepte un tableau de payloads) dans les specs UI.
 */
export const PHOTOS_3 = [1, 2, 3].map((n) => ({
  name: `photo-${n}.png`,
  mimeType: 'image/png',
  buffer: PNG_1PX,
}))

/**
 * Corps multipart de `POST /api/products` : champs texte + les 3 photos exigées.
 *
 * ⚠️ Une **valeur objet** unique pour le champ `photos` n'envoie qu'**un seul**
 * fichier ; un **tableau** est refusé par les types de Playwright 1.63
 * (`multipart` n'accepte qu'un objet de champs ou une `FormData`). On passe donc
 * par `FormData`, l'API officielle pour répéter un même nom de champ fichier.
 */
function productMultipart(fields: Record<string, string>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  for (const photo of PHOTOS_3) {
    form.append('photos', new File([photo.buffer], photo.name, { type: photo.mimeType }))
  }
  return form
}

/** Champs d'inscription d'un compte jetable (vendeur ou acheteur). */
function accountBody(label: string, role: 'Vendeur' | 'Acheteur', email: string): Record<string, unknown> {
  // `displayName` est validé par `^[A-Za-zÀ-ÿ0-9 ]+$` (2–50) : on assainit.
  const safeLabel = label.replace(/[^A-Za-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
  return {
    displayName: `${role} ${safeLabel}`,
    name: `${role} ${safeLabel}`,
    email,
    phone: `${role === 'Vendeur' ? '77' : '76'}${String(Math.floor(Math.random() * 10000000)).padStart(8, '0')}`,
    password: `${role}-Recette-42!`,
    acceptedCgu: true,
  }
}

/**
 * Crée un vendeur, son article approuvé, via l'API uniquement (setup).
 *
 * ⚠️ **Inscription volontairement anonyme** (cookie de session vide, seul le
 * cookie CSRF est envoyé via `cookieWithCsrf`) : `POST /api/auth/register`
 * régénère la session (protection contre la fixation de session) et **détruit**
 * toute session portée par la requête. Sans ce garde-fou, le contexte API (dont
 * le cookie-jar porte la session admin) voit sa session admin révoquée → toutes
 * les pages admin basculent en 401 (constaté : l'e2e « détail commande »
 * échouait avec `UNAUTHENTICATED` alors que la sidebar affichait l'admin). On
 * rend donc chaque inscription explicitement anonyme **tout en satisfaisant la
 * double soumission CSRF** exigée sur les mutations.
 *
 * Renvoie de quoi ouvrir une page vendeur (identifiants) et piloter l'article.
 */
export async function seedApprovedProduct(
  request: APIRequestContext,
  { label = 'e2e-prod' }: { label?: string } = {},
): Promise<{ productId: number; slug: string; name: string; sellerEmail: string; sellerPassword: string }> {
  const now = Date.now().toString(36)
  const sellerEmail = `${label}-vend-${now}-${Math.random().toString(36).slice(2)}@test.revends`
  const sellerRes = await request.post('/api/auth/register', {
    headers: { ...(await primeCsrf(request)), Cookie: await cookieWithCsrf(request) },
    data: accountBody(label, 'Vendeur', sellerEmail),
  })
  expect(sellerRes.ok(), `inscription vendeur seed → ${sellerRes.status()} ${await sellerRes.text()}`).toBe(true)
  const sellerCookie = sessionCookieFrom(sellerRes)

  // L'article naît PENDING ; on le crée en tant que vendeur (cookie explicite,
  // jamais celui du jar, qui pourrait porter une autre session).
  const prodRes = await request.post('/api/products', {
    multipart: productMultipart({
      name: `Article seed ${label} ${now}`,
      categoryId: String(CATEGORY.categoryId),
      subcategoryId: String(CATEGORY.subcategoryId),
      condition: 'Très bon état',
      price: '25000',
      location: 'Dakar Plateau',
      description: `Article seed e2e — ${label}.`,
    }),
    headers: { ...(await csrfHeaders(request)), Cookie: await cookieWithCsrf(request, sellerCookie) },
  })
  expect(prodRes.ok(), `création article seed → ${prodRes.status()} ${await prodRes.text()}`).toBe(true)
  const product = (await prodRes.json()).product as { id: number; name: string; slug: string }

  // Approbation admin (cookie explicite depuis global-setup).
  const admin = adminCookieHeader()
  const approveRes = await request.post(`/api/admin/products/${product.id}/approve`, {
    headers: { ...(await csrfHeaders(request)), Cookie: await cookieWithCsrf(request, admin ?? '') },
    data: {},
  })
  expect(approveRes.ok(), `approbation seed → ${approveRes.status()} ${await approveRes.text()}`).toBe(true)

  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    sellerEmail,
    sellerPassword: 'Vendeur-Recette-42!',
  }
}

/**
 * Crée une commande complète via l'API uniquement (setup).
 * 1. Approuve un article vendeur (`seedApprovedProduct`) ;
 * 2. crée un **acheteur distinct** (inscription anonyme) ;
 * 3. passe la commande (`POST /api/orders`).
 * Renvoie `{ orderId, orderNumber }`.
 */
export async function seedOrder(
  request: APIRequestContext,
  { label = 'e2e-order' }: { label?: string } = {},
): Promise<{ orderId: number; orderNumber: string }> {
  const now = Date.now().toString(36)
  const seeded = await seedApprovedProduct(request, { label })

  const buyerEmail = `${label}-buyer-${now}-${Math.random().toString(36).slice(2)}@test.revends`
  const buyerRes = await request.post('/api/auth/register', {
    headers: { ...(await primeCsrf(request)), Cookie: await cookieWithCsrf(request) },
    data: accountBody(label, 'Acheteur', buyerEmail),
  })
  expect(buyerRes.ok(), `inscription acheteur seed → ${buyerRes.status()} ${await buyerRes.text()}`).toBe(true)
  const buyerCookie = sessionCookieFrom(buyerRes)

  const orderRes = await request.post('/api/orders', {
    headers: { ...(await csrfHeaders(request)), Cookie: await cookieWithCsrf(request, buyerCookie) },
    data: { productId: seeded.productId, paymentMethod: 'MOBILE_MONEY' },
  })
  expect(orderRes.ok(), `création commande seed → ${orderRes.status()} ${await orderRes.text()}`).toBe(true)
  const orderBody = await orderRes.json()
  return { orderId: orderBody.order.id, orderNumber: orderBody.order.orderNumber }
}

/**
 * Crée un article via l'API (multipart, 3 photos — minimum exigé par le serveur).
 * Nécessaire parce que la fiche de vente exige 3 photos côté UI : inutile
 * d'ouvrir le formulaire pour prouver le contrat admin.
 *
 * L'article naît `PENDING` : c'est exactement l'état que la page
 * « Articles en attente » doit valider.
 *
 * `cookie` (optionnel) : session vendeur explicite. Sans lui, l'appel utilise le
 * cookie-jar du contexte — utile quand c'est déjà le vendeur courant, à éviter
 * quand le jar porte une session admin (l'article serait attribué à l'admin).
 */
export async function createProductViaApi(
  request: APIRequestContext,
  name: string,
  cookie?: string,
): Promise<{ id: number; name: string; slug: string }> {
  const res = await request.post('/api/products', {
    headers: {
      ...(await primeCsrf(request)),
      ...(cookie ? { Cookie: await cookieWithCsrf(request, cookie) } : {}),
    },
    multipart: productMultipart({
      name,
      categoryId: String(CATEGORY.categoryId),
      subcategoryId: String(CATEGORY.subcategoryId),
      condition: 'Très bon état',
      price: '25000',
      location: 'Dakar Plateau',
      description: `Article de recette e2e créé automatiquement — ${name}.`,
    }),
  })
  expect(res.ok(), `création article → ${res.status()} ${await res.text()}`).toBe(true)
  const body = (await res.json()) as { product: { id: number; name: string; slug: string } }
  return body.product
}

/**
 * Sème un article **PENDING** via l'API (vendeur jetable + cookie explicite).
 *
 * Pourquoi : la page admin « Articles en attente » n'affiche un tableau que
 * s'il existe au moins un article à modérer. La base de recette (`revends_e2e`)
 * étant désormais **isolée et remise à zéro**, une spec ne peut plus compter sur
 * les articles laissés par une autre → chaqu'une sème le sien (autonomie des
 * specs, cf. strategie-tests).
 */
export async function seedPendingProduct(
  request: APIRequestContext,
  { label = 'e2e-pending' }: { label?: string } = {},
): Promise<{ id: number; name: string; slug: string }> {
  const now = Date.now().toString(36)
  const sellerEmail = `${label}-vend-${now}-${Math.random().toString(36).slice(2)}@test.revends`
  const sellerRes = await request.post('/api/auth/register', {
    headers: { ...(await primeCsrf(request)), Cookie: await cookieWithCsrf(request) },
    data: accountBody(label, 'Vendeur', sellerEmail),
  })
  expect(sellerRes.ok(), `inscription vendeur seed pending → ${sellerRes.status()} ${await sellerRes.text()}`).toBe(true)
  const sellerCookie = sessionCookieFrom(sellerRes)
  return createProductViaApi(request, `Article en attente ${label} ${now}`, sellerCookie)
}

/** Erreurs déjà collectées pour cette page (une seule écoute, pas d'accumulation). */
const errorStore = new WeakMap<Page, string[]>()

/**
 * Collecte les erreurs console + les 404 d'assets.
 *
 * Idempotent : les écouteurs sont posés **une fois** par page. Sur une page
 * partagée, un `page.on()` à chaque test empilerait les écouteurs et
 * remonterait les erreurs du test précédent.
 */
export function collectPageErrors(page: Page): { errors: string[] } {
  let store = errorStore.get(page)
  if (!store) {
    store = []
    errorStore.set(page, store)
    page.on('console', (msg) => {
      if (msg.type() === 'error') store!.push(`console: ${msg.text()}`)
    })
    page.on('pageerror', (err) => store!.push(`pageerror: ${err.message}`))
    page.on('response', (res) => {
      if (res.status() === 404) store!.push(`404: ${res.url()}`)
    })
  }
  // Remise à zéro : chaque test ne doit voir que SES erreurs.
  store.length = 0
  return { errors: store }
}

/** Attend que la zone principale soit prête (données chargées, squelette parti). */
export async function waitForContent(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('[class*="animate-pulse"], [aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
}
