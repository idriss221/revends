import { pool, type Queryable } from '../db/pool.js';

// ---------------------------------------------------------------------------
// V8-D5 — Profil branding 1:1 vendeur (storefront_profiles).
// `collecte_address` : AUCUNE surface API (§14.D clos — propriétaire, admin et
// public inclus) ; le propriétaire écrit via le profil, la logistique manuelle
// se fait via SQL/trusted uniquement. JAMAIS exposée.
// ---------------------------------------------------------------------------

export interface StorefrontProfileRow {
  seller_id: number;
  logo_path: string | null;
  banner_path: string | null;
  public_description: string | null;
  collecte_address: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * Upsert explicite champ-par-champ (le front distingue « pas fourni » d'« effacer »).
 * - champ absent de `fields` → valeur conservée ;
 * - champ présent → remplacé (NULL inclus) ;
 * - `clearLogo` / `clearBanner` → remise à NULL explicite.
 */
export async function upsertProfileFields(
  client: Queryable,
  sellerId: number,
  fields: {
    logoPath?: string | null;
    bannerPath?: string | null;
    publicDescription?: string | null;
    collecteAddress?: string | null;
    clearLogo?: boolean;
    clearBanner?: boolean;
  },
): Promise<StorefrontProfileRow> {
  await client.query(
    `INSERT INTO storefront_profiles (seller_id)
     VALUES ($1)
     ON CONFLICT (seller_id) DO UPDATE SET updated_at = now()`,
    [sellerId],
  );
  const currentRes = await client.query<StorefrontProfileRow>(
    'SELECT * FROM storefront_profiles WHERE seller_id = $1',
    [sellerId],
  );
  const current = currentRes.rows[0]!;
  const next = {
    logoPath: fields.clearLogo ? null : fields.logoPath !== undefined ? fields.logoPath : current.logo_path,
    bannerPath: fields.clearBanner ? null : fields.bannerPath !== undefined ? fields.bannerPath : current.banner_path,
    publicDescription:
      fields.publicDescription !== undefined ? fields.publicDescription : current.public_description,
    collecteAddress: fields.collecteAddress !== undefined ? fields.collecteAddress : current.collecte_address,
  };
  const updated = await client.query<StorefrontProfileRow>(
    `UPDATE storefront_profiles
        SET logo_path = $2, banner_path = $3, public_description = $4, collecte_address = $5, updated_at = now()
      WHERE seller_id = $1
      RETURNING *`,
    [sellerId, next.logoPath, next.bannerPath, next.publicDescription, next.collecteAddress],
  );
  return updated.rows[0]!;
}

/** Lecture interne (services) — inclut `collecte_address` ; JAMAIS sérialisée vers l'API/UI. */
export async function selectProfileForOwner(sellerId: number, q: Queryable = pool): Promise<StorefrontProfileRow | null> {
  const { rows } = await q.query<StorefrontProfileRow>(
    'SELECT * FROM storefront_profiles WHERE seller_id = $1',
    [sellerId],
  );
  return rows[0] ?? null;
}

/**
 * Lecture publique (boutique) : `collecte_address` N'EST PAS SÉLECTIONNÉE.
 * À n'appeler que si l'abonnement est ACTIVE (non-divulgation, CA-V7-026).
 */
export async function selectPublicProfile(sellerId: number, q: Queryable = pool) {
  const { rows } = await q.query<{
    logo_path: string | null;
    banner_path: string | null;
    public_description: string | null;
  }>(
    'SELECT logo_path, banner_path, public_description FROM storefront_profiles WHERE seller_id = $1',
    [sellerId],
  );
  return rows[0] ?? null;
}
