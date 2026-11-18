import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { runMonthlyReportIfDue } from '../services/storefront-reports.service.js';

// ---------------------------------------------------------------------------
// V8 (R7 / §14.F clos) — Cron du bilan mensuel.
//
// Auth DUAL, comparaison à TEMPS CONSTANT, fail-closed (401 si CRON_SECRET
// absent ou header invalide) :
//  - `Authorization: Bearer <CRON_SECRET>` — envoyé par Vercel Cron (HTTP GET) ;
//  - `x-cron-secret: <CRON_SECRET>` — déclenchement manuel/test.
// Endpoint GET **et** POST. Route par CALENDRIER UTC : 1er ⇒ bilan,
// dernier jour ⇒ relevé, sinon noop. `DISABLE_CRON=true` ⇒ mode 'disabled'
// sans aucun effet (tests/dev — l'in-process n'est jamais démarré non plus).
// ---------------------------------------------------------------------------

export const cronRouter = Router();

function safeEqual(candidate: string, secret: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAuthorized(req: Request): boolean {
  const secret = config.cronSecret;
  if (!secret || secret.length === 0) return false; // fail-closed
  const auth = req.headers.authorization;
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const xCronSecret = typeof req.headers['x-cron-secret'] === 'string' ? (req.headers['x-cron-secret'] as string) : null;
  return [bearer, xCronSecret].some((candidate) => candidate !== null && safeEqual(candidate, secret));
}

async function handler(req: Request, res: Response): Promise<void> {
  if (config.disableCron) {
    res.json({ ok: true, mode: 'disabled', processed: 0, sent: 0, failed: 0 });
    return;
  }
  if (!isAuthorized(req)) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Cron non autorisé' } });
    return;
  }
  try {
    const result = await runMonthlyReportIfDue(new Date());
    if (result.mode === 'report') {
      res.json({ ok: true, mode: 'report', processed: result.report.processed, sent: result.report.sent, failed: result.report.failed, skipped: result.report.skipped, reminders: result.reminders });
      return;
    }
    if (result.mode === 'snapshot') {
      res.json({ ok: true, mode: 'snapshot', processed: result.snapshot.processed, sent: 0, failed: 0, reminders: result.reminders });
      return;
    }
    res.json({ ok: true, mode: 'noop', processed: 0, sent: 0, failed: 0, reminders: result.reminders });
  } catch (err) {
    logger.error('cron monthly-report en échec', { errorMessage: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' } });
  }
}

cronRouter.get('/monthly-report', handler);
cronRouter.post('/monthly-report', handler);
