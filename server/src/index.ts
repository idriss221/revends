import { createApp } from './app.js';
import { config } from './config.js';
import { startScheduler } from './jobs/run.js';
import { seedBannersIfEmpty } from './db/seed.js';
import { connectRedis, closeRedis } from './cache/redis.js';
import { closePool } from './db/pool.js';
import { logger } from './utils/logger.js';

// PO-ACC-4 : bannières du carrousel seedées UNIQUEMENT si la table est vide.
// Un échec ici ne doit pas tuer le serveur (la gestion admin viendra plus tard).
await seedBannersIfEmpty().catch((err) => {
  logger.error('seed bannières ignoré', { errorMessage: (err as Error).message });
});

// Redis = point central (sessions, cache, rate-limit). Si les sessions sont
// sur Redis et que Redis est injoignable, on refuse de servir (SPOF assumé,
// risque R3) : mieux vaut un échec explicite qu'une authentification cassée.
await connectRedis().catch((err) => {
  logger.error('connexion Redis échouée', { errorMessage: (err as Error).message });
  if (config.sessionStore === 'redis') {
    throw new Error('SESSION_STORE=redis mais Redis est injoignable — refus de démarrer');
  }
});

const app = createApp();

// Tâche planifiée — désactivée sur api2/api3 (DISABLE_CRON=true).
startScheduler();

const server = app.listen(config.port, () => {
  logger.info('ReVends API démarrée', {
    url: `http://localhost:${config.port}`,
    env: config.nodeEnv,
    instance: config.instanceId,
  });
});

// Arrêt propre : terminer les connexions (pg pools, Redis) sans couper les
// requêtes en cours. SIGTERM/SIGINT (docker stop, compose down).
async function shutdown(signal: string): Promise<void> {
  logger.info('signal reçu — arrêt en cours', { signal });
  server.close(async () => {
    await closePool().catch((err) => logger.error('closePool échoué', { errorMessage: (err as Error).message }));
    await closeRedis().catch((err) => logger.error('closeRedis échoué', { errorMessage: (err as Error).message }));
    process.exit(0);
  });
  // Filet : si le close() ne revient pas (connexion keep-alive bloquée).
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
