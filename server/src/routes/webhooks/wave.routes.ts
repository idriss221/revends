import express, { Router } from 'express';
import { config } from '../../config.js';
import { AppError, badRequest } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { verifyWaveSignature } from '../../utils/wave-signature.js';
import { parseWaveEvent } from '../../utils/wave-validation.js';
import { handleWaveWebhook } from '../../services/wave-webhook.service.js';

export const waveWebhookRouter = Router();

waveWebhookRouter.post(
  '/',
  express.raw({ type: 'application/json', limit: '256kb' }),
  async (req, res) => {
    try {
      if (!config.wave.enabled) {
        res.json({ received: true, ignored: true, reason: 'WAVE_DISABLED' });
        return;
      }
      if (!Buffer.isBuffer(req.body)) {
        throw badRequest('INVALID_PAYLOAD', 'Charge utile Wave invalide');
      }
      if (!verifyWaveSignature(req.get('Wave-Signature'), req.body, config.wave.webhookSecret)) {
        throw badRequest('INVALID_SIGNATURE', 'Signature Wave invalide');
      }

      const event = parseWaveEvent(req.body);
      res.json(await handleWaveWebhook(event));
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.status).json({
          error: {
            code: err.code,
            message: err.message,
            ...(err.details ? { details: err.details } : {}),
          },
        });
        return;
      }
      logger.error('webhook Wave : erreur technique', { code: 'INTERNAL_ERROR' });
      res.status(503).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' } });
    }
  },
);
