import { Router } from 'express';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { getReferralSummary } from '../services/referral.service.js';

/**
 * Parrainage — « Le Cercle des 10 ».
 *
 * Route privée uniquement : un code de parrainage est personnel (il permet de
 * rattacher des filleuls), il n'a rien à faire dans une réponse publique.
 *
 * `requireAuth` (et non `requireUser`) : le garde CLIENT `RequireUser` admet
 * explicitement un admin connecté sur les pages de son espace. Refuser ici le
 * compte admin produirait un 403 « Accès réservé aux utilisateurs » sur une
 * page que l'interface vient d'ouvrir. Un admin a lui aussi un profil, donc un
 * code : le contrat reste cohérent côté client et serveur.
 */
export const referralsRouter = Router();

referralsRouter.use(requireAuth);

/** GET /api/referrals/me — code, progression, badge, Vitrine. */
referralsRouter.get('/me', async (_req, res) => {
  res.json(await getReferralSummary(currentUser(res).id));
});
