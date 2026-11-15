/**
 * Campagne de parrainage — « Le Cercle des 10 » — vers les vendeurs qui ont
 * au moins un article EN LIGNE.
 *
 * Usage :
 *   npx tsx scripts/send-referral-campaign.mts --dry-run
 *   npx tsx scripts/send-referral-campaign.mts --only admin@revends.com
 *   npx tsx scripts/send-referral-campaign.mts --limit 2
 *   npx tsx scripts/send-referral-campaign.mts
 *
 * Options :
 *   --dry-run          liste les cibles sans envoyer
 *   --limit N          borne le nombre d'envois
 *   --only e1,e2       restreint à ces adresses (test / reprise ciblée)
 *   --campaign-key K   clé d'idempotence (défaut : referral-cercle10-2026-11)
 *
 * La cible est calculée en base : `products.status = 'AVAILABLE'`, jamais une
 * liste écrite à la main. Les adresses `@revends.test` sont exclues.
 */
import { pool } from '../src/db/pool.js';
import { sendReferralLaunchToUser } from '../src/services/referral.service.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const onlyIdx = args.indexOf('--only');
const only =
  onlyIdx >= 0 && args[onlyIdx + 1]
    ? new Set(
        args[onlyIdx + 1]!
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;
const keyIdx = args.indexOf('--campaign-key');
const campaignKey = keyIdx >= 0 && args[keyIdx + 1] ? args[keyIdx + 1]! : 'referral-cercle10-2026-11';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface Target {
  id: number;
  email: string;
  display_name: string;
  n: number;
}

async function main(): Promise<void> {
  const { rows } = await pool.query<Target>(
    `SELECT u.id,
            u.email,
            u.display_name,
            count(p.id) FILTER (WHERE p.status = 'AVAILABLE')::int AS n
       FROM users u
       JOIN products p ON p.owner_id = u.id AND p.deleted_at IS NULL
      WHERE u.role = 'user'
      GROUP BY u.id, u.email, u.display_name
     HAVING count(p.id) FILTER (WHERE p.status = 'AVAILABLE') > 0
      ORDER BY n DESC, u.id`,
  );

  const targets = rows
    .filter((u) => typeof u.email === 'string' && u.email.includes('@'))
    .filter((u) => !u.email.toLowerCase().endsWith('@revends.test'))
    .filter((u) => (only === null ? true : only.has(u.email.toLowerCase())))
    .slice(0, Number.isFinite(limit) ? limit : undefined);

  console.log(`CAMPAGNE=${campaignKey} VENDEURS_ACTIFS=${rows.length} CIBLES=${targets.length} DRY_RUN=${dryRun}`);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const u of targets) {
    if (dryRun) {
      console.log(`DRY id=${u.id} email=${u.email} articles=${u.n}`);
      continue;
    }
    const r = await sendReferralLaunchToUser(u.id, u.email, u.display_name, u.n, campaignKey);
    if (r.skipped) skipped += 1;
    else if (r.ok) sent += 1;
    else failed += 1;
    console.log(`${r.skipped ? 'SKIP' : r.ok ? 'SENT' : 'FAIL'} id=${u.id} email=${u.email} articles=${u.n}`);
    if (!r.skipped) await sleep(600);
  }

  console.log(`SUMMARY sent=${sent} failed=${failed} skipped=${skipped} dry_run=${dryRun}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error('CAMPAIGN_ERROR', e instanceof Error ? e.message : String(e));
  await pool.end().catch(() => {});
  process.exit(1);
});
