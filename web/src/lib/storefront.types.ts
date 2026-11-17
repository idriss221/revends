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

/** §7.2 `GET /api/subscriptions/me` — sans abonnement : `subscription: null`. */
export interface MySubscriptionResponse {
  subscription: Subscription | null
  usage: SubscriptionUsage | null
  listings: StorefrontListingView[]
  plans: SubscriptionPlan[]
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

/** §6.4 `StorefrontPublic` (boutique publique). */
export interface StorefrontItemPublic {
  id: number
  name: string
  price: number
  primaryPhotoUrl: string | null
  effectiveStatus: 'PENDING' | 'AVAILABLE' | 'RESERVED'
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
