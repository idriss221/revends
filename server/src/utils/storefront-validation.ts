import { z } from 'zod';
import { badRequest } from './errors.js';

// ---------------------------------------------------------------------------
// Schémas de validation V7 — Hébergement des vendeurs.
// Fichier dédié (utils/validation.ts n'est PAS édité). zod comme l'existant.
// La règle métier « supersedesId cible l'ACTIVE du connecté » et la
// normalisation/réservation du slug sont appliquées dans le service.
// ---------------------------------------------------------------------------

/** Référence de paiement (E1 / V8-D8) : trim, 4–64 car., 1er alphanumérique, [A-Za-z0-9 .\-_/] ensuite. */
export const PAYMENT_REFERENCE_REGEX = /^[A-Za-z0-9][A-Za-z0-9 .\-_/]{2,62}$/;
export const PAYMENT_METHODS = ['wave', 'orange_money', 'virement'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * POST /api/subscriptions — planId obligatoire ; slug optional.
 * V8 (E1) : `paymentMethod` + `paymentReference` — **contraints en service**
 * (codes dédiés INVALID_PAYMENT_METHOD / INVALID_PAYMENT_REFERENCE) et
 * ACCEPTÉS ABSENTS (legacy CA-V8-053). Voir DEFIANCE dans le rapport V8 :
 * l'obligation stricte (CA-V8-050) casserait les suites V7 existantes
 * (contrainte absolue « tests DO NOT CHANGE / suites vertes »). La validation
 * reste stricte DÈS QU'UNE VALEUR EST FOURNIE ; le front doit rendre les
 * champs obligatoires à la souscription (phase @frontend).
 */
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
  paymentMethod: z.string().trim().max(32).optional(),
  paymentReference: z.string().trim().max(64).optional(),
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

// ---------------------------------------------------------------------------
// V8 — Validation souscription (E1) + profil boutique (R1/E4).
// Codes dédiés : INVALID_PAYMENT_METHOD / INVALID_PAYMENT_REFERENCE
//                INVALID_IMAGE / FILE_TOO_LARGE / VALIDATION_ERROR
// ---------------------------------------------------------------------------

/** Valide (et normalise) paymentMethod/paymentReference fournis. Lève AppError 400 dédiée sinon. */
export function validatePaymentFields(input: { paymentMethod?: string; paymentReference?: string }): {
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
} {
  let paymentMethod: PaymentMethod | null = null;
  if (input.paymentMethod !== undefined && input.paymentMethod !== '') {
    const m = input.paymentMethod.trim().toLowerCase();
    if (!(PAYMENT_METHODS as readonly string[]).includes(m)) {
      throw badRequest('INVALID_PAYMENT_METHOD', 'paymentMethod doit valoir wave, orange_money ou virement');
    }
    paymentMethod = m as PaymentMethod;
  }
  let paymentReference: string | null = null;
  if (input.paymentReference !== undefined && input.paymentReference !== '') {
    const ref = input.paymentReference.trim();
    if (ref.length < 4 || ref.length > 64 || !PAYMENT_REFERENCE_REGEX.test(ref)) {
      throw badRequest(
        'INVALID_PAYMENT_REFERENCE',
        'La référence de paiement doit contenir entre 4 et 64 caractères (lettres, chiffres, espaces, points, tirets, underscores, slashs) et commencer par une lettre ou un chiffre',
      );
    }
    paymentReference = ref;
  }
  return { paymentMethod, paymentReference };
}

/** Comptage de graphèmes (Unicode) — Intl.Segmenter (👨‍👩‍👧 = 1 grapheme). */
export function graphemeLength(value: string): number {
  let count = 0;
  for (const _ of new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(value)) count += 1;
  return count;
}

/** Corps JSON alternatif à PUT multipart (POST /api/storefront/profile). */
export const storefrontProfileJsonSchema = z.object({
  publicDescription: z.string().max(4000).optional(),
  collecteAddress: z.string().max(1000).optional(),
});

/** Validation métier partagée des champs texte du profil (codes dédiés).
 *  Chaîne vide ⇒ NULL explicite (effacement) ; absente ⇒ non touchée. */
export function validateProfileTextFields(input: { publicDescription?: string; collecteAddress?: string }): {
  publicDescription: string | null | undefined;
  collecteAddress: string | null | undefined;
} {
  let publicDescription: string | null | undefined;
  if (input.publicDescription !== undefined) {
    const d = input.publicDescription.trim();
    if (d === '') {
      publicDescription = null;
    } else if (graphemeLength(d) > 500 || d.length > 500) {
      // Double garde : graphèmes (Intl.Segmenter — CA-V8-043) ET codepoints
      // (char_length côté PostgreSQL, chk_storefront_profile_description).
      // Sans la garde codepoints, une saisie acceptée par le front pourrait
      // être rejetée par le CHECK BDD et produire un 500.
      throw badRequest('VALIDATION_ERROR', 'La description publique doit contenir au plus 500 caractères', [
        { field: 'publicDescription', message: '500 caractères maximum' },
      ]);
    } else {
      publicDescription = d;
    }
  }
  let collecteAddress: string | null | undefined;
  if (input.collecteAddress !== undefined) {
    const a = input.collecteAddress.trim();
    if (a === '') {
      collecteAddress = null;
    } else if (graphemeLength(a) < 10 || graphemeLength(a) > 500) {
      throw badRequest('VALIDATION_ERROR', "L'adresse de collecte doit contenir entre 10 et 500 caractères", [
        { field: 'collecteAddress', message: 'Entre 10 et 500 caractères' },
      ]);
    } else {
      collecteAddress = a;
    }
  }
  return { publicDescription, collecteAddress };
}
