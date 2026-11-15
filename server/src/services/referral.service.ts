import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { sendMail } from '../mail/mailer.js';
import { logger } from '../utils/logger.js';

/**
 * Parrainage « Le Cercle des 10 » (docs : journal 2026-11-15).
 *
 * Règles, appliquées ici et nulle part ailleurs :
 *
 * 1. **Un filleul est « validé » quand son PREMIER article est approuvé** —
 *    jamais à l'inscription. Un compte vide, un faux compte ou un article
 *    refusé ne créditent donc aucun parrain (anti-fraude).
 * 2. **Idempotence** : `referral_qualifications.referee_id` est UNIQUE et
 *    l'insertion est un `ON CONFLICT DO NOTHING`. Rejouer l'approbation, ou
 *    approuver un second article du même filleul, ne recrédite jamais.
 * 3. **Paliers** : 5 filleuls → badge 30 jours ; 10 filleuls → badge 1 an +
 *    Vitrine 30 jours. Le franchissement d'un palier envoie UN e-mail
 *    (`referral_milestone`), pas dix.
 * 4. **Un échec d'e-mail ne casse jamais la qualification** : `sendMail` ne
 *    lève pas, et la mise à jour des paliers est faite AVANT l'envoi.
 */

/** Filleuls validés nécessaires pour entrer dans le Cercle. */
export const REFERRAL_TARGET = 10;
/** Premier palier : badge seul. */
export const REFERRAL_BADGE_TARGET = 5;

const BADGE_DAYS = 30;
const BADGE_YEAR_DAYS = 365;
const VITRINE_DAYS = 30;
/** Palier 5 : sept jours de Vitrine (le mois complet est réservé au Cercle). */
const BADGE_VITRINE_DAYS = 7;

/** Code de parrainage : `RV` + 8 hexadécimaux (ex. `RV3F9A2B7C`). */
const CODE_RE = /^RV[A-Z0-9]{6,12}$/;

export interface ReferralSummary {
  code: string;
  qualified: number;
  target: number;
  badgeTarget: number;
  badgeActive: boolean;
  badgeUntil: string | null;
  vitrineActive: boolean;
  vitrineUntil: string | null;
  remaining: number;
}

export interface QualificationOutcome {
  referrerId: number;
  qualified: number;
  /** Palier franchi par CETTE qualification (`null` sinon). */
  milestone: number | null;
}

interface PgErrorLike {
  code?: string;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as PgErrorLike).code === '23505';
}

function randomCode(): string {
  return `RV${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isActive(value: Date | string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const d = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

/**
 * Code de parrainage de l'utilisateur, créé à la demande.
 *
 * La colonne a un DEFAULT en base (les inscriptions n'ont donc rien à faire),
 * mais les comptes antérieurs à la migration sont couverts par le backfill :
 * cette fonction n'est qu'un filet de sécurité, jamais un chemin normal.
 */
export async function ensureReferralCode(userId: number): Promise<string> {
  const { rows } = await pool.query<{ referral_code: string | null }>(
    'SELECT referral_code FROM users WHERE id = $1',
    [userId],
  );
  const existing = rows[0]?.referral_code;
  if (typeof existing === 'string' && existing.length > 0) return existing;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const upd = await pool.query<{ referral_code: string }>(
        `UPDATE users
            SET referral_code = $2, updated_at = now()
          WHERE id = $1 AND referral_code IS NULL
          RETURNING referral_code`,
        [userId, randomCode()],
      );
      const got = upd.rows[0]?.referral_code;
      if (typeof got === 'string') return got;

      // Course perdue : un autre appel a créé le code entre-temps.
      const again = await pool.query<{ referral_code: string | null }>(
        'SELECT referral_code FROM users WHERE id = $1',
        [userId],
      );
      const value = again.rows[0]?.referral_code;
      if (typeof value === 'string') return value;
    } catch (err) {
      if (isUniqueViolation(err)) continue; // collision de code : on retire
      throw err;
    }
  }
  throw new Error('ensureReferralCode : aucun code unique généré');
}

/**
 * Attribue un parrain à un compte, une seule fois.
 *
 * Retourne `true` si l'attribution a bien eu lieu. Les cas silencieusement
 * ignorés sont volontaires : code inconnu, code malformé, auto-parrainage,
 * compte déjà attribué. Un code invalide ne doit JAMAIS faire échouer une
 * inscription.
 */
export async function attributeReferral(userId: number, rawCode: unknown): Promise<boolean> {
  if (typeof rawCode !== 'string') return false;
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) return false;

  const { rows } = await pool.query<{ id: number }>(
    'SELECT id FROM users WHERE referral_code = $1',
    [code],
  );
  const referrerId = rows[0]?.id;
  if (typeof referrerId !== 'number' || referrerId === userId) return false;

  const upd = await pool.query(
    `UPDATE users
        SET referred_by = $2, updated_at = now()
      WHERE id = $1 AND referred_by IS NULL
      RETURNING id`,
    [userId, referrerId],
  );
  if ((upd.rowCount ?? 0) === 0) return false;

  // Rattrapage : le compte est attribué APRÈS avoir déjà publié (cas d'un
  // utilisateur existant qui clique un lien de parrainage). On qualifie tout
  // de suite sur son premier article déjà approuvé, sans attendre une future
  // approbation qui n'arrivera peut-être jamais.
  const approved = await pool.query<{ id: number }>(
    `SELECT id FROM products
      WHERE owner_id = $1 AND status IN ('AVAILABLE', 'RESERVED', 'SOLD')
      ORDER BY id LIMIT 1`,
    [userId],
  );
  const productId = approved.rows[0]?.id;
  if (typeof productId === 'number') {
    await qualifyReferral(userId, productId).catch((err: unknown) => {
      logger.warn('parrainage : qualification différée impossible', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
  return true;
}

/**
 * Crédite le parrain quand un de ses filleuls fait approuver un article.
 *
 * `null` = rien à faire (pas de parrain, ou filleul déjà qualifié). Aucune
 * erreur n'est attendue ici : l'appelant (approbation admin) est déjà commité.
 */
export async function qualifyReferral(
  refereeId: number,
  productId: number | null,
): Promise<QualificationOutcome | null> {
  const { rows } = await pool.query<{ referred_by: number | null }>(
    'SELECT referred_by FROM users WHERE id = $1',
    [refereeId],
  );
  const referrerId = rows[0]?.referred_by;
  if (typeof referrerId !== 'number') return null;

  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO referral_qualifications (referrer_id, referee_id, product_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (referee_id) DO NOTHING
     RETURNING id`,
    [referrerId, refereeId, productId],
  );
  if (inserted.rows.length === 0) return null; // déjà crédité

  const countRes = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM referral_qualifications WHERE referrer_id = $1',
    [referrerId],
  );
  const qualified = countRes.rows[0]?.n ?? 0;

  const milestone =
    qualified === REFERRAL_TARGET ? REFERRAL_TARGET : qualified === REFERRAL_BADGE_TARGET ? REFERRAL_BADGE_TARGET : null;

  if (qualified >= REFERRAL_BADGE_TARGET) {
    const inCircle = qualified >= REFERRAL_TARGET;
    const badgeDays = inCircle ? BADGE_YEAR_DAYS : BADGE_DAYS;
    const vitrineDays = inCircle ? VITRINE_DAYS : BADGE_VITRINE_DAYS;
    await pool.query(
      `UPDATE users
          SET ambassador_until = now() + make_interval(days => $2::int),
              vitrine_until = now() + make_interval(days => $3::int),
              updated_at = now()
        WHERE id = $1`,
      [referrerId, badgeDays, vitrineDays],
    );
  }

  if (milestone !== null) {
    await notifyMilestone(referrerId, milestone).catch((err: unknown) => {
      logger.warn('parrainage : e-mail de palier non envoyé', {
        referrerId,
        milestone,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return { referrerId, qualified, milestone };
}

/** E-mail de félicitations au franchissement d'un palier (5 ou 10). */
async function notifyMilestone(referrerId: number, milestone: number): Promise<void> {
  const { rows } = await pool.query<{ email: string; display_name: string }>(
    'SELECT email, display_name FROM users WHERE id = $1',
    [referrerId],
  );
  const row = rows[0];
  if (!row) return;
  await sendMail(referrerId, row.email, 'referral_milestone', {
    displayName: row.display_name,
    milestone,
    linkPath: '/parrainage',
  });
}

/** Tableau de bord de parrainage (page `/parrainage`). */
export async function getReferralSummary(userId: number): Promise<ReferralSummary> {
  const code = await ensureReferralCode(userId);

  const [countRes, userRes] = await Promise.all([
    pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM referral_qualifications WHERE referrer_id = $1',
      [userId],
    ),
    pool.query<{ ambassador_until: Date | string | null; vitrine_until: Date | string | null }>(
      'SELECT ambassador_until, vitrine_until FROM users WHERE id = $1',
      [userId],
    ),
  ]);

  const qualified = countRes.rows[0]?.n ?? 0;
  const row = userRes.rows[0];

  return {
    code,
    qualified,
    target: REFERRAL_TARGET,
    badgeTarget: REFERRAL_BADGE_TARGET,
    badgeActive: isActive(row?.ambassador_until),
    badgeUntil: toIsoOrNull(row?.ambassador_until),
    vitrineActive: isActive(row?.vitrine_until),
    vitrineUntil: toIsoOrNull(row?.vitrine_until),
    remaining: Math.max(0, REFERRAL_TARGET - qualified),
  };
}

export interface CampaignSendResult {
  ok: boolean;
  skipped: boolean;
}

/**
 * Envoi de la campagne « Le Cercle des 10 » à UN vendeur.
 *
 * Anti-doublon identique à la campagne de vente : une ligne
 * `notification_deliveries` par (clé de campagne, utilisateur), insérée en
 * `ON CONFLICT DO NOTHING`. Relancer le script ne renvoie jamais deux fois le
 * même message, et le statut SENT/FAILED reste consultable en base.
 */
export async function sendReferralLaunchToUser(
  userId: number,
  email: string,
  displayName: string,
  productCount: number,
  campaignKey: string,
): Promise<CampaignSendResult> {
  if (typeof email !== 'string' || email.trim().length === 0) {
    return { ok: false, skipped: false };
  }

  const idempotencyKey = `${campaignKey}:${userId}`;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO notification_deliveries
       (idempotency_key, channel, user_id, event, status, attempts)
     VALUES ($1, 'email', $2, 'referral_program_launch', 'PENDING', 0)
     ON CONFLICT (idempotency_key, channel) DO NOTHING
     RETURNING id`,
    [idempotencyKey, userId],
  );

  const row = inserted.rows[0];
  if (!row) return { ok: true, skipped: true };

  const code = await ensureReferralCode(userId);
  const ok = await sendMail(userId, email, 'referral_program_launch', {
    displayName,
    productCount,
    referralCode: code,
  });

  try {
    await pool.query(
      `UPDATE notification_deliveries
          SET status = $2::text,
              attempts = attempts + 1,
              last_error = $3,
              sent_at = CASE WHEN $2::text = 'SENT' THEN now() ELSE sent_at END,
              updated_at = now()
        WHERE id = $1`,
      [row.id, ok ? 'SENT' : 'FAILED', ok ? null : 'sendMail a retourné false'],
    );
  } catch (err) {
    logger.warn('parrainage : mise à jour de la livraison impossible', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { ok, skipped: false };
}
