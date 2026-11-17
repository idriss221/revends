import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schémas de validation V7 — Hébergement des vendeurs.
// Fichier dédié (utils/validation.ts n'est PAS édité). zod comme l'existant.
// La règle métier « supersedesId cible l'ACTIVE du connecté » et la
// normalisation/réservation du slug sont appliquées dans le service.
// ---------------------------------------------------------------------------

/** POST /api/subscriptions — planId obligatoire ; slug optional (requis en pratique hors supersedesId / slug déjà réservé). */
export const subscribeSchema = z.object({
  planId: z.coerce
    .number({ error: 'planId doit être un entier ≥ 1' })
    .int({ error: 'planId doit être un entier ≥ 1' })
    .positive({ error: 'planId doit être un entier ≥ 1' }),
  // Normalisé puis validé finement (regex/longueur/réservé) dans le service.
  slug: z.string().trim().max(100).optional(),
  supersedesId: z.coerce
    .number({ error: 'supersedesId doit être un entier ≥ 1' })
    .int({ error: 'supersedesId doit être un entier ≥ 1' })
    .positive({ error: 'supersedesId doit être un entier ≥ 1' })
    .nullish(),
});

/** POST /api/storefront/listings */
export const addListingSchema = z.object({
  productId: z.coerce
    .number({ error: 'productId doit être un entier ≥ 1' })
    .int({ error: 'productId doit être un entier ≥ 1' })
    .positive({ error: 'productId doit être un entier ≥ 1' }),
});

/** DELETE /api/storefront/listings/:id et POST /api/admin/subscriptions/:id/activate */
export const idParamSchema = z.object({
  id: z.coerce
    .number({ error: 'id doit être un entier ≥ 1' })
    .int({ error: 'id doit être un entier ≥ 1' })
    .positive({ error: 'id doit être un entier ≥ 1' }),
});

/** POST /api/storefront/:slug/contact — message 10..2000 (trimmé), email optionnel ≤ 254 (minuscules). */
export const contactSchema = z.object({
  message: z
    .string({ error: 'Le message est requis' })
    .trim()
    .min(10, { error: 'Le message doit contenir entre 10 et 2000 caractères' })
    .max(2000, { error: 'Le message doit contenir entre 10 et 2000 caractères' }),
  email: z
    .string({ error: 'Adresse e-mail invalide (254 caractères max)' })
    .trim()
    .max(254, { error: 'Adresse e-mail invalide (254 caractères max)' })
    .pipe(z.email({ error: 'Adresse e-mail invalide (254 caractères max)' }))
    .transform((v) => v.toLowerCase())
    .optional(),
});

/** Query paginée V7 (boutique publique + file admin) — per_page borné 1..48. */
export const storefrontPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
});

export const adminSubscriptionsQuerySchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED'], {
    error: 'status doit valoir PENDING, ACTIVE, EXPIRED ou CANCELLED',
  }).default('PENDING'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
});

/** Normalise les query params snake_case (per_page) vers la clé zod canonique (perPage). */
export function normalizePaginationParams(query: Record<string, unknown>): Record<string, unknown> {
  const { per_page: perPageSnake, ...rest } = query;
  return perPageSnake !== undefined ? { ...rest, perPage: perPageSnake } : rest;
}

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
