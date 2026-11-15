import { Router } from 'express';
import { currentUser, requireUser } from '../middleware/auth.js';
import { getReferralSummary } from '../services/referral.service.js';

/**
 * Parrainage — « Le Cercle des 10 ».
 *
 * Route privée uniquement : un code de parrainage est personnel (il permet de
 * rattacher des filleuls), il n'a rien à faire dans une réponse publique.
 * Le code machine renvoyé reste `REFERRAL_*` via le middleware d'erreurs.
 */
export const referralsRouter = Router();

referralsRouter.use(requireUser);

/** GET /api/referrals/me — code, progression, badge, Vitrine. */
referralsRouter.get('/me', async (_req, res) => {
  res.json(await getReferralSummary(currentUser(res).id));
});
