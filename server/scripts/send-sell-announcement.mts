/**
 * Campagne d'annonce marketing — « Ce que vous n'utilisez plus peut devenir de
 * l'argent » — vers tous les comptes réels.
 *
 * Usage :
 *   npx tsx scripts/send-sell-announcement.mts --dry-run
 *   npx tsx scripts/send-sell-announcement.mts --limit 2
 *   npx tsx scripts/send-sell-announcement.mts
 *   npx tsx scripts/send-sell-announcement.mts --only a@x.com,b@y.com
 *
 * Options :
 *   --dry-run          liste les cibles sans envoyer
 *   --limit N          borne le nombre d'envois
 *   --only e1,e2       restreint à ces adresses (reprise ciblée)
 *   --campaign-key K   clé d'idempotence (défaut : sell-announcement-2026-11)
 *
 * Exclusions : adresses de test `@revends.test` (boîtes inexistantes).
 * Délai par défaut entre deux envois : 600 ms (limites SMTP Gmail).
 */
import { pool } from '../src/db/pool.js';
import { sendSellAnnouncementToUser } from '../src/services/announcement.service.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 && args[onlyIdx + 1]
  ? new Set(args[onlyIdx + 1]!.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
  : null;
const keyIdx = args.indexOf('--campaign-key');
const campaignKey = keyIdx >= 0 && args[keyIdx + 1]
  ? args[keyIdx + 1]!
  : 'sell-announcement-2026-11';

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { rows } = await pool.query<{ id: number; email: string; role: string }>(
    `SELECT id, email, role FROM users ORDER BY id`,
  );

  const targets = rows
    .filter((u) => typeof u.email === 'string' && u.email.includes('@'))
    .filter((u) => !u.email.toLowerCase().endsWith('@revends.test'))
    .filter((u) => (only === null ? true : only.has(u.email.toLowerCase())))
    .slice(0, Number.isFinite(limit) ? limit : undefined);

  console.log(
    `CAMPAGNE=${campaignKey} CONNUS=${rows.length} CIBLES=${targets.length} DRY_RUN=${dryRun}`,
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const u of targets) {
    if (dryRun) {
      console.log(`DRY id=${u.id} email=${u.email} role=${u.role}`);
      continue;
    }
    const r = await sendSellAnnouncementToUser(u.id, u.email, campaignKey);
    if (r.skipped) skipped++;
    else if (r.ok) sent++;
    else failed++;
    console.log(
      `${r.skipped ? 'SKIP' : r.ok ? 'SENT' : 'FAIL'} id=${u.id} email=${u.email}`,
    );
    if (!r.skipped) await sleep(600);
  }

  console.log(
    `SUMMARY sent=${sent} failed=${failed} skipped=${skipped} dry_run=${dryRun}`,
  );
  await pool.end();
}

main().catch(async (e) => {
  console.error('ERR', e);
  await pool.end().catch(() => {});
  process.exit(1);
});
