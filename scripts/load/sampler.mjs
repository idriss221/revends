/**
 * Échantillonneur d'infrastructure — processus SÉPARÉ du générateur de charge.
 *
 * Pourquoi un processus dédié : `docker stats` et `psql` sont des exécutions
 * bloquantes (fork/exec + attente). Lancées dans le générateur, elles gèlent sa
 * boucle d'événements une fraction de seconde par seconde et gonflent
 * artificiellement les latences mesurées (constaté : p95 à 3 s sur un service
 * qui répond en 20 ms). Ici, elles ne peuvent pas contaminer la mesure HTTP.
 *
 * Écrit une ligne JSON par échantillon :
 *   { t, containers: [{name,cpu,memMB}], dbConns, redisMB }
 *
 * Usage : node scripts/load/sampler.mjs --out /tmp/x.jsonl --interval 1000
 */
import { exec as execCb } from 'node:child_process'
import { promisify } from 'node:util'
import { appendFileSync, writeFileSync } from 'node:fs'

const execAsync = promisify(execCb)
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const OUT = arg('--out', '/tmp/opencode/samples.jsonl')
const INTERVAL = Number(arg('--interval', '1000'))
const DB = arg('--db', 'revends')

const CONTAINERS = [
  'revends_nginx',
  'revends_api1',
  'revends_api2',
  'revends_api3',
  'revends_postgres',
  'revends_redis',
]

function parseMem(s) {
  const m = /^([\d.]+)\s*(KiB|MiB|GiB|B)$/.exec(s.trim())
  if (!m) return 0
  const v = parseFloat(m[1])
  if (m[2] === 'GiB') return v * 1024
  if (m[2] === 'MiB') return v
  if (m[2] === 'KiB') return v / 1024
  return v / 1024 / 1024
}

async function sample() {
  const out = { t: Date.now(), containers: [], dbConns: null, redisMB: null }

  const [stats, db, redis] = await Promise.allSettled([
    execAsync(
      `docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' ${CONTAINERS.join(' ')}`,
      { timeout: 15000, maxBuffer: 1 << 20 },
    ),
    execAsync(
      `docker exec revends_postgres psql -U revends -d ${DB} -tAc "select count(*) from pg_stat_activity where datname='${DB}'"`,
      { timeout: 10000 },
    ),
    execAsync(
      `docker exec revends_redis sh -lc 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" INFO memory'`,
      { timeout: 10000 },
    ),
  ])

  if (stats.status === 'fulfilled') {
    out.containers = stats.value.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, cpu, mem] = line.split('|')
        return { name, cpu: parseFloat(cpu), memMB: parseMem(mem.split('/')[0]) }
      })
  }
  if (db.status === 'fulfilled') out.dbConns = Number(db.value.stdout.trim())
  if (redis.status === 'fulfilled') {
    const m = /used_memory_human:([\d.]+)([KMG]?)/.exec(redis.value.stdout)
    if (m) out.redisMB = m[2] === 'G' ? parseFloat(m[1]) * 1024 : m[2] === 'K' ? parseFloat(m[1]) / 1024 : parseFloat(m[1])
  }

  appendFileSync(OUT, `${JSON.stringify(out)}\n`)
}

writeFileSync(OUT, '')
await sample()

const timer = setInterval(async () => {
  try {
    await sample()
  } catch {
    /* un échantillon manqué ne doit pas tuer le processus */
  }
}, INTERVAL)

const stop = () => {
  clearInterval(timer)
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
