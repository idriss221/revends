import cron from 'node-cron';
import { config } from '../config.js';
import { expireExpiredReservations } from '../services/expiry.service.js';
import { logger } from '../utils/logger.js';

/**
 * Tâche planifiée : expiration des réservations (D3, architecture §5.2).
 * Toutes les minutes ; ignorée si DISABLE_CRON=true (dev/tests).
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
  logger.info('tâche planifiée active : expiration des réservations toutes les minutes');
}
