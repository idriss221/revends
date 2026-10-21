import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schémas de validation — miroir de la matrice api.md §4 (serveur = autorité)
// ---------------------------------------------------------------------------

export const displayNameSchema = z
  .string({ error: 'Le pseudo est requis' })
  .min(2, { error: 'Le pseudo doit contenir entre 2 et 50 caractères' })
  .max(50, { error: 'Le pseudo doit contenir entre 2 et 50 caractères' })
  .regex(/^[A-Za-zÀ-ÿ0-9 ]+$/, { error: 'Le pseudo ne peut contenir que des lettres, chiffres et espaces' });

export const registerSchema = z.object({
  displayName: displayNameSchema,
  name: z.string({ error: 'Le nom complet est requis' }).min(1).max(100),
  email: z
    .email({ error: 'Adresse e-mail invalide' })
    .max(255, { error: 'Adresse e-mail trop longue' })
    .transform((v) => v.trim().toLowerCase()),
  phone: z
    .string({ error: 'Le numéro de téléphone est requis' })
    .regex(/^\+?[0-9 ]{8,20}$/, { error: 'Numéro de téléphone invalide (ex. +225 07 00 00 00 00)' }),
  password: z.string({ error: 'Le mot de passe est requis' }).min(8, { error: 'Le mot de passe doit contenir au moins 8 caractères' }).max(72),
  acceptedCgu: z.literal(true, { error: 'Vous devez accepter les conditions d\'utilisation' }),
});

export const loginSchema = z.object({
  // E1 : identifiant = e-mail UNIQUEMENT (CHG-2/D18, PO-1). Toute autre forme
  // (téléphone, texte libre) → 400 VALIDATION_ERROR (CA-AUTH04-07).
  identifier: z
    .string({ error: 'Identifiant requis' })
    .email({ error: "L'identifiant doit être une adresse e-mail valide" })
    .max(255, { error: "L'identifiant doit être une adresse e-mail valide" })
    .transform((v) => v.trim().toLowerCase()),
  password: z.string({ error: 'Mot de passe requis' }).min(1).max(72),
});

/** Mot de passe oublié — E1 : l'e-mail SEUL, pas d'identifiant libre. */
export const forgotPasswordSchema = z.object({
  email: z
    .string({ error: 'Adresse e-mail requise' })
    .email({ error: 'Adresse e-mail invalide' })
    .max(255, { error: 'Adresse e-mail trop longue' })
    .transform((v) => v.trim().toLowerCase()),
});

/**
 * Réinitialisation — `token` opaque (base64url) + nouveau mot de passe.
 * On réutilise la politique de `registerSchema` : un mot de passe de
 * réinitialisation ne doit pas être plus faible qu'un mot de passe initial.
 */
export const resetPasswordSchema = z.object({
  token: z
    .string({ error: 'Jeton de réinitialisation requis' })
    .min(20, { error: 'Jeton de réinitialisation invalide' })
    .max(512),
  password: z
    .string({ error: 'Le mot de passe est requis' })
    .min(8, { error: 'Le mot de passe doit contenir au moins 8 caractères' })
    .max(72),
});

export const productConditions = ['Neuf', 'Très bon état', 'Bon état', 'Correct', 'À réparer'] as const;
export const paymentMethods = ['MOBILE_MONEY', 'CASH', 'BANK_TRANSFER', 'OTHER'] as const;
export const rejectionReasons = [
  'Photos insuffisantes',
  'Description incorrecte',
  'Article en trop mauvais état',
  'Produit interdit',
  'Informations incomplètes',
  'Prix incohérent',
] as const;
export const productStatuses = ['PENDING', 'AVAILABLE', 'RESERVED', 'SOLD', 'REJECTED'] as const;
// Enum V3+SHIPPED (12 valeurs, DDL 003 + 006) — CREATED est transitoire mais reste une valeur válide de statut.
export const orderStatuses = [
  'CREATED',
  'PAYMENT_PENDING',
  'PAID',
  'PRODUCT_WAITING',
  'PRODUCT_RECEIVED',
  'PREPARING',
  'SHIPPED',
  'IN_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'PAYMENT_FAILED',
  'CANCELLED',
] as const;
// Filtre d'API (sale en minuscules) — normalisé en MAJUSCULES pour l'enum BDD (listAdminOrders).
export const payoutStatuses = ['pending', 'due', 'paid'] as const;
export const adminActionTypes = [
  'product.approved',
  'product.rejected',
  // ⚠️ Doit rester synchronisé avec ADMIN_ACTION_PRODUCT_DELETE
  // (`admin.service.ts`) : l'action de suppression logique écrit ce type dans
  // l'historique. Sans cette entrée, `/api/admin/history?action=product.delete`
  // répondait 400 et cette action était donc INFILTRABLE — un filtre ne doit
  // jamais exclure une valeur que l'application produit réellement.
  'product.delete',
  'payment.confirmed',
  'product.received',
  'delivery.started',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'seller.paid',
  // ⚠️ Doit rester synchronisé avec `patchCategory` (`categories.service.ts`) :
  // toute PATCH /api/admin/categories/:id écrit cette action dans l'historique.
  'category.update',
] as const;

/** Champs texte du formulaire multipart (POST/PUT /api/products). */
export const productFieldsSchema = z
  .object({
    name: z.string({ error: 'Le nom est requis' }).min(3, { error: 'Le nom doit contenir entre 3 et 120 caractères' }).max(120, { error: 'Le nom doit contenir entre 3 et 120 caractères' }),
    categoryId: z.coerce.number({ error: 'Catégorie invalide' }).int().positive(),
    subcategoryId: z.coerce.number({ error: 'Sous-catégorie invalide' }).int().positive(),
    condition: z.enum(productConditions, { error: 'État invalide' }),
    price: z.coerce.number({ error: 'Le prix doit être un entier' }).int({ error: 'Le prix doit être un entier' }).min(500, { error: 'Le prix doit être un entier entre 500 et 10 000 000 FCFA' }).max(10_000_000, { error: 'Le prix doit être un entier entre 500 et 10 000 000 FCFA' }),
    // V4 — prix barré (RG-PROD-2) : champ multipart VIDE/absent → NULL (jamais 0
    // ni chaîne vide — la contrainte SQL old_price > price resterait violée).
    oldPrice: z
      .preprocess((v) => (v === undefined || v === null || v === '' ? null : Number(v)), z.number().int().min(500, { error: 'Le prix barré doit être un entier entre 500 et 10 000 000 FCFA' }).max(10_000_000, { error: 'Le prix barré doit être un entier entre 500 et 10 000 000 FCFA' }).nullable())
      .optional(),
    location: z.string({ error: 'La localisation est requise' }).min(3, { error: 'La localisation doit contenir entre 3 et 100 caractères' }).max(100, { error: 'La localisation doit contenir entre 3 et 100 caractères' }),
    description: z.string({ error: 'La description est requise' }).min(10, { error: 'La description doit contenir entre 10 et 2000 caractères' }).max(2000, { error: 'La description doit contenir entre 10 et 2000 caractères' }),
    brand: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    ageYears: z.coerce.number().int().min(0).max(100).optional(),
    defects: z.string().max(2000).optional(),
    accessories: z.string().max(2000).optional(),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    // RG-PROD-2 : une réduction n'est jamais inventée — oldPrice STRICTEMENT > price.
    if (v.oldPrice !== undefined && v.oldPrice !== null && v.oldPrice <= v.price) {
      ctx.addIssue({
        code: 'custom',
        path: ['oldPrice'],
        message: 'Le prix barré doit être strictement supérieur au prix',
      });
    }
  });

/** Champs de gestion des photos dans la PUT. */
export const photoOpsSchema = z.object({
  removePhotoIds: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return [];
      try {
        const arr = JSON.parse(v);
        return Array.isArray(arr) ? arr.map(Number).filter(Number.isInteger) : [];
      } catch {
        return [];
      }
    }),
  photoOrder: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return [];
      try {
        const arr = JSON.parse(v);
        return Array.isArray(arr) ? arr.map(Number).filter(Number.isInteger) : [];
      } catch {
        return [];
      }
    }),
});

/** Coordonnées de livraison (privées : acheteur + admin uniquement). */
export const shippingSchema = z.object({
  name: z
    .string({ error: 'Le nom du destinataire est requis' })
    .trim()
    .min(1, { error: 'Le nom du destinataire est requis' })
    .max(120, { error: 'Le nom du destinataire doit contenir au plus 120 caractères' }),
  phone: z
    .string({ error: 'Le téléphone du destinataire est requis' })
    .trim()
    .regex(/^\+?[0-9 ]{8,20}$/, { error: 'Numéro de téléphone invalide (ex. +225 07 00 00 00 00)' }),
  city: z
    .string({ error: 'La ville est requise' })
    .trim()
    .min(1, { error: 'La ville est requise' })
    .max(120, { error: 'La ville doit contenir au plus 120 caractères' }),
  address: z
    .string({ error: "L'adresse de livraison est requise" })
    .trim()
    .min(1, { error: "L'adresse de livraison est requise" })
    .max(255, { error: "L'adresse de livraison doit contenir au plus 255 caractères" }),
});

/** Note libre de l'acheteur (≤ 500, privée acheteur/admin). */
export const buyerNoteSchema = z
  .string()
  .trim()
  .max(500, { error: 'La note doit contenir au plus 500 caractères' })
  .optional();

export const createOrderSchema = z.object({
  productId: z.coerce.number({ error: 'Identifiant produit requis' }).int().positive(),
  paymentMethod: z.enum(paymentMethods).default('MOBILE_MONEY'),
  // Rétro-compatibilité : shipping / note optionnels (achat simple inchangé).
  shipping: shippingSchema.optional(),
  note: buyerNoteSchema,
});

/** Checkout panier multi-produits — POST /api/orders/checkout (1..8 articles). */
export const checkoutSchema = z.object({
  productIds: z
    .array(z.coerce.number({ error: 'Identifiant produit invalide' }).int().positive(), {
      error: 'La liste des articles est requise',
    })
    .min(1, { error: 'Sélectionnez au moins un article' })
    .max(8, { error: 'Maximum 8 articles par commande' }),
  // Quantités par produit (panier +/−) — { productId: quantité }, 1..9.
  // Rétro-compatible : absent → chaque article à la quantité 1.
  // La validation FINE (entier, 1..9, appartenance à productIds) est faite par
  // le service checkout → 400 INVALID_QUANTITY (vérifications cross-champ).
  quantities: z.record(z.string(), z.number()).optional(),
  paymentMethod: z.enum(paymentMethods).default('MOBILE_MONEY'),
  shipping: shippingSchema.optional(),
  note: buyerNoteSchema,
});

export const confirmPaymentSchema = z.object({
  method: z.enum(paymentMethods, { error: 'Méthode de paiement invalide' }),
  reference: z.string().max(255).optional(),
});

export const sellerPayoutSchema = z.object({
  reference: z.string().max(255).optional(),
});

/** mark-product-received : note optionnelle ≤ 500 (visible via events[], PO-4, RG-ORD-6). */
export const markProductReceivedSchema = z.object({
  note: z
    .string()
    .max(500, { error: 'La note doit contenir au plus 500 caractères' })
    .optional(),
});

/** start-delivery : carrier / trackingNumber optionnels ≤ 100 (PO-6, CA-ORD04-01). */
export const startDeliverySchema = z.object({
  carrier: z.string().max(100, { error: 'Le transporteur doit contenir au plus 100 caractères' }).optional(),
  trackingNumber: z.string().max(100, { error: 'Le numéro de suivi doit contenir au plus 100 caractères' }).optional(),
});

/** cancel : note obligatoire 1..500 (CA-ORD08-01, RG-ORD-6). */
export const cancelOrderSchema = z.object({
  note: z
    .string({ error: 'La raison de l’annulation est requise' })
    .min(1, { error: 'La raison de l’annulation est requise' })
    .max(500, { error: 'La raison de l’annulation doit contenir au plus 500 caractères' }),
});

export const rejectSchema = z.object({
  reason: z.enum(rejectionReasons, { error: 'Motif de refus invalide' }),
});

export const patchCategorySchema = z
  .object({
    name: z.string().min(1, { error: 'Le nom doit contenir entre 1 et 100 caractères' }).max(100, { error: 'Le nom doit contenir entre 1 et 100 caractères' }).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.active !== undefined, { error: 'Aucun champ à modifier' });

// ---------------------------------------------------------------------------
// Params de query (tous les endpoints paginés / filtrés)
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
});

// V5/PO-V5-18 : `relevance` est DISTINCT de `recent` — score déterministe
// (remise + popularité + récence) utilisé par le tri ET par les suggestions.
export const catalogSorts = ['recent', 'relevance', 'price_asc', 'price_desc', 'popular'] as const;
export const catalogSections = ['recent', 'best_offers', 'popular', 'promotions', 'new', 'discover'] as const;

/** CSV d'entiers strictement positifs, borné [1, max] — liste `ids`/`not_in` (api.md §3.2). */
function csvIdList(max: number, errorCount: string, errorInvalid: string) {
  return z
    .string()
    .transform((raw) => raw.split(',').map((t) => t.trim()).filter((t) => t !== '').map((t) => Number(t)))
    .refine((nums) => nums.length >= 1 && nums.length <= max, { error: errorCount })
    // SÉC-P3 : au-delà de 2^53-1, Number() arrondit silencieusement → identifiant
    // falsifié accepté. Number.isSafeInteger rejette aussi 2^53 exact (9007199254740992).
    .refine((nums) => nums.every((n) => Number.isSafeInteger(n) && n > 0), { error: errorInvalid });
}

export const catalogQuerySchema = z
  .object({
    q: z.string().max(120).optional(),
    // Rétrocompatibilité : le schéma consomme les clés camelCase (alias snake →
    // camel fait par la route), ainsi que les nouveaux paramètres aux noms
    // contractuels (api.md §3.2 : subcategory_id, price_min… not_in).
    categoryId: z.coerce.number().int().positive().optional(),
    subcategory_id: z.coerce.number({ error: 'Sous-catégorie invalide' }).int().positive().optional(),
    price_min: z.coerce.number({ error: 'Le prix minimum doit être un entier' }).int({ error: 'Le prix minimum doit être un entier' }).min(0, { error: 'Le prix minimum doit être un entier positif' }).optional(),
    price_max: z.coerce.number({ error: 'Le prix maximum doit être un entier' }).int({ error: 'Le prix maximum doit être un entier' }).min(0, { error: 'Le prix maximum doit être un entier positif' }).optional(),
    condition: z.enum(productConditions, { error: 'État invalide' }).optional(),
    location: z.string().trim().min(1, { error: 'Localisation invalide' }).max(100, { error: 'La localisation doit contenir au plus 100 caractères' }).optional(),
    brand: z.string().trim().min(1, { error: 'Marque invalide' }).max(100, { error: 'La marque doit contenir au plus 100 caractères' }).optional(),
    sort: z.enum(catalogSorts, { error: 'Tri invalide' }).optional(),
    section: z.enum(catalogSections, { error: 'Section invalide' }).optional(),
    ids: csvIdList(20, 'La liste ids doit contenir entre 1 et 20 identifiants', 'Identifiants invalides : entiers strictement positifs attendus').optional(),
    not_in: csvIdList(200, 'La liste not_in doit contenir entre 1 et 200 identifiants', 'Identifiants invalides : entiers strictement positifs attendus').optional(),
    page: z.coerce.number().int().min(1).optional(),
    perPage: z.coerce.number().int().min(1).max(48).optional(),
  })
  .superRefine((v, ctx) => {
    // Mode ids EXCLUSIF : tout autre paramètre explicitement fourni → 400 (api.md §3.2).
    if (v.ids !== undefined) {
      const present = [
        v.q, v.categoryId, v.subcategory_id, v.price_min, v.price_max, v.condition,
        v.location, v.brand, v.sort, v.section, v.not_in, v.page, v.perPage,
      ].some((x) => x !== undefined);
      if (present) {
        ctx.addIssue({ code: 'custom', path: ['ids'], message: 'Le paramètre ids est exclusif : aucun autre paramètre ne peut l’accompagner' });
      }
    }
    if (v.ids !== undefined && v.not_in !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['not_in'], message: 'Les paramètres ids et not_in sont incompatibles' });
    }
    if (v.price_min !== undefined && v.price_max !== undefined && v.price_max < v.price_min) {
      ctx.addIssue({ code: 'custom', path: ['price_max'], message: 'price_max doit être supérieur ou égal à price_min' });
    }
  });

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

// Pagination des listes `/api/me/*` (produits, commandes, ventes). Les alias
// `per_page`/`perPage` sont convertis en `limit` AVANT le parse
// (`normalizeMeListParams`) : `limit` est la clé canonique.
export const meListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

export const notificationsQuerySchema = z.object({
  unread_only: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(20),
});

export const adminProductsQuerySchema = z.object({
  status: z.enum(productStatuses).default('PENDING'),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
});

export const adminOrdersQuerySchema = z.object({
  status: z.enum(orderStatuses).optional(),
  payout: z.enum(payoutStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
});

export const adminUsersQuerySchema = z.object({
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(20),
});

export const adminHistoryQuerySchema = z.object({
  action: z.enum(adminActionTypes).optional(),
  // `category` : les PATCH /api/admin/categories/:id écrivent target_type='category'
  // — un filtre ne doit jamais exclure une valeur que l'application produit.
  targetType: z.enum(['product', 'order', 'category']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(20),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** Paramètre de route :productId (BIGINT ≤ 19 digits). */
export const productIdParamSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

/**
 * GET /api/products/suggestions?q=… (V5/PO-V5-18).
 * `q` OBLIGATOIRE : sans terme de recherche l'endpoint n'a aucun sens
 * (et deviendrait un catalogue non paginé) → 400 VALIDATION_ERROR.
 * Borné à 2 caractères minimum pour ne pas faire scanner toute la base.
 */
export const suggestionsQuerySchema = z.object({
  q: z
    .string({ error: 'Le terme de recherche est requis' })
    .trim()
    .min(2, { error: 'Le terme de recherche doit contenir au moins 2 caractères' })
    .max(120, { error: 'Le terme de recherche ne peut pas dépasser 120 caractères' }),
});

/** Convertit un corps de formulaire multipart : champs vides → null (stockés NULL). */
export function emptyToNull<T extends Record<string, unknown>>(fields: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string' && v.trim() === '') out[k] = null;
    else out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Panier & Favoris
// ---------------------------------------------------------------------------

/** POST /api/cart — ajouter au panier. */
export const cartAddSchema = z.object({
  productId: z.coerce.number({ error: 'Identifiant produit requis' }).int().positive(),
  qty: z.coerce.number({ error: 'Quantité invalide' }).int({ error: 'La quantité doit être un entier' }).min(1, { error: 'La quantité doit être entre 1 et 9' }).max(9, { error: 'La quantité doit être entre 1 et 9' }).default(1),
});

/** PATCH /api/cart/:productId — modifier la quantité. */
export const cartQtySchema = z.object({
  qty: z.coerce.number({ error: 'Quantité invalide' }).int({ error: 'La quantité doit être un entier' }).min(1, { error: 'La quantité doit être entre 1 et 9' }).max(9, { error: 'La quantité doit être entre 1 et 9' }),
});

/** POST /api/favorites — basculer favori. */
export const favToggleSchema = z.object({
  productId: z.coerce.number({ error: 'Identifiant produit requis' }).int().positive(),
});