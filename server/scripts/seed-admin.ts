/**
 * Bootstrap de l'administrateur sur une base fraîche.
 *
 * Usage (base de production Neon) :
 *   cd server
 *   node --import tsx scripts/seed-admin.ts
 *
 * L'environnement est lu depuis le process (`.vercel/.env.production.local`
 * exporté, ou variables d'environnement). Le script est idempotent : si
 * l'administrateur existe déjà, il ne fait rien.
 */
import { seedAdmin } from '../src/db/seed.js';

async function main(): Promise<void> {
  const result = await seedAdmin();
  console.log(
    `[seed-admin] email=${result.email} created=${result.created}` +
      (result.created ? '' : ' (déjà présent, rien à faire)'),
  );
}

main().catch((err: unknown) => {
  console.error('[seed-admin] échec :', (err as Error).message);
  process.exitCode = 1;
});
