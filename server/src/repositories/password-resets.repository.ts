import crypto from 'node:crypto';
import { pool, type Queryable } from '../db/pool.js';
import type { UserRow } from '../utils/serializers.js';

/**
 * Réinitialisation de mot de passe.
 *
 * ## Où vivent les jetons ?
 * `password_reset_tokens` est écrit et lu sur la connexion primaire unique,
 * comme `users` (`users.repository.ts`), afin qu'une lecture voisine d'une
 * écriture soit toujours cohérente.
 *
 * ## Pourquoi un haché et pas le jeton brut ?
 * La table est lisible par quiconque accède à la base (dump, backup, log).
 * Si elle contenait les jetons en clair, cette lecture suffirait à prendre le
 * contrôle d'un compte. SHA-256 suffit ici : le jeton est lui-même 256 bits
 * d'entropie (32 octets aléatoires), donc pas de sel nécessaire ni de
 * bcrypt — un hachage rapide ne s'attaque pas par force brute quand l'entrée
 * est imprévisible.
 */

/** Durée de validité d'un jeton : 1 heure. Volontairement court. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Jeton de réinitialisation + l'utilisateur concerné (joint à la lecture). */
export interface PasswordResetToken {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date | string;
  used_at: Date | string | null;
}

/** Hache un jeton avant comparaison/stockage. */
export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/** Génère un jeton opaque (256 bits) et renvoie `{ rawToken, tokenHash }`. */
export function generateResetToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  return { rawToken, tokenHash: hashResetToken(rawToken) };
}

/**
 * Crée un jeton pour `userId` et **invalide au passage tous les jetons encore
 * utilisables** du même compte : demander trois réinitialisations de suite ne
 * doit pas laisser trois portes ouvertes, seule la plus récente compte.
 */
export async function insertResetToken(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
  q: Queryable = pool,
): Promise<void> {
  await q.query(`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  await q.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
}

/** Jeton encore valide = non utilisé ET non expiré. Joint l'utilisateur. */
export async function findValidResetToken(
  tokenHash: string,
  q: Queryable = pool,
): Promise<{ token: PasswordResetToken; user: UserRow } | undefined> {
  const { rows } = await q.query<{
    id: number;
    user_id: number;
    token_hash: string;
    expires_at: Date | string;
    used_at: Date | string | null;
    display_name: string;
    name: string;
    email: string;
    phone: string;
    password_hash: string;
    role: 'user' | 'admin';
    accepted_cgu: boolean;
    created_at: Date | string;
    updated_at: Date | string;
    password_changed_at: Date | string | null;
  }>(
    `SELECT t.id, t.user_id, t.token_hash, t.expires_at, t.used_at,
            u.display_name, u.name, u.email, u.phone, u.password_hash, u.role,
            u.accepted_cgu, u.created_at, u.updated_at, u.password_changed_at
       FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1
        AND t.used_at IS NULL
        AND t.expires_at > now()`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return undefined;

  const token: PasswordResetToken = {
    id: row.id,
    user_id: row.user_id,
    token_hash: row.token_hash,
    expires_at: row.expires_at,
    used_at: row.used_at,
  };
  const user = {
    id: row.user_id,
    display_name: row.display_name,
    name: row.name,
    email: row.email,
    phone: row.phone,
    password_hash: row.password_hash,
    role: row.role,
    accepted_cgu: row.accepted_cgu,
    created_at: row.created_at,
    updated_at: row.updated_at,
    password_changed_at: row.password_changed_at,
  } as unknown as UserRow;
  return { token, user };
}

/**
 * Consomme le jeton (marquage `used_at`). `UPDATE … WHERE used_at IS NULL`
 * garantit qu'un second appel échoue (0 ligne) — filet de sécurité contre
 * l'usage simultané du même jeton au-delà de la contrainte unique.
 */
export async function consumeResetToken(id: number, q: Queryable = pool): Promise<boolean> {
  const res = await q.query(
    `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL`,
    [id],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Met à jour le mot de passe ET date le changement (→ invalidation des sessions). */
export async function updateUserPassword(
  userId: number,
  passwordHash: string,
  q: Queryable = pool,
): Promise<void> {
  await q.query(
    `UPDATE users SET password_hash = $1, password_changed_at = now(), updated_at = now() WHERE id = $2`,
    [passwordHash, userId],
  );
}

/** Invalide tous les jetons encore ouverts d'un compte (purge de sécurité). */
export async function invalidateAllResetTokens(userId: number, q: Queryable = pool): Promise<void> {
  await q.query(`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
}
