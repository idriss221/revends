import type { Express } from 'express';
import { withTransaction, afterCommit } from '../utils/db.js';
import { pool } from '../db/pool.js';
import { AppError, badRequest, forbidden } from '../utils/errors.js';
import { sniffImageMime, MAX_LOGO_BYTES, MAX_BANNER_BYTES } from '../middleware/upload.js';
import { saveStorefrontAsset, deleteStorefrontAsset } from '../utils/storage.js';
import { logger } from '../utils/logger.js';
import { imageUrl } from '../utils/storefront.js';
import { storeBadge } from '../utils/storefront-badges.js';
import {
  selectProfileForOwner,
  upsertProfileFields,
  type StorefrontProfileRow,
} from '../repositories/storefront-profiles.repository.js';
import { validateProfileTextFields } from '../utils/storefront-validation.js';

// ---------------------------------------------------------------------------
// V8-D5 — Branding boutique : logo / bannière / description publique /
// adresse de collecte (INTERNE). 1:1 avec le vendeur.
//
// Règles :
//  - V8.4 : AUCUN usage branding (PUT/POST/DELETE logo/bannière/description/
//    adresse) sans abonnement ACTIVE et non expiré. Le garde-fou est partagé
//    par les 3 mutations (voir `assertActiveStorefrontSubscription`).
//  - CA-V8-045 amendé en V8.4 : l'édition n'est plus possible dès PENDING —
//    elle exige ACTIVE non expiré ; rendu public identiquement conditionné ;
//  - `collecte_address` : écrite par le propriétaire, JAMAIS renvoyée par
//    l'API (booléen `collecteAddressSet` uniquement), jamais dans la réponse
//    publique, jamais dans un log, jamais dans un e-mail/PDF (CA-V8-044/049/075) ;
//  - noms de fichiers = UUID serveur (RG-MEDIA-1) ; MIME réel vérifié par
//    magic bytes, jamais le header client ;
//  - les anciens assets sont supprimés best-effort APRÈS le commit.
// ---------------------------------------------------------------------------

export interface ProfileFiles {
  logo?: Express.Multer.File[];
  banner?: Express.Multer.File[];
}

export interface ProfileTextInput {
  publicDescription?: string;
  collecteAddress?: string;
}

/** Sérialisation PROPRIÉTAIRE — l'adresse de collecte n'est JAMAIS exposée (§14.D clos) : seul un booléen. */
export function serializeProfileOwner(row: StorefrontProfileRow | null): Record<string, unknown> {
  if (!row) {
    return {
      logoUrl: null,
      bannerUrl: null,
      publicDescription: null,
      collecteAddressSet: false,
      updatedAt: null,
    };
  }
  return {
    logoUrl: row.logo_path ? imageUrl(row.logo_path) : null,
    bannerUrl: row.banner_path ? imageUrl(row.banner_path) : null,
    publicDescription: row.public_description,
    collecteAddressSet: row.collecte_address !== null && row.collecte_address.length > 0,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}


async function fileBufferAndMime(
  file: Express.Multer.File | undefined,
  kind: 'logo' | 'banner',
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!file) return null;
  const maxBytes = kind === 'logo' ? MAX_LOGO_BYTES : MAX_BANNER_BYTES;
  if (file.buffer.length > maxBytes) {
    const mb = kind === 'logo' ? 2 : 4;
    throw new AppError(413, 'FILE_TOO_LARGE', `Le ${kind === 'logo' ? 'logo' : 'la bannière'} doit faire au plus ${mb} Mo`);
  }
  const mime = sniffImageMime(file.buffer);
  if (!mime) {
    throw badRequest('INVALID_IMAGE', 'Formats acceptés : JPEG, PNG, WebP');
  }
  return { buffer: file.buffer, mime };
}

/** PUT/POST /api/storefront/profile — upsert branding (transaction unique). */
/**
 * V8.4 — garde-fou unique des mutations branding.
 *
 * Miroir EXACT de `addListingToStorefront` : présence d'au moins une ligne
 * `ACTIVE` dont `ends_at > now()` (horloge DB, pas `Date.now()` applicatif).
 * Un vendeur peut avoir plusieurs lignes (ancien ACTIVE expiré + nouveau
 * ACTIVE valide) : un `ORDER BY ... LIMIT 1` suivi d'un test JS pourrait
 * refuser à tort. Ici la requête borne elle-même la lecture.
 * Message unique, quel que soit le motif (absence / PENDING / EXPIRED /
 * CANCELLED) : aucun statut n'est divulgué.
 */
export async function assertActiveStorefrontSubscription(sellerId: number): Promise<void> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM seller_subscriptions
      WHERE seller_id = $1 AND status = 'ACTIVE' AND ends_at > now()
      LIMIT 1`,
    [sellerId],
  );
  if (!rowCount) {
    throw forbidden(
      'SUBSCRIPTION_REQUIRED',
      'Votre abonnement n’est pas encore activé. Dès validation, tous les usages boutiques seront disponibles.',
    );
  }
}

export async function updateStorefrontProfile(
  sellerId: number,
  input: ProfileTextInput,
  files: ProfileFiles,
): Promise<Record<string, unknown>> {
  await assertActiveStorefrontSubscription(sellerId);

  const text = validateProfileTextFields(input);
  const logo = await fileBufferAndMime(files.logo?.[0], 'logo');
  const banner = await fileBufferAndMime(files.banner?.[0], 'banner');

  const oldPaths: string[] = [];
  // Chemins fraîchement écrits : supprimés si la transaction DB échoue après
  // l'écriture (upload « orphelin » public = fuite bornée sinon).
  const staged: string[] = [];
  const profile = await withTransaction(async (client) => {
    const { rows: currentRows } = await client.query<{ logo_path: string | null; banner_path: string | null }>(
      'SELECT logo_path, banner_path FROM storefront_profiles WHERE seller_id = $1',
      [sellerId],
    );
    const current = currentRows[0];

    const logoPath = logo ? await saveStorefrontAsset(logo.buffer, logo.mime) : undefined;
    const bannerPath = banner ? await saveStorefrontAsset(banner.buffer, banner.mime) : undefined;
    if (logoPath !== undefined) staged.push(logoPath);
    if (bannerPath !== undefined) staged.push(bannerPath);
    if (logoPath !== undefined && current?.logo_path) oldPaths.push(current.logo_path);
    if (bannerPath !== undefined && current?.banner_path) oldPaths.push(current.banner_path);

    return upsertProfileFields(client, sellerId, {
      ...(logoPath !== undefined ? { logoPath } : {}),
      ...(bannerPath !== undefined ? { bannerPath } : {}),
      ...(text.publicDescription !== undefined ? { publicDescription: text.publicDescription } : {}),
      ...(text.collecteAddress !== undefined ? { collecteAddress: text.collecteAddress } : {}),
    });
  }).catch(async (err) => {
    // Compensation best-effort : uploads jetés si la transaction avorte.
    const toDelete = [...staged];
    await Promise.all(toDelete.map((p) => deleteStorefrontAsset(p).catch(() => undefined)));
    throw err;
  });

  if (oldPaths.length > 0) {
    const paths = [...oldPaths];
    afterCommit(async () => {
      await Promise.all(paths.map((p) => deleteStorefrontAsset(p)));
    });
  }
  return { profile: serializeProfileOwner(profile) };
}

/** DELETE /api/storefront/profile/logo — retire le logo (ligne conservée). */
export async function deleteStorefrontLogo(sellerId: number): Promise<{ ok: true }> {
  // V8.4 : suppression d'asset = usage de l'abonnement, donc verrouillée aussi
  // (un PENDING/EXPIRED pouvait supprimer les assets conservés d'une boutique).
  await assertActiveStorefrontSubscription(sellerId);
  const previous = await clearAsset(sellerId, 'logo');
  if (previous) afterCommit(() => deleteStorefrontAsset(previous));
  return { ok: true };
}

/** DELETE /api/storefront/profile/banner — retire la bannière (ligne conservée). */
export async function deleteStorefrontBanner(sellerId: number): Promise<{ ok: true }> {
  await assertActiveStorefrontSubscription(sellerId);
  const previous = await clearAsset(sellerId, 'banner');
  if (previous) afterCommit(() => deleteStorefrontAsset(previous));
  return { ok: true };
}

async function clearAsset(sellerId: number, kind: 'logo' | 'banner'): Promise<string | null> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ logo_path: string | null; banner_path: string | null }>(
      'SELECT logo_path, banner_path FROM storefront_profiles WHERE seller_id = $1 FOR UPDATE',
      [sellerId],
    );
    const row = rows[0];
    const previous = kind === 'logo' ? row?.logo_path ?? null : row?.banner_path ?? null;
    if (!row) return null; // aucun profil : idempotent, rien à retirer
    await upsertProfileFields(client, sellerId, kind === 'logo' ? { clearLogo: true } : { clearBanner: true });
    return previous;
  });
}

/** GET /api/storefront/profile — propriétaire uniquement (jamais publique). */
export async function getStorefrontProfile(sellerId: number): Promise<Record<string, unknown>> {
  const profile = await selectProfileForOwner(sellerId);
  // Badge dérivé en lecture — utile au front (onglet « Statistiques » etc.).
  const badge = await storeBadge(sellerId).catch(() => null);
  return { profile: { ...serializeProfileOwner(profile), sellerBadge: badge } };
}
