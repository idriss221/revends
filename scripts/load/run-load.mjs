/**
 * Charge progressive réelle — générateur HTTP keep-alive + échantillonneur séparé.
 *
 * Pourquoi pas autocannon : il n'expose que p50/p90/p97,5/p99, jamais p95.
 * Recopier p97,5 dans une colonne « P95 » serait un chiffre maquillé. Ici,
 * chaque requête est chronométrée individuellement et les percentiles sont
 * calculés exactement (tri des durées), comme le demande la recette.
 *
 * Pourquoi un échantillonneur dans un PROCESSUS SÉPARÉ (`sampler.mjs`) :
 * `docker stats` / `psql` sont bloquants ; exécutés dans le générateur, ils
 * gelaient sa boucle d'événements et gonflaient les latences mesurées.
 *
 * Ce script n'est PAS une simulation : il envoie de vraies requêtes HTTP à
 * l'upstream NGINX (`http://127.0.0.1:8080`), qui répartit sur api1/api2/api3,
 * et mesure :
 *   · RPS, latence P50/P95/P99 (exactes), max, erreurs, codes de statut ;
 *   · CPU % et RAM par conteneur, connexions PostgreSQL, mémoire Redis ;
 *   · distribution des instances (`X-Instance-Id`).
 *
 * Usage :
 *   node scripts/load/run-load.mjs --levels 10,25,50 --duration 15 --out /tmp/load.json
 *   node scripts/load/run-load.mjs --spike
 *   node scripts/load/run-load.mjs --endurance 300 --connections 50
 */
import http from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const has = (name) => args.includes(name)

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = arg('--base', 'http://127.0.0.1:8080')
const DURATION = Number(arg('--duration', '15'))
const LEVELS = (arg('--levels', '10,25,50,100,250,500,1000')).split(',').map(Number)
const OUT = arg('--out', '/tmp/opencode/load-progressive.json')
const MODE = has('--spike') ? 'spike' : has('--endurance') ? 'endurance' : 'progressive'
const ENDURANCE_SECONDS = Number(arg('--endurance', '300'))

const PATHS = ['/api/categories', '/api/products?page=1&per_page=12', '/api/banners']

/** Pool de sockets keep-alive : une connexion TCP ne coûte pas un handshake par requête. */
const agent = new http.Agent({ keepAlive: true, maxSockets: 2500, keepAliveMsecs: 30000 })

function request(path) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint()
    const req = http.get(`${BASE}${path}`, { agent }, (res) => {
      res.resume()
      res.on('end', () =>
        resolve({
          ms: Number(process.hrtime.bigint() - started) / 1e6,
          status: res.statusCode,
          instance: res.headers['x-instance-id'] ?? 'unknown',
        }),
      )
    })
    req.on('error', () =>
      resolve({ ms: Number(process.hrtime.bigint() - started) / 1e6, status: 0, instance: 'error' }),
    )
    req.setTimeout(30000, () => req.destroy(new Error('timeout')))
  })
}

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return +sorted[Math.max(0, Math.min(idx, sorted.length - 1))].toFixed(1)
}

/** Démarre l'échantillonneur hors du processus de mesure. */
function startSampler(outFile) {
  const child = spawn(process.execPath, [join(HERE, 'sampler.mjs'), '--out', outFile, '--interval', '1000'], {
    stdio: 'ignore',
    detached: false,
  })
  return child
}

function stopSampler(child) {
  return new Promise((resolve) => {
    if (!child || child.killed) return resolve()
    child.once('exit', () => resolve())
    child.kill('SIGTERM')
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* déjà mort */
      }
      resolve()
    }, 3000)
  })
}

function readSamples(file) {
  try {
    return readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

function aggregateResources(samples) {
  const by = {}
  for (const s of samples) for (const c of s.containers) (by[c.name] ??= []).push(c)
  const out = {}
  for (const [name, list] of Object.entries(by)) {
    const cpu = list.map((c) => c.cpu)
    const mem = list.map((c) => c.memMB)
    out[name] = {
      cpuAvg: +(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(1),
      cpuMax: +Math.max(...cpu).toFixed(1),
      memAvgMB: Math.round(mem.reduce((a, b) => a + b, 0) / mem.length),
      memMaxMB: Math.round(Math.max(...mem)),
      samples: list.length,
    }
  }
  const db = samples.map((s) => s.dbConns).filter((v) => v != null)
  const redis = samples.map((s) => s.redisMB).filter((v) => v != null)
  if (out.revends_postgres) out.revends_postgres.connectionsMax = db.length ? Math.max(...db) : null
  if (out.revends_redis) out.revends_redis.usedMemMaxMB = redis.length ? +Math.max(...redis).toFixed(1) : null
  return out
}

/** Exécute `connections` boucles concurrentes pendant `durationS` secondes. */
async function runLevel(connections, durationS) {
  const sampleFile = `/tmp/opencode/samples-${MODE}-${connections}.jsonl`
  const sampler = startSampler(sampleFile)
  // Laisse à l'échantillonneur le temps de produire sa première mesure.
  await new Promise((r) => setTimeout(r, 1200))

  const stopAt = Date.now() + durationS * 1000
  const codes = {}
  const instances = {}
  let latencies = []

  async function worker() {
    const local = []
    while (Date.now() < stopAt) {
      const r = await request(PATHS[(Math.random() * PATHS.length) | 0])
      local.push(r.ms)
      codes[r.status] = (codes[r.status] ?? 0) + 1
      instances[r.instance] = (instances[r.instance] ?? 0) + 1
    }
    return local
  }

  const started = Date.now()
  const chunks = await Promise.all(Array.from({ length: connections }, worker))
  const wallMs = Date.now() - started
  for (const c of chunks) latencies = latencies.concat(c)
  await stopSampler(sampler)

  const sorted = latencies.slice().sort((a, b) => a - b)
  const errors =
    (codes[0] ?? 0) + Object.entries(codes).filter(([k]) => Number(k) >= 500).reduce((a, [, v]) => a + v, 0)
  const non2xx = Object.entries(codes)
    .filter(([k]) => k !== '0' && (Number(k) < 200 || Number(k) >= 300))
    .reduce((a, [, v]) => a + v, 0)

  return {
    connections,
    durationS: +(wallMs / 1000).toFixed(1),
    total: latencies.length,
    rps: Math.round(latencies.length / (wallMs / 1000)),
    latency: {
      mean: +(sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1)).toFixed(1),
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: +Math.max(...sorted).toFixed(1),
    },
    errors,
    non2xx,
    statusCodes: codes,
    distribution: instances,
    resources: aggregateResources(readSamples(sampleFile)),
  }
}

const main = async () => {
  const results = []
  if (MODE === 'progressive') for (const c of LEVELS) results.push(await runLevel(c, DURATION))
  else if (MODE === 'spike') for (const c of [50, 100, 250, 500]) results.push(await runLevel(c, 10))
  else results.push(await runLevel(Number(arg('--connections', '50')), ENDURANCE_SECONDS))

  const report = { mode: MODE, base: BASE, at: new Date().toISOString(), results }
  writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(`\n✅ Rapport écrit : ${OUT}`)
  for (const r of results) {
    console.log(
      `  c=${r.connections}  ${r.rps} req/s  p50=${r.latency.p50}ms p95=${r.latency.p95}ms p99=${r.latency.p99}ms  err=${r.errors} non2xx=${r.non2xx}  total=${r.total}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
