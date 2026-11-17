import cron from 'node-cron';
import { config } from '../config.js';
import { expireExpiredReservations } from '../services/expiry.service.js';
import { runMonthlyReportIfDue } from '../services/storefront-reports.service.js';
import { logger } from '../utils/logger.js';

/**
 * Tâche planifiée : expiration des réservations (D3, architecture §5.2).
 * Toutes les minutes ; ignorée si DISABLE_CRON=true (dev/tests).
 *
 * V8 — Bilan mensuel : quotidien 06:00 UTC ; dispatch interne
 * (1er ⇒ bilan du mois écoulé ; dernier jour ⇒ relevé des vues ; sinon noop)
 * + rappel J-3 best-effort. Ignorée si DISABLE_CRON=true.
 */
export function startScheduler(): void {
  if (config.disableCron) {
    logger.info('tâche planifiée désactivée', { reason: 'DISABLE_CRON=true' });
    return;
  }
  cron.schedule('*/1 * * * *', async () => {
    try {
      const released = await expireExpiredReservations();
      if (released > 0) logger.info('réservations expirées libérées', { released });
    } catch (err) {
      logger.error("échec du tick d'expiration des réservations", { errorMessage: (err as Error).message });
    }
  });
  cron.schedule('0 6 * * *', async () => {
    try {
      const result = await runMonthlyReportIfDue(new Date());
      if (result.mode !== 'noop') logger.info('cycle mensuel exécuté', { mode: result.mode });
    } catch (err) {
      logger.error('échec bilan mensuel', { errorMessage: (err as Error).message });
    }
  });
  logger.info('tâches planifiées actives : réservations (minute), bilan mensuel (06:00 UTC)');
}
