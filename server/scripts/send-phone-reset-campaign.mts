/**
 * Campagne e-mail de mise à jour du numéro WhatsApp — tous les comptes.
 * Usage :
 *   npx tsx scripts/send-phone-reset-campaign.mts --dry-run
 *   npx tsx scripts/send-phone-reset-campaign.mts --limit 3
 *   npx tsx scripts/send-phone-reset-campaign.mts
 * Par défaut : exclut les domaines de test (@revends.test), délai 500 ms.
 */
import { pool } from '../src/db/pool.js';
import { sendPhoneResetToUser } from '../src/services/phone-reset.service.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { rows } = await pool.query<{ id: number; email: string; role: string }>(
    `SELECT id, email, role FROM users ORDER BY id`,
  );
  const all = rows;
  const targets = all
    .filter((u) => !u.email.toLowerCase().endsWith('@revends.test'))
    .slice(0, limit);
  console.log(`CONNUS=${all.length} CIBLES=${targets.length} DRY_RUN=${dryRun}`);
  let okCount = 0;
  let failCount = 0;
  for (const u of targets) {
    if (dryRun) {
      console.log(`DRY ${u.id} ${u.email} role=${u.role}`);
      continue;
    }
    const r = await sendPhoneResetToUser(u.id, u.email);
    if (r.ok) okCount++;
    else failCount++;
    console.log(`${r.ok ? 'SENT' : 'FAIL'} id=${u.id} email=${u.email}`);
    await sleep(500);
  }
  console.log(`SUMMARY sent=${okCount} failed=${failCount} dry_run=${dryRun}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error('ERR', e);
  await pool.end().catch(() => {});
  process.exit(1);
});
