/**
 * Types V7 — « Hébergement des vendeurs » (docs/api-v7-hebergement-vendeurs.md
 * v2.7, §6). camelCase dans le JSON, enums en UPPER_SNAKE_CASE, FCFA entiers.
 * Aucune édition de `lib/types.ts` (additif only).
 */

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED'

/** §6.1 `SubscriptionPlan` — prix/quotas reçus de l'API, jamais codés en dur. */
export interface SubscriptionPlan {
  id: number
  name: string
  priceFcfa: number
  quota: number
  durationDays: number
}

/** §6.2 `Subscription` (vue propriétaire). */
export interface Subscription {
  id: number
  status: SubscriptionStatus
  slug: string
  plan: SubscriptionPlan
  supersedesId: number | null
  startedAt: string | null
  endsAt: string | null
  daysRemaining: number
  activatedBy: number | null
  activatedAt: string | null
  createdAt: string
  /** Présent en EXPIRED uniquement — message affichable tel quel (CA-V7-016). */
  message?: string
}

export interface SubscriptionUsage {
  used: number
  quota: number
  remaining: number
}

/** §6.3 `ListingView` (espace abonné). */
export interface StorefrontListingView {
  id: number
  productId: number
  title: string
  price: number
  effectiveStatus: 'PENDING' | 'AVAILABLE' | 'RESERVED'
  createdAt: string
}

/** §7.2 `GET /api/subscriptions/me` — sans abonnement : `subscription: null`. Extension V8/E4 : `profile{collecteAddressSet}`. */
export interface MySubscriptionResponse {
  subscription: Subscription | null
  usage: SubscriptionUsage | null
  listings: StorefrontListingView[]
  plans: SubscriptionPlan[]
  /** E4 (v2.8) — bloc profil propriétaire : booléen `collecteAddressSet` UNIQUEMENT (jamais la valeur). */
  profile?: StorefrontProfileSummary | null
}

export interface SubscribeResponse {
  subscription: {
    id: number
    planId?: number
    slug: string
    status: 'PENDING'
    supersedesId: number | null
    createdAt: string
  }
}

/** §6.4 `StorefrontPublic` (boutique publique) — extension V8/E2 additive (champs absents si hors ACTIVE). */
export interface StorefrontItemPublic {
  id: number
  name: string
  price: number
  primaryPhotoUrl: string | null
  effectiveStatus: 'PENDING' | 'AVAILABLE' | 'RESERVED'
  /** E5 (v2.8) — badge palier dérivé côté serveur ; null ailleurs. */
  sellerBadge?: SellerBadgeKind | null
}

export interface StorefrontPublicResponse {
  storefront: {
    slug: string
    displayName: string
    /**
     * Année d'inscription du vendeur (`memberSince`, exposée depuis le fix
     * 17/11/2026). Aucune autre donnée personnelle n'est renvoyée.
     */
    memberSince: number
    /** E2 (v2.8) — présents uniquement si abonnement ACTIVE + profil présent. */
    logoUrl?: string
    bannerUrl?: string
    publicDescription?: string
  }
  items: StorefrontItemPublic[]
  page: number
  perPage: number
  total: number
  totalPages: number
}

/** §6.5 `SubscriptionAdminItem` (file admin). */
export interface SubscriptionAdminItem {
  id: number
  sellerId: number
  sellerDisplayName: string
  planName: string
  priceFcfa: number
  quota: number
  slug: string
  status: SubscriptionStatus
  createdAt: string
  activatedAt: string | null
  /** `users.id` de l'admin ayant activé — jamais un nom (contrat §6.5). */
  activatedBy: number | null
  /** E3 (v2.8) — `wave | orange_money | virement | null` (legacy = référence NULL, activable — CA-V8-053). */
  paymentMethod?: 'wave' | 'orange_money' | 'virement' | null
  /** E3 (v2.8) — référence du paiement, JAMAIS publique : à masquer en UI via `safeReference()`. */
  paymentReference?: string | null
  /** E3 (v2.8) — INTERNE : visible UNIQUEMENT ici (file admin). Jamais publique. */
  collecteAddress?: string | null
}

export interface SubscriptionAdminListResponse {
  items: SubscriptionAdminItem[]
  page: number
  perPage: number
  total: number
  totalPages: number
}

/** §7.8 — `POST /api/admin/subscriptions/:id/activate`. */
export interface ActivateSubscriptionResponse {
  subscription: {
    id: number
    status: 'ACTIVE'
    slug: string
    startedAt: string
    endsAt: string
    activatedBy: number
    activatedAt: string
  }
}

/** §7.3 — `POST /api/storefront/listings`. */
export interface AddListingResponse {
  listing: {
    id: number
    productId: number
    createdAt: string
  }
}

/* ====================================================================
   V8 — « Hébergement Boutique » (docs/api.md v2.8, §3.10 + §6)
   Champs ADDITIFS uniquement — aucun champ V7 renommé ou retypé.
   ==================================================================== */

/** Badge de palier sérialisé par l'API (E5) — libellés FR côté front (`lib/sellerBadge.ts`). */
export type SellerBadgeKind = 'pro' | 'verifiee' | 'boutique'

/** Bloc `profile` E4 de `GET /api/subscriptions/me` (lecture propriétaire). Jamais la valeur de l'adresse. */
export interface StorefrontProfileSummary {
  logoUrl: string | null
  bannerUrl: string | null
  publicDescription: string | null
  /** true si une adresse de collecte existe — la valeur n'est JAMAIS renvoyée ici. */
  collecteAddressSet: boolean
}

/** `GET /api/storefront/profile` — vue propriétaire (R1c). `collecteAddress` = valeur réelle (propriétaire uniquement). */
export interface StorefrontProfileOwner {
  logoUrl: string | null
  bannerUrl: string | null
  publicDescription: string | null
  /** Adresse de collecte (INTERNE) — visible du propriétaire ; JAMAIS publique. */
  collecteAddress: string | null
  collecteAddressSet: boolean
  updatedAt: string | null
  /** Badge de palier dérivé (présent à la lecture propriétaire). */
  sellerBadge?: SellerBadgeKind | null
}

export interface StorefrontProfileResponse {
  profile: StorefrontProfileOwner
}

/** `PUT /api/storefront/profile` (multipart) et `POST /api/storefront/profile` (JSON sans fichiers) — même réponse. */
export type SaveStorefrontProfileResponse = StorefrontProfileResponse

/** R4 — `GET /api/subscriptions/me/stats` (requireAuth, périmètre session). */
export interface StatsSubscriptionBlock {
  id: number | null
  status: string | null
  plan: { name: string; quota: number } | null
  endsAt: string | null
  daysRemaining: number
}

export interface StatsCurrentWindow {
  windowDays: number
  viewsTotal: number
  salesCount: number
  revenueFcfa: number
  netRevenueFcfa: number
  commissionFcfa: number
  avgBasketFcfa: number | null
  bestProduct: { id: number; name: string; sales: number } | null
  /** ventes / vues ; null si 0 vue → afficher « — » */
  conversionRate: number | null
}

export interface StatsReportEntry {
  period: string
  views: number
  viewsLabel: 'vues du mois' | 'vues cumulées (1er relevé)'
  salesCount: number
  revenueFcfa: number
  netRevenueFcfa: number
  commissionFcfa: number
  avgBasketFcfa: number | null
  bestProduct: { id: number; name: string; sales: number } | null
  conversionRate: number | null
  emailStatus: 'SENT' | 'FAILED'
  sentAt: string | null
}

export interface MyStatsResponse {
  subscription: StatsSubscriptionBlock | null
  current: StatsCurrentWindow
  latestReport: StatsReportEntry | null
  history: StatsReportEntry[]
  isFirstReport: boolean
}

/** Corps E1 — `POST /api/subscriptions` (référence de paiement obligatoire côté front). */
export interface SubscribeWithPaymentBody {
  planId: number
  slug: string
  supersedesId?: number
  paymentMethod: 'wave' | 'orange_money' | 'virement'
  paymentReference: string
}
