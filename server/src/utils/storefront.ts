import type { NotificationType } from '../repositories/notifications.repository.js';

// ---------------------------------------------------------------------------
// V7 — Hébergement des vendeurs : utilitaires PURS (slug, sérialisation).
// Aucune requête SQL ici : la persistance vit dans services/storefront.service.
// ---------------------------------------------------------------------------

/** Format du slug (CA-V7-022) : minuscules/chiffres séparés par des tirets simples. */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;

/**
 * Mots réservés (20, cahier §4.2 / api-v7 §5.4) — PO-V7-06 ouvert.
 * Liste figée ; ajouter un mot = 1 ligne + test, sans migration.
 */
export const RESERVED_SLUGS: readonly string[] = [
  'admin',
  'api',
  'boutique',
  'catalogue',
  'vendre',
  'mes-articles',
  'mon-abonnement',
  'parrainage',
  'panier',
  'profil',
  'login',
  'register',
  'search',
  'static',
  'assets',
  'health',
  'www',
  'help',
  'contact',
  'legal',
];

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug);
}

/**
 * Normalisation du slug — décision explicite (source de vérité : CA-V7-020/022).
 *
 *   trim → minuscules → chaque caractère d'espacement → « - »
 *
 * ⚠️ PAS de « NFD + suppression des diacritiques » ni de « non-alphanumériques → - »
 * (contrairement à `utils/slugify.ts` et à l'esquisse de l'architecture §2.5 /
 * api-v7 §5.4) : CA-V7-022 exige que `république`, `mode_dakar`, `mode.dakar`,
 * `a/b`, `x--y` soient REJETÉS en 400. Cela n'est possible que si tout caractère
 * hors [a-z0-9-] (ou tout tiret double / en bordure) fait échouer la regex
 * stricte après normalisation. Le cahier étant la source de vérité, la
 * normalisation est limitée à la casse et aux espaces.
 *
 * `Mode Dakar` ≡ `mode-dakar` (CA-V7-020). `Mode  Dakar` → `mode--dakar` → 400.
 */
export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s/g, '-');
}

export function isSlugFormatValid(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN_LENGTH &&
    slug.length <= SLUG_MAX_LENGTH &&
    SLUG_REGEX.test(slug)
  );
}

/**
 * Valeur d'enum notification_type EXISTANTE (DDL 008, V4/N14, conservée en V5 —
 * CA-V5-099), réutilisée telle quelle pour le contact boutique.
 *
 * L'union TypeScript partagée `NotificationType` n'est PAS étendue (décision
 * chef de projet R-V7-A3 clos) : le cast est localisé ici, nulle part ailleurs,
 * et le dépôt existant `insertNotification` est appelé tel quel.
 */
export const STOREFRONT_CONTACT_NOTIFICATION_TYPE = 'product.contact' as unknown as NotificationType;

// ---------------------------------------------------------------------------
// Sérialisation — vues V7 (champs publics uniquement, aucun PII)
// ---------------------------------------------------------------------------

export interface PlanRowLike {
  id: number;
  name: string;
  price_fcfa: number;
  quota: number;
  duration_days: number;
}

export function serializePlan(row: PlanRowLike): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    priceFcfa: row.price_fcfa,
    quota: row.quota,
    durationDays: row.duration_days,
  };
}

export interface StorefrontPublicProfileRow {
  logo_path: string | null;
  banner_path: string | null;
  public_description: string | null;
}

export interface StorefrontPublicView {
  slug: string;
  displayName: string;
  memberSince: number;
  logoUrl?: string;
  bannerUrl?: string;
  publicDescription?: string;
}

/** Vue publique de la boutique : displayName + memberSince UNIQUEMENT (CA-V7-026). Jamais name/email/phone/whatsapp. */
export function serializeStorefrontPublic(
  row: { slug: string; display_name: string; created_at: Date | string },
  profile?: StorefrontPublicProfileRow | null,
): StorefrontPublicView {
  const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  const memberSince = Number.isNaN(createdAt.getTime()) ? new Date().getUTCFullYear() : createdAt.getUTCFullYear();
  const out: StorefrontPublicView = {
    slug: row.slug,
    displayName: row.display_name,
    memberSince,
  };
  // V8 / E2 (contrat v2.8) — champs ADDITIFS présents uniquement si profil
  // fourni (l'appelant ne passe le profil que si l'abonnement est ACTIVE).
  // collecte_address n'entre JAMAIS ici (CA-V8-044/049).
  if (profile?.logo_path) out.logoUrl = imageUrl(profile.logo_path);
  if (profile?.banner_path) out.bannerUrl = imageUrl(profile.banner_path);
  if (profile?.public_description) out.publicDescription = profile.public_description;
  return out;
}

export interface StorefrontItemRow {
  product_id: number;
  name: string;
  price: number;
  status: string;
  primary_photo_path: string | null;
  seller_badge?: 'pro' | 'verifiee' | 'boutique' | null;
}

/** `primaryPhotoUrl` : URL servie sous /uploads (convention v2.6), null si aucune photo. */
export function serializeStorefrontItem(row: StorefrontItemRow): Record<string, unknown> {
  return {
    id: row.product_id,
    name: row.name,
    price: row.price,
    primaryPhotoUrl: row.primary_photo_path ? imageUrl(row.primary_photo_path) : null,
    effectiveStatus: row.status,
    // V8-D3 — champ additif (null si la source ne joint pas le badge).
    sellerBadge: row.seller_badge ?? null,
  };
}

/** Même règle que `utils/serializers.ts` (sans l'éditer) : URL absolue → inchangée, sinon préfixée « / ». */
export function imageUrl(path: string): string {
  if (/^(https?:)?\/\//.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
}
