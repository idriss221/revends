/**
 * Failover réel des instances API derrière NGINX.
 *
 * Le cluster : NGINX (`:8080`) → upstream api1/api2/api3 (`max_fails=3
 * fail_timeout=10s`). Ce script arrête RÉELLEMENT des conteneurs Docker et
 * mesure, requête par requête :
 *   · la fenêtre de détection (juste après l'arrêt) — des 502 sont attendus,
 *     c'est le coût du health-check passif ;
 *   · le régime établi après `fail_timeout` — 0 erreur attendue ;
 *   · la distribution `X-Instance-Id` ;
 *   · le retour à la normale après redémarrage.
 *
 * Aucune simulation : `docker stop` / `docker start` + vrai trafic HTTP.
 *
 * Usage : node scripts/load/failover.mjs
 */
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const BASE = process.env.FAILOVER_BASE ?? 'http://127.0.0.1:8080'
const OUT = process.env.FAILOVER_OUT ?? '/tmp/opencode/failover.json'
const PATHS = ['/api/health', '/api/categories', '/api/products?page=1&per_page=12']
const agent = new http.Agent({ keepAlive: true, maxSockets: 200 })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function get(path) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint()
    const req = http.get(`${BASE}${path}`, { agent }, (res) => {
      res.resume()
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          instance: res.headers['x-instance-id'] ?? 'none',
          ms: Number(process.hrtime.bigint() - started) / 1e6,
        }),
      )
    })
    req.on('error', () =>
      resolve({ status: 0, instance: 'error', ms: Number(process.hrtime.bigint() - started) / 1e6 }),
    )
    req.setTimeout(15000, () => req.destroy(new Error('timeout')))
  })
}

async function burst(n) {
  const out = []
  for (let i = 0; i < n; i++) out.push(await get(PATHS[i % PATHS.length]))
  return out
}

const summarize = (label, results) => {
  const codes = {}
  const instances = {}
  for (const r of results) {
    codes[r.status] = (codes[r.status] ?? 0) + 1
    instances[r.instance] = (instances[r.instance] ?? 0) + 1
  }
  const ok = results.filter((r) => r.status === 200).length
  const sorted = results.map((r) => r.ms).sort((a, b) => a - b)
  return {
    label,
    total: results.length,
    ok,
    codes,
    instances,
    p95ms: +sorted[Math.ceil(0.95 * sorted.length) - 1].toFixed(1),
    maxMs: +Math.max(...sorted).toFixed(1),
  }
}

const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', timeout: 60000 })

const main = async () => {
  const steps = []

  // 0. Référence : les 3 instances sont vivantes.
  steps.push(summarize('référence — 3 instances', await burst(90)))

  // 1. Arrêt d'api2 : on mesure D'ABORD la fenêtre de détection.
  docker('stop', 'revends_api2')
  steps.push(summarize('api2 arrêtée — fenêtre de détection (immédiat)', await burst(30)))
  await sleep(12000)
  steps.push(summarize('api2 arrêtée — régime établi (après fail_timeout)', await burst(90)))

  // 2. Arrêt d'api3 : plus qu'une instance.
  docker('stop', 'revends_api3')
  await sleep(12000)
  steps.push(summarize('api2+api3 arrêtées — api1 seule', await burst(90)))

  // 3. Retour à la normale.
  docker('start', 'revends_api2', 'revends_api3')
  await sleep(12000)
  steps.push(summarize('redémarrage — 3 instances', await burst(120)))

  const verdict = {
    // Fenêtre de détection : l'objectif n'est PAS de voir des 502, c'est de ne
    // perdre aucune requête. Grâce à `proxy_connect_timeout 2s` +
    // `proxy_next_upstream`, l'instance morte coûte au pire ~2 s puis la
    // requête est rejouée sur une instance saine.
    detectionWindowNoClientError: steps[1].ok === steps[1].total,
    detectionWindowMaxMs: steps[1].maxMs,
    steadyApi2Down:
      steps[2].ok === steps[2].total && !('api2' in steps[2].instances) && 'api1-dev' in steps[2].instances,
    singleInstance: steps[3].ok === steps[3].total && Object.keys(steps[3].instances).length === 1,
    recovery: steps[4].ok === steps[4].total && Object.keys(steps[4].instances).length === 3,
  }
  const pass =
    verdict.detectionWindowNoClientError &&
    verdict.steadyApi2Down &&
    verdict.singleInstance &&
    verdict.recovery

  const report = { base: BASE, at: new Date().toISOString(), steps, verdict, pass }
  writeFileSync(OUT, JSON.stringify(report, null, 2))

  for (const s of steps) {
    console.log(
      `${s.label}\n   ${s.ok}/${s.total} OK  codes=${JSON.stringify(s.codes)}  instances=${JSON.stringify(s.instances)}  p95=${s.p95ms}ms`,
    )
  }
  console.log(`\n${pass ? '✅ FAILOVER PASS' : '❌ FAILOVER FAIL'} — ${JSON.stringify(verdict)}`)
  console.log(`rapport : ${OUT}`)
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  // Ne jamais laisser le cluster amputé en cas d'erreur du script.
  try {
    docker('start', 'revends_api2', 'revends_api3')
  } catch {
    /* ignore */
  }
  console.error(e)
  process.exit(1)
})
