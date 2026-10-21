import { expireExpiredReservations } from '../services/expiry.service.js';
import { logger, describeError } from '../utils/logger.js';

// Script one-shot : npm run job:expire
try {
  const released = await expireExpiredReservations();
  logger.info('réservations expirées libérées', { released });
  process.exit(0);
} catch (err) {
  logger.error("échec de l'expiration des réservations", describeError(err));
  process.exit(1);
}
