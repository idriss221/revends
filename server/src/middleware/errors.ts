import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError, notFound } from '../utils/errors.js';
import { describeError, logger } from '../utils/logger.js';

const UNIQUE_CONSTRAINT_CODES: Record<string, { status: number; code: string; message: string }> = {
  users_email_key: { status: 409, code: 'EMAIL_TAKEN', message: 'Un compte avec cet e-mail existe déjà' },
  users_phone_key: { status: 409, code: 'PHONE_TAKEN', message: 'Un compte avec ce numéro existe déjà' },
  uq_one_active_order_per_product: { status: 409, code: 'PRODUCT_RESERVED', message: "Cet article vient d'être réservé" },
  products_slug_key: { status: 409, code: 'SLUG_TAKEN', message: 'Conflit d\'identifiant article' },
  orders_order_number_key: { status: 500, code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
};

// Clés étrangères dont la violation signifie « la ressource référencée n'existe
// pas » → 404, jamais 500 (CA-V5-088 : aucune entrée hostile ne produit de 5xx).
const FOREIGN_KEY_CONSTRAINT_CODES: Record<string, { status: number; code: string; message: string }> = {
  cart_product_id_fkey: { status: 404, code: 'PRODUCT_NOT_FOUND', message: 'Article introuvable ou indisponible' },
  favorites_product_id_fkey: { status: 404, code: 'PRODUCT_NOT_FOUND', message: 'Article introuvable' },
};

export function notFoundHandler(req: Request, res: Response): void {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable' } });
    return;
  }
  // Hors API : laisser le SPA (servi par app.ts) gérer, sinon 404 simple
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable' } });
}

/** Résultat du mapping d'une erreur vers la réponse HTTP (contrat §1.1). */
interface MappedError {
  status: number;
  code: string;
  body: Record<string, unknown>;
}

/** Traduit une erreur quelconque en réponse HTTP documentée. */
function mapError(err: unknown): MappedError {
  // ZodError → 400 VALIDATION_ERROR + details (api.md §1.1)
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    }));
    return { status: 400, code: 'VALIDATION_ERROR', body: { code: 'VALIDATION_ERROR', message: 'Données invalides', details } };
  }

  // Erreurs applicatives (AppError)
  if (err instanceof AppError) {
    return {
      status: err.status,
      code: err.code,
      body: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
        ...(err.extra ?? {}),
      },
    };
  }

  // Filet de sécurité DDL 003 : transition de commande invalide rejetée par
  // le trigger (SQLSTATE P0001) — les services pré-valident et répondent 409
  // avec `currentStatus`, ce mapping ne sert qu'en cas de course résiduelle.
  if (isPgError(err) && err.code === 'P0001') {
    return { status: 409, code: 'INVALID_TRANSITION', body: { code: 'INVALID_TRANSITION', message: 'Transition impossible : le statut actuel ne permet pas cette action' } };
  }

  // Erreurs multer (upload photos)
  if (err instanceof multer.MulterError) {
    const mapped = multerErrorToApi(err);
    return { status: mapped.status, code: mapped.code, body: { code: mapped.code, message: mapped.message } };
  }
  if (err instanceof ImageUploadError) {
    return { status: err.status, code: err.code, body: { code: err.code, message: err.message } };
  }

  // Corps JSON rejeté par express.json (limite 2 Mo) : 413 PAYLOAD_TOO_LARGE,
  // jamais 500 (SÉC-P2a). L'erreur body-parser porte `type: 'entity.too.large'`.
  if (isBodyParserError(err) && err.type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', body: { code: 'PAYLOAD_TOO_LARGE', message: 'Corps de requête trop volumineux' } };
  }

  // Corps JSON syntaxiquement invalide : 400 VALIDATION_ERROR, jamais 500
  // (CA-V5-088). L'erreur reste générique pour ne pas exposer le parseur.
  if (isBodyParserError(err) && err.type === 'entity.parse.failed') {
    return { status: 400, code: 'VALIDATION_ERROR', body: { code: 'VALIDATION_ERROR', message: 'Corps de requête JSON invalide' } };
  }

  // Violations de contrainte unique PostgreSQL (filet de sécurité)
  if (isPgError(err) && err.code === '23505' && err.constraint) {
    const mapped = UNIQUE_CONSTRAINT_CODES[err.constraint];
    if (mapped) {
      return { status: mapped.status, code: mapped.code, body: { code: mapped.code, message: mapped.message } };
    }
  }

  // Violations de clé étrangère PostgreSQL (23503) sur une référence produit
  // inexistante : 404 (filet de sécurité si le service n'a pas pré-validé).
  if (isPgError(err) && err.code === '23503' && err.constraint) {
    const mapped = FOREIGN_KEY_CONSTRAINT_CODES[err.constraint];
    if (mapped) {
      return { status: mapped.status, code: mapped.code, body: { code: mapped.code, message: mapped.message } };
    }
  }

  return { status: 500, code: 'INTERNAL_ERROR', body: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' } };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const mapped = mapError(err);
  const correlationId = (res.locals.correlationId as string | undefined) ?? undefined;
  // Chemin sans query string (évite de journaliser des entrées utilisateur).
  const route = (req.originalUrl ?? req.path ?? '').split('?')[0];
  const context = { route, method: req.method, correlationId, status: mapped.status, code: mapped.code };

  // Journalisation structurée unique : niveau selon gravité, jamais de secret/PII.
  if (mapped.status >= 500) {
    logger.error('requête en échec (serveur)', { ...context, ...describeError(err) });
  } else {
    logger.warn('requête rejetée (client)', context);
  }

  res.status(mapped.status).json({ error: mapped.body });
}

// Erreur dédiée upload (MIME invalide avant multer)
export class ImageUploadError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function multerErrorToApi(err: multer.MulterError): { status: number; code: string; message: string } {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return { status: 400, code: 'PHOTO_TOO_LARGE', message: 'Chaque photo doit faire au plus 5 Mo' };
    case 'LIMIT_FILE_COUNT':
      return { status: 400, code: 'PHOTO_LIMIT', message: 'Maximum 4 photos par article' };
    default:
      return { status: 400, code: 'VALIDATION_ERROR', message: 'Fichier photo invalide' };
  }
}

interface PgErrorLike {
  code?: string;
  constraint?: string;
}
function isPgError(e: unknown): e is PgErrorLike {
  return typeof e === 'object' && e !== null && 'code' in e;
}

interface BodyParserErrorLike {
  type?: string;
}
function isBodyParserError(e: unknown): e is BodyParserErrorLike {
  return typeof e === 'object' && e !== null && 'type' in e;
}

export { notFound }; // ré-export utilitaire (non utilisé en interne, cohérence d'imports)