import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Identifiant de corrélation par requête (CA-V5-090) : un UUID (ou l'en-tête
 * entrant `X-Request-Id` s'il est présent et raisonnable) est attaché à
 * `res.locals.correlationId`, renvoyé au client via `X-Request-Id`, et repris
 * dans chaque entrée de log d'erreur pour tracer une requête de bout en bout.
 */
const MAX_INCOMING_LEN = 128;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  const id = incoming && incoming.length > 0 && incoming.length <= MAX_INCOMING_LEN ? incoming : randomUUID();
  res.locals.correlationId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
