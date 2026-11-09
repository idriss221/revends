import crypto from 'node:crypto';
import { pool, type Queryable } from '../db/pool.js';
import type { UserRow } from '../utils/serializers.js';

/** Durée de validité d'un jeton de mise à jour de numéro : 7 jours. */
export const PHONE_RESET_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PhoneResetToken {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date | string;
  used_at: Date | string | null;
}

export function hashPhoneResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generatePhoneResetToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  return { rawToken, tokenHash: hashPhoneResetToken(rawToken) };
}

export async function insertPhoneResetToken(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
  q: Queryable = pool,
): Promise<void> {
  await q.query(`UPDATE phone_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  await q.query(
    `INSERT INTO phone_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
}

export async function findValidPhoneResetToken(
  tokenHash: string,
  q: Queryable = pool,
): Promise<{ token: PhoneResetToken; user: UserRow } | undefined> {
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
       FROM phone_reset_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1
        AND t.used_at IS NULL
        AND t.expires_at > now()`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return undefined;
  const token: PhoneResetToken = {
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

export async function consumePhoneResetToken(id: number, q: Queryable = pool): Promise<boolean> {
  const res = await q.query(
    `UPDATE phone_reset_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL`,
    [id],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function updateUserPhone(userId: number, newPhone: string, q: Queryable = pool): Promise<void> {
  await q.query(`UPDATE users SET phone = $1, updated_at = now() WHERE id = $2`, [newPhone, userId]);
}
