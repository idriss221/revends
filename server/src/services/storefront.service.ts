import { pool, type Queryable } from '../db/pool.js';
import { withTransaction } from '../utils/db.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { insertNotification } from '../repositories/notifications.repository.js';
import {
  isReservedSlug,
  isSlugFormatValid,
  normalizeSlug,
  serializePlan,
  serializeStorefrontItem,
  serializeStorefrontPublic,
  STOREFRONT_CONTACT_NOTIFICATION_TYPE,
  type PlanRowLike,
  type StorefrontItemRow,
} from '../utils/storefront.js';

// ---------------------------------------------------------------------------
// V7 — Hébergement des vendeurs : service métier.
//
// Règles portées ici et nulle part ailleurs :
//  1. Le statut d'une annonce de boutique est DÉRIVÉ de products.status par
//     jointure en lecture — jamais stocké sur storefront_listings.
//  2. Le contrôle de quota n'existe QUE dans addListingToStorefront.
//  3. Aucune écriture sur products/orders/payments/payouts ; aucun accès au
//     parrainage (referred_by / vitrine_until / ambassador_until).
//  4. L'expiration est PARESSEUSE (matérialisation conditionnelle en lecture,
//     sans cron) ; le filtre `ends_at > now()` borne la lecture publique.
//  5. Le slug est réservé à vie AU VENDEUR (tous statuts) — récupéré
//     automatiquement à la re-souscription ; supersedesId ne sert QUE au
//     changement de forfait vers l'ACTIVE du connecté.
// ---------------------------------------------------------------------------

/** Statuts produit compatibles avec la boutique (CA-V7-031). */
const LIVE_PRODUCT_STATUSES = ['PENDING', 'AVAILABLE', 'RESERVED'] as const;

interface SubscriptionRow {
  id: number;
  seller_id: number;
  plan_id: number;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  slug: string;
  supersedes_id: number | null;
  started_at: Date | string | null;
  ends_at: Date | string | null;
  activated_by: number | null;
  activated_at: Date | string | null;
  created_at: Date | string;
}

interface PlanRow extends PlanRowLike {
  active: boolean;
}

interface SubscriptionWithPlanRow extends SubscriptionRow {
  plan_name: string;
  price_fcfa: number;
  quota: number;
  duration_days: number;
}

interface PgErrorLike {
  code?: string;
  constraint?: string;
}
function isPgError(err: unknown): err is PgErrorLike {
  return typeof err === 'object' && err !== null && 'code' in err;
}

const toIso = (v: Date | string | null | undefined): string | null =>
  v == null ? null : new Date(v).toISOString();

/** Message affichable tel quel (CA-V7-016). */
const EXPIRED_MESSAGE = (endsAt: Date | string): string => {
  const date = new Date(endsAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Votre abonnement a expiré le ${date}. Vos annonces de boutique sont conservées ; souscrivez à nouveau sans indication de remplacement pour rouvrir votre vitrine : votre slug vous est réservé et sera récupéré automatiquement.`;
};

// ---------------------------------------------------------------------------
// Matérialisation paresseuse de l'expiration (§3.4 architecture — sans cron)
// ---------------------------------------------------------------------------

/** Passe `ACTIVE → EXPIRED` toute ligne dont `ends_at <= now()`. Idempotent. */
export async function materializeExpiredSubscriptions(
  client: Queryable,
  scope?: { sellerId?: number; slug?: string },
): Promise<void> {
  if (scope?.sellerId !== undefined) {
    await client.query(
      `UPDATE seller_subscriptions SET status = 'EXPIRED'
        WHERE status = 'ACTIVE' AND ends_at <= now() AND seller_id = $1`,
      [scope.sellerId],
    );
    return;
  }
  if (scope?.slug !== undefined) {
    await client.query(
      `UPDATE seller_subscriptions SET status = 'EXPIRED'
        WHERE status = 'ACTIVE' AND ends_at <= now() AND slug = $1`,
      [scope.slug],
    );
    return;
  }
  await client.query(
    `UPDATE seller_subscriptions SET status = 'EXPIRED'
      WHERE status = 'ACTIVE' AND ends_at <= now()`,
  );
}

// ---------------------------------------------------------------------------
// Forfaits
// ---------------------------------------------------------------------------

export async function listActivePlans(q: Queryable = pool): Promise<Record<string, unknown>[]> {
  const { rows } = await q.query<PlanRowLike>(
    'SELECT id, name, price_fcfa, quota, duration_days FROM subscription_plans WHERE active = TRUE ORDER BY price_fcfa ASC, id ASC',
  );
  return rows.map(serializePlan);
}

// ---------------------------------------------------------------------------
// Souscription / consultation (routes 1 et 2)
// ---------------------------------------------------------------------------

async function findSellerSlug(q: Queryable, sellerId: number): Promise<string | null> {
  const { rows } = await q.query<{ slug: string }>(
    'SELECT slug FROM seller_subscriptions WHERE seller_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1',
    [sellerId],
  );
  return rows[0]?.slug ?? null;
}

async function slugTakenByOther(q: Queryable, slug: string, sellerId: number): Promise<boolean> {
  const { rows } = await q.query<{ seller_id: number }>(
    'SELECT seller_id FROM seller_subscriptions WHERE slug = $1 ORDER BY created_at ASC, id ASC LIMIT 1',
    [slug],
  );
  const owner = rows[0];
  return owner !== undefined && owner.seller_id !== sellerId;
}

export interface SubscribeInput {
  planId: number;
  slug?: string;
  supersedesId?: number | null;
}

/** POST /api/subscriptions — crée TOUJOURS un PENDING (jamais d'accès abonné, CA-V7-012). */
export async function createSubscription(sellerId: number, input: SubscribeInput) {
  return withTransaction(async (client) => {
    const planRes = await client.query<PlanRow>(
      'SELECT id, name, price_fcfa, quota, duration_days, active FROM subscription_plans WHERE id = $1 AND active = TRUE',
      [input.planId],
    );
    const plan = planRes.rows[0];
    if (!plan) throw notFound('PLAN_NOT_FOUND', 'Forfait introuvable');

    // Résolution du slug (règle unique, serveur = autorité).
    let slugToUse: string;
    let supersedesId: number | null = null;

    if (input.supersedesId != null) {
      const { rows } = await client.query<SubscriptionRow>(
        'SELECT * FROM seller_subscriptions WHERE id = $1',
        [input.supersedesId],
      );
      const target = rows[0];
      // Non divulguée : d'autrui / inexistant → 404 (aucune confirmation d'existence).
      if (!target || target.seller_id !== sellerId) {
        throw notFound('NOT_FOUND', 'Abonnement introuvable');
      }
      if (target.status !== 'ACTIVE') {
        throw badRequest(
          'INVALID_SUPERSEDES',
          "Votre abonnement n'est pas actif : seul un abonnement actif peut être remplacé",
        );
      }
      // Changement de forfait : slug copié du prédécesseur ; le slug envoyé est ignoré.
      slugToUse = target.slug;
      supersedesId = target.id;
    } else {
      // Réservation à vie par vendeur : un vendeur qui possède déjà un slug
      // (EXPIRED/CANCELLED compris) récupère LE sien, quel que soit le slug envoyé.
      const ownSlug = await findSellerSlug(client, sellerId);
      if (ownSlug) {
        slugToUse = ownSlug;
      } else {
        if (input.slug === undefined) {
          throw badRequest('VALIDATION_ERROR', 'Données invalides', [
            { field: 'slug', message: 'Le slug est requis' },
          ]);
        }
        const normalized = normalizeSlug(input.slug);
        if (!isSlugFormatValid(normalized)) {
          throw badRequest('VALIDATION_ERROR', 'Données invalides', [
            {
              field: 'slug',
              message: 'Le slug doit faire 3 à 40 caractères, minuscules/chiffres séparés par des tirets',
            },
          ]);
        }
        if (isReservedSlug(normalized)) {
          throw badRequest('SLUG_RESERVED', 'Ce nom est réservé, choisissez-en un autre');
        }
        if (await slugTakenByOther(client, normalized, sellerId)) {
          throw conflict('SLUG_TAKEN', 'Cette adresse de boutique est déjà prise');
        }
        slugToUse = normalized;
      }
    }

    try {
      const { rows } = await client.query<SubscriptionRow>(
        `INSERT INTO seller_subscriptions (seller_id, plan_id, slug, supersedes_id)
           VALUES ($1, $2, $3, $4) RETURNING *`,
        [sellerId, plan.id, slugToUse, supersedesId],
      );
      const created = rows[0]!;
      return {
        subscription: {
          id: created.id,
          planId: plan.id,
          slug: created.slug,
          status: created.status,
          supersedesId: created.supersedes_id,
          createdAt: toIso(created.created_at)!,
        },
      };
    } catch (err) {
      if (isPgError(err) && err.code === '23505') {
        // Filet DB : concurrence sur le slug réservé (ACTIVE) ou double ACTIVE.
        if (err.constraint === 'uq_active_subscription_slug') {
          throw conflict('SLUG_TAKEN', 'Cette adresse de boutique est déjà prise');
        }
        if (err.constraint === 'uq_one_active_subscription_per_seller') {
          throw conflict('SUBSCRIPTION_ALREADY_ACTIVE', 'Ce vendeur a déjà un abonnement actif');
        }
      }
      throw err;
    }
  });
}

async function countLiveListings(q: Queryable, subscriptionId: number): Promise<number> {
  const { rows } = await q.query<{ used: number }>(
    `SELECT COUNT(*)::int AS used
       FROM storefront_listings l
       JOIN products p ON p.id = l.product_id
      WHERE l.subscription_id = $1
        AND l.withdrawn_at IS NULL
        AND p.status IN ('PENDING', 'AVAILABLE', 'RESERVED')
        AND p.deleted_at IS NULL`,
    [subscriptionId],
  );
  return rows[0]?.used ?? 0;
}

async function listListingsView(q: Queryable, subscriptionId: number) {
  const { rows } = await q.query<{
    id: number;
    product_id: number;
    name: string;
    price: number;
    status: string;
    created_at: Date | string;
  }>(
    `SELECT l.id, l.product_id, p.name, p.price, p.status, l.created_at
       FROM storefront_listings l
       JOIN products p ON p.id = l.product_id
      WHERE l.subscription_id = $1
        AND l.withdrawn_at IS NULL
        AND p.status = ANY($2::product_status[])
        AND p.deleted_at IS NULL
      ORDER BY l.created_at DESC, l.id DESC`,
    [subscriptionId, [...LIVE_PRODUCT_STATUSES]],
  );
  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    title: row.name,
    price: row.price,
    effectiveStatus: row.status,
    createdAt: toIso(row.created_at)!,
  }));
}

/** GET /api/subscriptions/me — matérialise paresseusement l'expiration, puis répond. */
export async function getMySubscription(sellerId: number) {
  // Matérialisation paresseuse (ACTIVE → EXPIRED) — sans cron.
  await materializeExpiredSubscriptions(pool, { sellerId });

  const plans = await listActivePlans();

  // Abonnement « courant » : ACTIVE en priorité, sinon le plus récent.
  const { rows } = await pool.query<SubscriptionWithPlanRow>(
    `SELECT s.*, pl.name AS plan_name, pl.price_fcfa, pl.quota, pl.duration_days
       FROM seller_subscriptions s
       JOIN subscription_plans pl ON pl.id = s.plan_id
      WHERE s.seller_id = $1
      ORDER BY (s.status = 'ACTIVE') DESC, s.created_at DESC, s.id DESC
      LIMIT 1`,
    [sellerId],
  );
  const sub = rows[0];
  if (!sub) {
    return { subscription: null, usage: null, listings: [], plans };
  }

  const plan = {
    id: sub.plan_id,
    name: sub.plan_name,
    priceFcfa: Number(sub.price_fcfa),
    quota: Number(sub.quota),
    durationDays: Number(sub.duration_days),
  };

  const isLive = sub.status === 'ACTIVE' || sub.status === 'EXPIRED' || sub.status === 'CANCELLED';
  const daysRemaining =
    sub.status === 'ACTIVE' && sub.ends_at
      ? Math.max(0, Math.ceil((new Date(sub.ends_at).getTime() - Date.now()) / 86_400_000))
      : 0;

  const subscription: Record<string, unknown> = {
    id: sub.id,
    status: sub.status,
    slug: sub.slug,
    plan,
    supersedesId: sub.supersedes_id,
    startedAt: toIso(sub.started_at),
    endsAt: toIso(sub.ends_at),
    daysRemaining,
    activatedBy: sub.activated_by,
    activatedAt: toIso(sub.activated_at),
    createdAt: toIso(sub.created_at)!,
  };
  if (sub.status === 'EXPIRED' && sub.ends_at) {
    subscription.message = EXPIRED_MESSAGE(sub.ends_at);
  }

  if (!isLive) {
    return { subscription, usage: null, listings: [], plans };
  }

  const used = await countLiveListings(pool, sub.id);
  const listings = await listListingsView(pool, sub.id);
  return {
    subscription,
    usage: { used, quota: plan.quota, remaining: Math.max(0, plan.quota - used) },
    listings,
    plans,
  };
}

// ---------------------------------------------------------------------------
// Ajout / retrait d'annonce de boutique (routes 3 et 4)
// ---------------------------------------------------------------------------

/** POST /api/storefront/listings — SEUL point de contrôle du quota (avec verrou FOR UPDATE). */
export async function addListingToStorefront(sellerId: number, productId: number) {
  return withTransaction(async (client) => {
    // Expiration paresseuse AVANT la résolution de l'abonnement.
    await materializeExpiredSubscriptions(client, { sellerId });

    const { rows: subs } = await client.query<SubscriptionRow & { quota: number; duration_days: number }>(
      `SELECT s.*, pl.quota, pl.duration_days
         FROM seller_subscriptions s
         JOIN subscription_plans pl ON pl.id = s.plan_id
        WHERE s.seller_id = $1 AND s.status = 'ACTIVE' AND s.ends_at > now()
        LIMIT 1`,
      [sellerId],
    );
    const sub = subs[0];
    // Le vendeur sait qu'il n'est pas abonné : 403, jamais 404 (contrat §7.3).
    if (!sub) {
      throw forbidden('SUBSCRIPTION_REQUIRED', 'Un abonnement actif est nécessaire pour gérer votre boutique');
    }

    const { rows: products } = await client.query<{ id: number; owner_id: number }>(
      'SELECT id, owner_id FROM products WHERE id = $1 AND deleted_at IS NULL',
      [productId],
    );
    const product = products[0];
    if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Article introuvable');
    if (product.owner_id !== sellerId) {
      throw forbidden('NOT_PRODUCT_OWNER', 'Ce produit ne vous appartient pas');
    }

    // Sérialise les ajouts d'un même abonnement (R-V7-A5).
    await client.query('SELECT id FROM seller_subscriptions WHERE id = $1 FOR UPDATE', [sub.id]);

    const used = await countLiveListings(client, sub.id);
    const quota = sub.quota;
    if (used >= quota) {
      throw conflict(
        'STOREFRONT_QUOTA_EXCEEDED',
        `Quota de votre forfait atteint (${used}/${quota}). Retirez une annonce de votre boutique ou changez de forfait.`,
      );
    }

    try {
      const { rows } = await client.query<{ id: number; created_at: Date | string }>(
        'INSERT INTO storefront_listings (product_id, subscription_id) VALUES ($1, $2) RETURNING id, created_at',
        [productId, sub.id],
      );
      const listing = rows[0]!;
      return {
        listing: { id: listing.id, productId, createdAt: toIso(listing.created_at)! },
      };
    } catch (err) {
      if (isPgError(err) && err.code === '23505' && err.constraint === 'uq_storefront_active_product') {
        throw conflict('STOREFRONT_ALREADY_LISTED', 'Cette annonce est déjà dans votre boutique');
      }
      throw err;
    }
  });
}

/** DELETE /api/storefront/listings/:id — retrait boutique-scopé, idempotent, 0 écriture sur products. */
export async function withdrawListing(sellerId: number, listingId: number) {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: number; withdrawn_at: Date | string | null }>(
      `SELECT l.id, l.withdrawn_at
         FROM storefront_listings l
         JOIN seller_subscriptions s ON s.id = l.subscription_id
        WHERE l.id = $1 AND s.seller_id = $2`,
      [listingId, sellerId],
    );
    const listing = rows[0];
    // Ressource inconnue OU d'autrui → 404 (jamais 403, §1.4 v2.6).
    if (!listing) throw notFound('NOT_FOUND', 'Annonce de boutique introuvable');
    if (listing.withdrawn_at !== null) return { ok: true };
    await client.query('UPDATE storefront_listings SET withdrawn_at = now() WHERE id = $1', [listing.id]);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Boutique publique (route 5) — non-divulgation : UN SEUL notFound
// ---------------------------------------------------------------------------

const STOREFRONT_NOT_FOUND = () => notFound('NOT_FOUND', 'Boutique introuvable');

async function resolvePublicStorefront(q: Queryable, slug: string) {
  const { rows } = await q.query<{ id: number; slug: string; display_name: string; created_at: Date }>(
    `SELECT s.id, s.slug, u.display_name, u.created_at
       FROM seller_subscriptions s
       JOIN users u ON u.id = s.seller_id
      WHERE s.slug = $1 AND s.status = 'ACTIVE' AND s.ends_at > now()`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function getPublicStorefront(slug: string, page: number, perPage: number) {
  // Lecture publique non divulgatrice : le filtre `ends_at > now()` est seul
  // juge ; la matérialisation paresseuse est une opportunité bornée au slug.
  const storefront = await resolvePublicStorefront(pool, slug);
  if (storefront) await materializeExpiredSubscriptions(pool, { slug });
  if (!storefront) throw STOREFRONT_NOT_FOUND();

  const offset = (page - 1) * perPage;
  const { rows: countRows } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
       FROM storefront_listings l
       JOIN products p ON p.id = l.product_id
      WHERE l.subscription_id = $1
        AND l.withdrawn_at IS NULL
        AND p.status = ANY($2::product_status[])
        AND p.deleted_at IS NULL`,
    [storefront.id, [...LIVE_PRODUCT_STATUSES]],
  );
  const total = countRows[0]?.total ?? 0;

  const { rows: items } = await pool.query<StorefrontItemRow>(
    `SELECT p.id AS product_id, p.name, p.price, p.status,
            pi.path AS primary_photo_path
       FROM storefront_listings l
       JOIN products p ON p.id = l.product_id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = TRUE
      WHERE l.subscription_id = $1
        AND l.withdrawn_at IS NULL
        AND p.status = ANY($2::product_status[])
        AND p.deleted_at IS NULL
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $3 OFFSET $4`,
    [storefront.id, [...LIVE_PRODUCT_STATUSES], perPage, offset],
  );

  return {
    storefront: serializeStorefrontPublic(storefront),
    items: items.map(serializeStorefrontItem),
    page,
    perPage,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / perPage),
  };
}

// ---------------------------------------------------------------------------
// Contact boutique (route 6)
// ---------------------------------------------------------------------------

/** POST /api/storefront/:slug/contact — notification interne `product.contact`, jamais de canal privé. */
export async function contactStorefront(
  sender: { id: number; displayName: string },
  slug: string,
  input: { message: string; email?: string },
) {
  return withTransaction(async (client): Promise<{ ok: true; notificationId: number }> => {
    // Même requête de non-divulgation que la boutique (404 identique).
    const { rows } = await client.query<{ id: number; seller_id: number; slug: string }>(
      `SELECT s.id, s.seller_id, s.slug
         FROM seller_subscriptions s
         JOIN users u ON u.id = s.seller_id
        WHERE s.slug = $1 AND s.status = 'ACTIVE' AND s.ends_at > now()`,
      [slug],
    );
    const storefront = rows[0];
    if (storefront) await materializeExpiredSubscriptions(client, { slug });
    if (!storefront) throw STOREFRONT_NOT_FOUND();

    if (storefront.seller_id === sender.id) {
      throw badRequest('CONTACT_SELF', 'Vous ne pouvez pas contacter votre propre boutique');
    }

    const emailPart = input.email ? ` — ${input.email}` : '';
    const title = `Nouveau message depuis la boutique « ${storefront.slug} » — De : ${sender.displayName}`;
    const message = `De : ${sender.displayName}${emailPart}\n\n${input.message}`;
    const notificationId = await insertNotification(
      client,
      storefront.seller_id,
      STOREFRONT_CONTACT_NOTIFICATION_TYPE,
      title,
      message,
    );
    return { ok: true, notificationId };
  });
}

// ---------------------------------------------------------------------------
// Gouvernance admin (routes 7 et 8)
// ---------------------------------------------------------------------------

export interface AdminSubscriptionsQuery {
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  page: number;
  perPage: number;
}

/** GET /api/admin/subscriptions — file/historique paginé, tri created_at DESC. */
export async function listAdminSubscriptions(query: AdminSubscriptionsQuery) {
  const offset = (query.page - 1) * query.perPage;
  const { rows: countRows } = await pool.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM seller_subscriptions WHERE status = $1',
    [query.status],
  );
  const total = countRows[0]?.total ?? 0;

  const { rows } = await pool.query<{
    id: number;
    seller_id: number;
    seller_display_name: string;
    plan_name: string;
    price_fcfa: number;
    quota: number;
    slug: string;
    status: string;
    created_at: Date | string;
    activated_at: Date | string | null;
    activated_by: number | null;
  }>(
    `SELECT s.id, s.seller_id, u.display_name AS seller_display_name,
            pl.name AS plan_name, pl.price_fcfa, pl.quota,
            s.slug, s.status, s.created_at, s.activated_at, s.activated_by
       FROM seller_subscriptions s
       JOIN users u ON u.id = s.seller_id
       JOIN subscription_plans pl ON pl.id = s.plan_id
      WHERE s.status = $1
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT $2 OFFSET $3`,
    [query.status, query.perPage, offset],
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      sellerId: row.seller_id,
      sellerDisplayName: row.seller_display_name,
      planName: row.plan_name,
      priceFcfa: row.price_fcfa,
      quota: row.quota,
      slug: row.slug,
      status: row.status,
      createdAt: toIso(row.created_at)!,
      activatedAt: toIso(row.activated_at),
      activatedBy: row.activated_by,
    })),
    page: query.page,
    perPage: query.perPage,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.perPage),
  };
}

/** POST /api/admin/subscriptions/:id/activate — SEUL chemin PENDING → ACTIVE. */
export async function activateSubscription(adminId: number, targetId: number) {
  return withTransaction(async (client) => {
    const { rows: targetRows } = await client.query<SubscriptionRow>(
      'SELECT * FROM seller_subscriptions WHERE id = $1',
      [targetId],
    );
    const target = targetRows[0];
    if (!target) throw notFound('NOT_FOUND', 'Abonnement introuvable');
    if (target.status !== 'PENDING') {
      throw conflict('INVALID_STATUS', "Cette demande n'est pas en attente d'activation");
    }

    // (1) Matérialisation paresseuse des ACTIVE expirés de CE vendeur.
    await materializeExpiredSubscriptions(client, { sellerId: target.seller_id });

    if (target.supersedes_id != null) {
      // (2a) Changement de forfait : CANCELLED du prédécesseur + réattach des listings actifs.
      const cancelled = await client.query(
        `UPDATE seller_subscriptions
            SET status = 'CANCELLED'
          WHERE id = $1 AND seller_id = $2 AND status = 'ACTIVE'
          RETURNING id`,
        [target.supersedes_id, target.seller_id],
      );
      if ((cancelled.rowCount ?? 0) > 0) {
        await client.query(
          `UPDATE storefront_listings
              SET subscription_id = $1
            WHERE subscription_id = $2 AND withdrawn_at IS NULL`,
          [target.id, target.supersedes_id],
        );
      }
    } else {
      // (2b) Demande indépendante : un ACTIVE existe déjà pour ce vendeur → 409.
      const { rows: activeRows } = await client.query(
        `SELECT id FROM seller_subscriptions
          WHERE seller_id = $1 AND status = 'ACTIVE' AND ends_at > now()
          LIMIT 1`,
        [target.seller_id],
      );
      if (activeRows.length > 0) {
        throw conflict('SUBSCRIPTION_ALREADY_ACTIVE', 'Ce vendeur a déjà un abonnement actif');
      }
    }

    // (3) Activation tracée — seul endroit qui pose les champs d'activation.
    try {
      const { rows } = await client.query<SubscriptionRow>(
        `UPDATE seller_subscriptions
            SET status = 'ACTIVE',
                started_at = now(),
                ends_at = now() + ((SELECT duration_days FROM subscription_plans WHERE id = $2) || ' days')::interval,
                activated_by = $3,
                activated_at = now()
          WHERE id = $1 AND status = 'PENDING'
          RETURNING *`,
        [target.id, target.plan_id, adminId],
      );
      const activated = rows[0];
      if (!activated) {
        throw conflict('INVALID_STATUS', "Cette demande n'est pas en attente d'activation");
      }
      return {
        subscription: {
          id: activated.id,
          status: activated.status,
          slug: activated.slug,
          startedAt: toIso(activated.started_at)!,
          endsAt: toIso(activated.ends_at)!,
          activatedBy: activated.activated_by,
          activatedAt: toIso(activated.activated_at)!,
        },
      };
    } catch (err) {
      if (isPgError(err) && err.code === '23505' && err.constraint === 'uq_one_active_subscription_per_seller') {
        // Course : un autre ACTIVE est apparu entre-temps (filet DB).
        throw conflict('SUBSCRIPTION_ALREADY_ACTIVE', 'Ce vendeur a déjà un abonnement actif');
      }
      throw err;
    }
  });
}
