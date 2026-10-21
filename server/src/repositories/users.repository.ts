import { query } from '../db/pool.js';
import { pool, type Queryable } from '../db/pool.js';
import type { UserRow } from '../utils/serializers.js';

export interface UserWithHash extends UserRow {
  password_hash: string;
}

export interface InsertUserInput {
  displayName: string;
  name: string;
  email: string;
  phone: string;
}

/** INSERT d'un nouvel utilisateur (mot de passe déjà haché). */
export async function insertUser(
  input: InsertUserInput,
  passwordHash: string,
  q: Queryable = pool,
): Promise<UserRow> {
  const { rows } = await q.query<UserRow>(
    `INSERT INTO users (display_name, name, email, phone, password_hash, accepted_cgu)
     VALUES ($1,$2,$3,$4,$5,TRUE)
     RETURNING *`,
    [input.displayName, input.name, input.email, input.phone, passwordHash],
  );
  const created = rows[0];
  if (!created) throw new Error('insertUser : aucune ligne retournée');
  return created;
}

/** Recherche par e-mail (insensible à la casse) — inclut le hash pour la connexion. */
export async function findByEmail(email: string, q: Queryable = pool): Promise<UserWithHash | undefined> {
  const { rows } = await q.query<UserWithHash>('SELECT * FROM users WHERE lower(email) = $1', [email]);
  return rows[0];
}

/**
 * Utilisateur par identifiant.
 *
 * Chargée sur la connexion primaire unique : `requireAuth` s'en sert pour
 * recharger le RÔLE et vérifier l'existence du compte à chaque requête
 * authentifiée, ce qui exige la cohérence de lecture juste après écriture.
 */
export async function findById(id: number, q: Queryable = pool): Promise<UserRow | undefined> {
  const { rows } = await q.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0];
}

/**
 * E-mail résolu par identifiant — utilisé par le programmateur d'e-mails
 * (CA-V5-011 : aucune adresse n'entre par l'API, elle est relue en base).
 * `null` si le compte a disparu entre l'enfilement et l'envoi.
 */
export async function findEmailById(id: number, q: Queryable = pool): Promise<string | null> {
  const { rows } = await query<{ email: string | null }>(
    'SELECT email FROM users WHERE id = $1',
    [id],
  );
  return rows[0]?.email ?? null;
}

/**
 * Vue admin d'un utilisateur avec ses compteurs `productCount`/`orderCount`.
 * `includeOrderCount: false` supprime complètement la sous-requête (vue produit
 * admin, §3.6). `undefined` = utilisateur inexistant.
 */
export async function findAdminUserById(
  id: number,
  opts: { includeOrderCount?: boolean } = {},
  q: Queryable = pool,
): Promise<UserRow | undefined> {
  const productCountSelect =
    `(SELECT COUNT(*)::int FROM products p WHERE p.owner_id = u.id AND p.deleted_at IS NULL) AS product_count`;
  const orderCountSelect =
    opts.includeOrderCount === false
      ? ''
      : `, (SELECT COUNT(*)::int FROM orders o WHERE o.buyer_id = u.id) AS order_count`;
  const { rows } = await q.query<UserRow>(
    // Colonnes EXPLICITES (RG 7.7, aligné sur `selectAdminUsersPage`) : `u.*`
    // chargerait `password_hash` / `password_changed_at` sans que le seul
    // consommateur (`serializeAdminUser`) n'en ait besoin.
    `SELECT u.id, u.display_name, u.name, u.email, u.phone, u.role, u.created_at,
            ${productCountSelect}${orderCountSelect}
       FROM users u WHERE u.id = $1`,
    [id],
  );
  return rows[0];
}

function adminUsersWhere(search: string | undefined): { whereClause: string; params: unknown[] } {
  const where: string[] = ["role = 'user'"];
  const params: unknown[] = [];
  if (search) {
    params.push(`%${search}%`);
    where.push(`(display_name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  return { whereClause: `WHERE ${where.join(' AND ')}`, params };
}

export async function countAdminUsers(search?: string, q: Queryable = pool): Promise<number> {
  const { whereClause, params } = adminUsersWhere(search);
  const { rows } = await q.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM users ${whereClause}`,
    params,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function selectAdminUsersPage(
  opts: { q?: string; limit: number; offset: number },
  q: Queryable = pool,
): Promise<UserRow[]> {
  const { whereClause, params } = adminUsersWhere(opts.q);
  // Colonnes EXPLICITES : `u.*` chargerait inutilement `password_hash` /
  // `password_changed_at` — le sérialiseur admin n'en a nul besoin (jamais de
  // mot de passe en réponse, RG 7.7).
  const { rows } = await q.query<UserRow>(
    `SELECT u.id, u.display_name, u.name, u.email, u.phone, u.role, u.created_at,
            (SELECT COUNT(*)::int FROM products p WHERE p.owner_id = u.id AND p.deleted_at IS NULL) AS product_count,
            (SELECT COUNT(*)::int FROM orders o WHERE o.buyer_id = u.id) AS order_count
       FROM users u ${whereClause}
      ORDER BY u.created_at DESC, u.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, opts.limit, opts.offset],
  );
  return rows;
}
