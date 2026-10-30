/**
 * Concurrence réelle — doublons, double commande, lost update, deadlocks.
 *
 * Ce script n'est PAS une simulation : il envoie des requêtes HTTP
 * **réellement concurrentes** (`Promise.all`) à l'upstream NGINX
 * (`http://127.0.0.1:8080`), qui les répartit sur api1/api2/api3. Les trois
 * instances partagent la même base PostgreSQL : c'est donc la vraie course
 * inter-processus qui est testée, pas un verrou en mémoire locale.
 *
 * Scénarios :
 *   A. Inscription concurrente du MÊME e-mail (10 requêtes) → 1 seul 201.
 *   B. Achat concurrent du MÊME article par 8 acheteurs → 1 seule commande,
 *      les autres en 409 PRODUCT_RESERVED, zéro 5xx (pas de lost update).
 *   C. Double checkout du MÊME panier (5 requêtes) → 1 seule commande.
 *   D. 12 commandes concurrentes sur 12 articles DISTINCTS → 12 succès,
 *      zéro 5xx, zéro deadlock PostgreSQL.
 *
 * Chaque verdict est vérifié en base (`psql`), pas seulement sur les codes HTTP.
 *
 * Usage : node scripts/load/concurrency.mjs [--base http://127.0.0.1:8080]
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const BASE = arg('--base', 'http://127.0.0.1:8080')
const OUT = arg('--out', '/tmp/opencode/concurrency.json')
const RUN = Date.now().toString(36)

/** PNG 1×1 valide (le serveur vérifie les magic bytes, pas l'extension). */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// ─────────────────────────── client HTTP à cookie-jar ───────────────────────────

class Session {
  constructor() {
    this.cookies = new Map()
  }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  absorb(res) {
    const raw = res.headers.getSetCookie?.() ?? []
    for (const line of raw) {
      const [pair] = line.split(';')
      const idx = pair.indexOf('=')
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim())
    }
  }

  async request(path, { method = 'GET', body, form, csrf = method !== 'GET' } = {}) {
    const headers = {}
    if (this.cookies.size) headers.Cookie = this.cookieHeader()
    if (csrf) headers['X-CSRF-Token'] = this.cookies.get('csrf_token') ?? ''
    let payload
    if (form) payload = form
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    const res = await fetch(`${BASE}${path}`, { method, headers, body: payload })
    this.absorb(res)
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* non JSON */
    }
    return { status: res.status, json, text, headers: res.headers }
  }

  /** Ouvre une session anonyme : récupère le cookie CSRF. */
  async init() {
    await this.request('/api/categories', { method: 'GET' })
    return this
  }
}

function account(label, role, email) {
  const n = Math.floor(Math.random() * 10_000_000)
    .toString()
    .padStart(7, '0')
  return {
    displayName: `${role} ${label}`.slice(0, 50),
    name: `${role} ${label}`,
    email,
    phone: `+2217${role === 'Vendeur' ? '7' : '6'}${n}`,
    password: 'Concurrence-42!',
    acceptedCgu: true,
  }
}

/** Un label humain (« sel B », « buy d3 ») n'est pas un local-part valide. */
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function register(label, role = 'Acheteur') {
  const session = await new Session().init()
  const email = `conc-${slug(label)}-${RUN}-${Math.random().toString(36).slice(2, 8)}@test.revends`
  const res = await session.request('/api/auth/register', { method: 'POST', body: account(label, role, email) })
  if (res.status !== 201) throw new Error(`inscription ${label} → ${res.status} ${res.text.slice(0, 200)}`)
  return { session, email }
}

const adminSession = async () => {
  const session = await new Session().init()
  const email = process.env.ADMIN_EMAIL ?? 'admin@revends.com'
  const password = process.env.ADMIN_PASSWORD
  if (!password) throw new Error('ADMIN_PASSWORD manquant')
  const res = await session.request('/api/auth/login', { method: 'POST', body: { identifier: email, password } })
  if (res.status !== 200) throw new Error(`login admin → ${res.status}`)
  return session
}

function productForm(name) {
  const form = new FormData()
  form.append('name', name)
  form.append('categoryId', '3')
  form.append('subcategoryId', '13')
  form.append('condition', 'Très bon état')
  form.append('price', '25000')
  form.append('location', 'Dakar Plateau')
  form.append('description', `Article de test concurrence — ${name}.`)
  for (let i = 1; i <= 3; i++) {
    form.append('photos', new File([PNG_1PX], `photo-${i}.png`, { type: 'image/png' }))
  }
  return form
}

async function approvedProduct(admin, label) {
  const seller = await register(`sel ${label}`, 'Vendeur')
  const created = await seller.session.request('/api/products', {
    method: 'POST',
    form: productForm(`Article concurrence ${label} ${RUN}`),
  })
  if (created.status !== 201) throw new Error(`création produit → ${created.status} ${created.text.slice(0, 300)}`)
  const id = created.json.product.id
  const ok = await admin.request(`/api/admin/products/${id}/approve`, { method: 'POST', body: {} })
  if (ok.status !== 200 && ok.status !== 204) throw new Error(`approbation → ${ok.status} ${ok.text.slice(0, 200)}`)
  return id
}

// ──────────────────────────────── base de données ────────────────────────────────

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', 'revends_postgres', 'psql', '-U', 'revends', '-d', 'revends', '-tAc', sql],
    { encoding: 'utf8', timeout: 15000 },
  ).trim()
}

const orderCountFor = (productId) =>
  Number(psql(`select count(*) from orders where product_id = ${Number(productId)} and status <> 'CANCELLED'`))

const deadlockCount = () => {
  try {
    const logs = execFileSync('docker', ['logs', 'revends_postgres'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return (logs.match(/deadlock detected/gi) ?? []).length
  } catch (e) {
    // docker logs écrit sur stderr : execFileSync lève, mais la sortie reste lisible.
    const all = `${e.stdout ?? ''}${e.stderr ?? ''}`
    return (all.match(/deadlock detected/gi) ?? []).length
  }
}

const tally = (results) => {
  const codes = {}
  for (const r of results) codes[r.status] = (codes[r.status] ?? 0) + 1
  const serverErrors = results.filter((r) => r.status >= 500)
  return { codes, serverErrors: serverErrors.length, total: results.length }
}

const detail = (results) => results.map((r) => ({ status: r.status, code: r.json?.error?.code ?? null }))

// ────────────────────────────────── scénarios ──────────────────────────────────

async function scenarioA(admin) {
  const email = `dup-${RUN}@test.revends`
  const sessions = await Promise.all(Array.from({ length: 10 }, () => new Session().init()))
  const payload = account('Doublon', 'Acheteur', email)
  const results = await Promise.all(
    sessions.map((s) => s.request('/api/auth/register', { method: 'POST', body: payload })),
  )
  const t = tally(results)
  const rows = Number(psql(`select count(*) from users where email = '${email}'`))
  return {
    scenario: 'A — inscription concurrente du même e-mail (10×)',
    ...t,
    details: detail(results),
    db: { usersWithEmail: rows },
    pass: t.codes[201] === 1 && t.serverErrors === 0 && rows === 1,
  }
}

async function scenarioB(admin) {
  const productId = await approvedProduct(admin, 'B')
  const buyers = await Promise.all(Array.from({ length: 8 }, (_, i) => register(`buy b${i}`)))
  const results = await Promise.all(
    buyers.map(({ session }) =>
      session.request('/api/orders', { method: 'POST', body: { productId, paymentMethod: 'MOBILE_MONEY' } }),
    ),
  )
  const t = tally(results)
  const rows = orderCountFor(productId)
  const status = psql(`select status from products where id = ${productId}`)
  return {
    scenario: 'B — 8 acheteurs achètent le MÊME article en parallèle',
    productId,
    ...t,
    details: detail(results),
    db: { ordersForProduct: rows, productStatus: status },
    pass: t.codes[201] === 1 && t.serverErrors === 0 && rows === 1 && ['RESERVED', 'SOLD', 'PAYMENT_PENDING'].includes(status),
  }
}

async function scenarioC(admin) {
  const productId = await approvedProduct(admin, 'C')
  const buyer = await register('buy cart')
  const added = await buyer.session.request('/api/cart', { method: 'POST', body: { productId, qty: 1 } })
  if (added.status !== 201) throw new Error(`ajout panier → ${added.status} ${added.text.slice(0, 200)}`)
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      buyer.session.request('/api/orders/checkout', {
        method: 'POST',
        body: { productIds: [productId], paymentMethod: 'MOBILE_MONEY' },
      }),
    ),
  )
  const t = tally(results)
  const rows = orderCountFor(productId)
  return {
    scenario: 'C — double checkout du MÊME panier (5 requêtes simultanées)',
    productId,
    ...t,
    details: detail(results),
    db: { ordersForProduct: rows },
    pass: t.codes[201] === 1 && t.serverErrors === 0 && rows === 1,
  }
}

async function scenarioD(admin) {
  const before = deadlockCount()
  const products = await Promise.all(Array.from({ length: 12 }, (_, i) => approvedProduct(admin, `D${i}`)))
  const buyers = await Promise.all(Array.from({ length: 12 }, (_, i) => register(`buy d${i}`)))
  const results = await Promise.all(
    products.map((productId, i) =>
      buyers[i].session.request('/api/orders', { method: 'POST', body: { productId, paymentMethod: 'MOBILE_MONEY' } }),
    ),
  )
  const after = deadlockCount()
  const t = tally(results)
  const rows = products.map(orderCountFor)
  return {
    scenario: 'D — 12 commandes simultanées sur 12 articles DISTINCTS',
    ...t,
    details: detail(results),
    db: { ordersPerProduct: rows, deadlocksBefore: before, deadlocksAfter: after },
    pass: t.codes[201] === 12 && t.serverErrors === 0 && rows.every((n) => n === 1) && after === before,
  }
}

// ─────────────────────────────────── exécution ───────────────────────────────────

const main = async () => {
  console.log(`▶ Concurrence réelle sur ${BASE} (RUN=${RUN})`)
  const admin = await adminSession()
  const scenarios = []
  for (const run of [scenarioA, scenarioB, scenarioC, scenarioD]) {
    try {
      const r = await run(admin)
      scenarios.push(r)
      console.log(`${r.pass ? '✅' : '❌'} ${r.scenario} — codes=${JSON.stringify(r.codes)} 5xx=${r.serverErrors}`)
    } catch (err) {
      scenarios.push({ scenario: run.name, pass: false, error: err.message })
      console.log(`❌ ${run.name} — ${err.message}`)
    }
  }
  const report = { base: BASE, at: new Date().toISOString(), run: RUN, scenarios }
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  const failed = scenarios.filter((s) => !s.pass).length
  console.log(`\n${failed === 0 ? '✅' : '❌'} ${scenarios.length - failed}/${scenarios.length} scénarios PASS — rapport ${OUT}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
