import { Router } from 'express';
import { listBanners } from '../services/banners.service.js';

const router = Router();

/** GET /api/banners — carrousel d'accueil (public, PO-ACC-4). */
router.get('/', async (_req, res, next) => {
  try {
    res.json(await listBanners());
  } catch (err) {
    next(err);
  }
});

export const bannersRouter = router;