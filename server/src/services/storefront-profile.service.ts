import type { Express } from 'express';
import { withTransaction, afterCommit } from '../utils/db.js';
import { AppError, badRequest } from '../utils/errors.js';
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
//  - édition possible DÈS PENDING (préparation) ; rendu public seulement si
//    l'abonnement est ACTIVE (CA-V8-045) — appliqué dans getPublicStorefront ;
//  - `collecte_address` : visible UNIQUEMENT du propriétaire (GET/POST/PUT
//    /api/storefront/profile) et de l'admin (file /api/admin/subscriptions).
//    JAMAIS dans la réponse publique, jamais dans un log, jamais dans un
//    e-mail/PDF (CA-V8-044/049/075) — DEFIANCE consignée (§14.D assouplie
//    par la consigne produit : « visible propriétaire/admin ») ;
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
export async function updateStorefrontProfile(
  sellerId: number,
  input: ProfileTextInput,
  files: ProfileFiles,
): Promise<Record<string, unknown>> {
  const text = validateProfileTextFields(input);
  const logo = await fileBufferAndMime(files.logo?.[0], 'logo');
  const banner = await fileBufferAndMime(files.banner?.[0], 'banner');

  const oldPaths: string[] = [];
  const profile = await withTransaction(async (client) => {
    const { rows: currentRows } = await client.query<{ logo_path: string | null; banner_path: string | null }>(
      'SELECT logo_path, banner_path FROM storefront_profiles WHERE seller_id = $1',
      [sellerId],
    );
    const current = currentRows[0];

    const logoPath = logo ? await saveStorefrontAsset(logo.buffer, logo.mime) : undefined;
    const bannerPath = banner ? await saveStorefrontAsset(banner.buffer, banner.mime) : undefined;
    if (logoPath !== undefined && current?.logo_path) oldPaths.push(current.logo_path);
    if (bannerPath !== undefined && current?.banner_path) oldPaths.push(current.banner_path);

    return upsertProfileFields(client, sellerId, {
      ...(logoPath !== undefined ? { logoPath } : {}),
      ...(bannerPath !== undefined ? { bannerPath } : {}),
      ...(text.publicDescription !== undefined ? { publicDescription: text.publicDescription } : {}),
      ...(text.collecteAddress !== undefined ? { collecteAddress: text.collecteAddress } : {}),
    });
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
  const previous = await clearAsset(sellerId, 'logo');
  if (previous) afterCommit(() => deleteStorefrontAsset(previous));
  return { ok: true };
}

/** DELETE /api/storefront/profile/banner — retire la bannière (ligne conservée). */
export async function deleteStorefrontBanner(sellerId: number): Promise<{ ok: true }> {
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
