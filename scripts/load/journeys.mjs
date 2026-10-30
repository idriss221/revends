/**
 * Charge sur PARCOURS RÉELS — navigation, recherche, catalogue, fiche produit,
 * login, panier (ajout, quantité, suppression), à travers NGINX (3 instances).
 *
 * Chaque connexion virtuelle incarne UN utilisateur distinct (session + panier
 * isolés), ce qui évite les 409 artificiels d'un panier partagé. Les durées
 * sont mesurées par étape et les percentiles calculés exactement.
 *
 * Usage :
 *   node scripts/load/journeys.mjs --connections 50 --duration 20 --out /tmp/opencode/journeys-50.json
 */
import http from 'node:http'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const BASE = arg('--base', 'http://127.0.0.1:8080')
const CONNECTIONS = Number(arg('--connections', '20'))
const DURATION = Number(arg('--duration', '20'))
const OUT = arg('--out', '/tmp/opencode/journeys.json')
const PASSWORD = arg('--password', 'LoadTest-2026!')

const agent = new http.Agent({ keepAlive: true, maxSockets: CONNECTIONS + 5, keepAliveMsecs: 30000 })

function req(path, { method = 'GET', body, jar, extraHeaders } = {}) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint()
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const headers = { Origin: BASE, ...extraHeaders }
    if (jar?.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    if (jar?.get('csrf_token')) headers['X-CSRF-Token'] = jar.get('csrf_token')
    if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = payload.length }
    const r = http.request(`${BASE}${path}`, { method, headers, agent }, (res) => {
      const setCookies = res.headers['set-cookie'] ?? []
      for (const line of setCookies) {
        const [pair] = line.split(';')
        const eq = pair.indexOf('=')
        if (eq > 0 && jar) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
      }
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { text += c })
      res.on('end', () => {
        let json = null
        try { json = text ? JSON.parse(text) : null } catch { /* */ }
        resolve({
          ms: Number(process.hrtime.bigint() - started) / 1e6,
          status: res.statusCode,
          json,
          instance: res.headers['x-instance-id'] ?? 'unknown',
        })
      })
    })
    r.on('error', (err) => resolve({ ms: Number(process.hrtime.bigint() - started) / 1e6, status: 0, error: err.code ?? 'ERR' }))
    r.setTimeout(30000, () => r.destroy(new Error('timeout')))
    if (payload) r.write(payload)
    r.end()
  })
}

const pct = (arr, p) => {
  if (arr.length === 0) return 0
  const s = [...arr].sort((a, b) => a - b)
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 10) / 10
}
const round1 = (n) => Math.round(n * 10) / 10

// Produit cible + terme de recherche résolus une fois (données réelles).
const boot = await req('/api/products?page=1&per_page=1')
const product = boot.json?.items?.[0] ?? boot.json?.products?.[0]
if (!product) throw new Error('aucun produit disponible pour le parcours')
const slug = product.slug
const productId = product.id
const TERMS = ['chemise', 'sac', 'basket', 'chaise', 'lin', 'cuir']

const stats = {}
const record = (step, r) => {
  const s = (stats[step] ??= { ms: [], statuses: {}, instances: {} })
  s.ms.push(r.ms)
  s.statuses[r.status] = (s.statuses[r.status] ?? 0) + 1
  s.instances[r.instance] = (s.instances[r.instance] ?? 0) + 1
}

// Barrière : tous les logins (bcrypt, coûteux) sont terminés AVANT de mesurer,
// sinon la rafale d'authentification fausse le débit des parcours.
let running = false
let deadline = Number.POSITIVE_INFINITY
let seq = 0
const readyResolvers = []
const ready = Array.from({ length: CONNECTIONS }, () => new Promise((r) => readyResolvers.push(r)))

async function worker(slot) {
  const jar = new Map()
  const userIndex = ((slot % 100) + 1)
  await req('/api/health', { jar })
  const login = await req('/api/auth/login', {
    method: 'POST',
    jar,
    body: { identifier: `load${userIndex}@revends.test`, password: PASSWORD },
  })
  readyResolvers[slot]({ ok: login.status === 200, ms: login.ms })
  if (login.status !== 200) return
  while (!running) await new Promise((r) => setTimeout(r, 10))

  while (Date.now() < deadline) {
    const term = TERMS[(seq++ + slot) % TERMS.length]
    record('recherche', await req(`/api/products?page=1&per_page=12&q=${term}`, { jar }))
    record('catalogue', await req('/api/products?page=1&per_page=12', { jar }))
    record('fiche produit', await req(`/api/products/${slug}`, { jar }))
    record('categories', await req('/api/categories', { jar }))
    record('panier (lecture)', await req('/api/cart', { jar }))
    record('panier (ajout)', await req('/api/cart', { method: 'POST', jar, body: { productId, qty: 1 } }))
    record('panier (quantité)', await req(`/api/cart/${productId}`, { method: 'PATCH', jar, body: { qty: 2 } }))
    record('panier (retrait)', await req(`/api/cart/${productId}`, { method: 'DELETE', jar }))
  }
}

const workers = Array.from({ length: CONNECTIONS }, (_, i) => worker(i))
const readiness = await Promise.all(ready)
const connected = readiness.filter((r) => r.ok).length
stats.login = { ms: readiness.map((r) => r.ms), statuses: { 200: connected }, instances: {} }

const t0 = Date.now()
deadline = t0 + DURATION * 1000
running = true
await Promise.all(workers)
const durationS = round1((Date.now() - t0) / 1000)

const steps = {}
for (const [name, s] of Object.entries(stats)) {
  const errors = Object.entries(s.statuses).filter(([code]) => code === '0' || Number(code) >= 400)
  steps[name] = {
    count: s.ms.length,
    rps: round1(s.ms.length / durationS),
    mean: round1(s.ms.reduce((a, b) => a + b, 0) / s.ms.length),
    p50: pct(s.ms, 50),
    p95: pct(s.ms, 95),
    p99: pct(s.ms, 99),
    max: round1(Math.max(...s.ms)),
    statuses: s.statuses,
    errors: errors.reduce((a, [, n]) => a + n, 0),
    instances: s.instances,
  }
}

const total = Object.values(steps).reduce((a, s) => a + s.count, 0)
const report = {
  at: new Date().toISOString(),
  base: BASE,
  connections: CONNECTIONS,
  durationS,
  totalRequests: total,
  rps: round1(total / durationS),
  steps,
}
const { writeFileSync } = await import('node:fs')
writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(`parcours réels — ${CONNECTIONS} conn., ${durationS}s, ${total} requêtes, ${report.rps} req/s`)
for (const [name, s] of Object.entries(steps)) {
  console.log(`  ${name.padEnd(20)} n=${String(s.count).padStart(6)} p50=${String(s.p50).padStart(7)} p95=${String(s.p95).padStart(7)} p99=${String(s.p99).padStart(7)} err=${s.errors} ${JSON.stringify(s.statuses)}`)
}
