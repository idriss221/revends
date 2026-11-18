/**
 * Client V7 — « Hébergement des vendeurs » (contrat v2.7, 8 routes).
 *
 * Réutilise l'intercepteur `request` de `lib/api.ts` (CSRF double soumission,
 * credentials include, timeout, `ApiError`) — aucune duplication de la logique
 * réseau, aucun chemin hors contrat. Erreurs : traduites ici en messages
 * français actionnables (table §3.8 du document de design) ; `friendlyError`
 * sert de repli pour les cas non V7.
 */
import { ApiError } from './apiClient'
import { request } from './api'
import { friendlyError } from './errors'
import type {
  ActivateSubscriptionResponse,
  AddListingResponse,
  MyStatsResponse,
  MySubscriptionResponse,
  StorefrontProfileResponse,
  StorefrontPublicResponse,
  SubscribeResponse,
  SubscribeWithPaymentBody,
  SubscriptionAdminListResponse,
  SubscriptionCtlResponse,
  SubscriptionStatus,
} from './storefront.types'

/* ------------------------------------------------------------------ */
/* Appels (chemins relatifs à l'origine, camelCase)                    */
/* ------------------------------------------------------------------ */

export const storefrontApi = {
  /** GET /api/storefront/:slug — publique (aucune session requise). */
  getPublic(slug: string, params: { page?: number; perPage?: number } = {}): Promise<StorefrontPublicResponse> {
    const sp = new URLSearchParams()
    sp.set('page', String(params.page ?? 1))
    sp.set('per_page', String(params.perPage ?? 12))
    return request<StorefrontPublicResponse>(`/api/storefront/${encodeURIComponent(slug)}?${sp.toString()}`)
  },

  /** POST /api/storefront/:slug/contact — boutique-scopé, 10 messages / 10 min. */
  contact(slug: string, body: { message: string; email?: string }): Promise<{ ok: true; notificationId: number }> {
    return request<{ ok: true; notificationId: number }>(
      `/api/storefront/${encodeURIComponent(slug)}/contact`,
      { method: 'POST', body: JSON.stringify(body) },
    )
  },

  /** GET /api/subscriptions/me — espace abonné (matérialise l'expiration en lecture). */
  mySubscription(): Promise<MySubscriptionResponse> {
    return request<MySubscriptionResponse>('/api/subscriptions/me')
  },

  /** POST /api/subscriptions — souscription / changement de forfait. V8 : référence de paiement OBLIGATOIRE (E1). */
  subscribe(body: SubscribeWithPaymentBody): Promise<SubscribeResponse> {
    return request<SubscribeResponse>('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /* ---------------- V8 — branding (R1/R2/R3, contrat v2.8 §3.10) ---------------- */

  /**
   * PUT /api/storefront/profile — écriture branding en multipart.
   * Champs : logo? (≤ 2 Mo), banner? (≤ 4 Mo), publicDescription?, collecteAddress?
   * (chaîne vide = effacement, omise = inchangée). Le serveur arbitre (magic
   * bytes, tailles) — le client n'est qu'un indice.
   */
  saveProfile(formData: FormData): Promise<StorefrontProfileResponse> {
    return request<StorefrontProfileResponse>('/api/storefront/profile', {
      method: 'PUT',
      body: formData,
    })
  },

  /** DELETE /api/storefront/profile/logo — retire le logo (octets supprimés côté serveur, best-effort). */
  deleteLogo(): Promise<{ ok: true }> {
    return request<{ ok: true }>('/api/storefront/profile/logo', { method: 'DELETE' })
  },

  /** DELETE /api/storefront/profile/banner — retire la bannière. */
  deleteBanner(): Promise<{ ok: true }> {
    return request<{ ok: true }>('/api/storefront/profile/banner', { method: 'DELETE' })
  },

  /** GET /api/subscriptions/me/stats — onglet Statistiques (R4). */
  getMyStats(): Promise<MyStatsResponse> {
    return request<MyStatsResponse>('/api/subscriptions/me/stats')
  },

  /** POST /api/storefront/listings — ajout d'une annonce (seul point de contrôle du quota). */
  addListing(productId: number): Promise<AddListingResponse> {
    return request<AddListingResponse>('/api/storefront/listings', {
      method: 'POST',
      body: JSON.stringify({ productId }),
    })
  },

  /** DELETE /api/storefront/listings/:id — retrait boutique-scopé (idempotent). */
  withdrawListing(listingId: number): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/storefront/listings/${encodeURIComponent(String(listingId))}`, {
      method: 'DELETE',
    })
  },

  /** GET /api/admin/subscriptions — file admin (défaut PENDING). */
  adminList(
    params: { status?: SubscriptionStatus; page?: number; perPage?: number } = {},
  ): Promise<SubscriptionAdminListResponse> {
    const sp = new URLSearchParams()
    if (params.status) sp.set('status', params.status)
    sp.set('page', String(params.page ?? 1))
    sp.set('per_page', String(params.perPage ?? 12))
    return request<SubscriptionAdminListResponse>(`/api/admin/subscriptions?${sp.toString()}`)
  },

  /** POST /api/admin/subscriptions/:id/activate — admin uniquement. Corps `{}`. */
  adminActivate(id: number): Promise<ActivateSubscriptionResponse> {
    return request<ActivateSubscriptionResponse>(
      `/api/admin/subscriptions/${encodeURIComponent(String(id))}/activate`,
      { method: 'POST', body: JSON.stringify({}) },
    )
  },

  /* ---------------- V8.1 — « Contrôle boutique » (gouvernance admin) ---------------- */

  /**
   * POST /api/admin/subscriptions/:id/deactivate — ACTIVE → CANCELLED (réversible).
   * Réponse 200 (`merchantActive: false`) ; 404 si la souscription n'existe pas ou n'est pas ACTIVE.
   * Corps `{}` — jamais de statut/seller_id côté client.
   */
  adminDeactivate(id: number): Promise<SubscriptionCtlResponse> {
    return request<SubscriptionCtlResponse>(
      `/api/admin/subscriptions/${encodeURIComponent(String(id))}/deactivate`,
      { method: 'POST', body: JSON.stringify({}) },
    )
  },

  /**
   * POST /api/admin/subscriptions/:id/delete — DÉFINITIF (CANCELLED + articles
   * soft-deleted + listings supprimés). Tout statut accepté ; 404 si inexistante.
   */
  adminDelete(id: number): Promise<SubscriptionCtlResponse> {
    return request<SubscriptionCtlResponse>(
      `/api/admin/subscriptions/${encodeURIComponent(String(id))}/delete`,
      { method: 'POST', body: JSON.stringify({}) },
    )
  },
}

/* ------------------------------------------------------------------ */
/* Messages humains — table §3.8 du design (codes jamais affichés)      */
/* ------------------------------------------------------------------ */

/** Messages d'erreur V7 exacts, tels que rédigés pour l'utilisateur. */
const V7_MESSAGES: Record<string, string> = {
  STOREFRONT_QUOTA_EXCEEDED:
    'Quota de votre forfait atteint. Retirez une annonce de votre boutique ou changez de forfait.',
  SUBSCRIPTION_REQUIRED:
    "Cette action demande une boutique active — votre abonnement est en attente d'activation ou a expiré.",
  SLUG_TAKEN: 'Cette adresse est déjà prise. Essayez une variante — par exemple mode-dakar-shop.',
  SLUG_RESERVED: 'Cette adresse est réservée par ReVendsen. Choisissez-en une autre.',
  SUBSCRIPTION_ALREADY_ACTIVE:
    'Vous avez déjà une boutique active. Un seul abonnement à la fois — retirez le précédent avant d’en demander un autre.',
  STOREFRONT_ALREADY_LISTED: 'Cet article est déjà dans votre boutique.',
  NOT_PRODUCT_OWNER: 'Cet article ne vous appartient pas — seuls vos articles peuvent rejoindre votre boutique.',
  CONTACT_SELF: 'Vous êtes le vendeur de cette boutique — ce formulaire sert aux visiteurs.',
  PLAN_NOT_FOUND: "Ce forfait n'est plus proposé. Rechargez la page et réessayez.",
  PRODUCT_NOT_FOUND: 'Article introuvable.',
  INVALID_SUPERSEDES: "Votre abonnement n'est pas actif : seul un abonnement actif peut être remplacé.",
  INVALID_STATUS: "Cette demande n'est pas en attente d'activation.",
  RATE_LIMITED: 'Trop de messages envoyés. Réessayez dans quelques minutes.',
  NOT_FOUND: 'Cette boutique n’est plus ouverte. Aucun message n’a été envoyé.',
  FORBIDDEN: 'Cette action est impossible avec ce compte.',
  UNAUTHENTICATED: 'Votre session a expiré. Reconnectez-vous.',
  NETWORK_ERROR: 'La connexion a échoué. Rien n’a été envoyé — vérifiez votre réseau et réessayez.',
  /* V8 (contrat v2.8 §3.10) */
  PAYMENT_REFERENCE_REQUIRED: 'Indiquez la référence de votre paiement (Wave, Orange Money ou virement).',
  INVALID_PAYMENT_METHOD: 'Choisissez votre mode de paiement : Wave, Orange Money ou virement bancaire.',
  INVALID_PAYMENT_REFERENCE:
    'Référence invalide — lettres, chiffres, espaces, tirets, points, slashes ou « _ » (4 à 64 caractères).',
  INVALID_IMAGE: 'Formats acceptés : JPEG, PNG ou WebP — le fichier envoyé n’est pas une image lisible.',
  FILE_TOO_LARGE: 'Fichier trop lourd — le logo fait au plus 2 Mo, la bannière au plus 4 Mo.',
}

/**
 * Traduit une erreur V7 en message français affichable.
 *
 * Règles : les `details` de validation (rédigés pour l'utilisateur) priment ;
 * le message serveur est d'abord interrogé pour les codes V7 connus (le 409
 * quota embarque la paire exacte `used/quota` du forfait — le conserver est
 * un EXIGENCE, pas un choix) ; sinon table ci-dessus ; sinon `friendlyError`.
 */
export function storefrontError(error: unknown, fallback = 'Quelque chose n’a pas marché de notre côté. Réessayez dans un instant.'): string {
  if (!(error instanceof ApiError)) return fallback

  // Le 409 quota porte le compte exact « (10/10) » côté serveur : on garde le sien.
  if (error.code === 'STOREFRONT_QUOTA_EXCEEDED' && error.message) {
    return error.message
  }
  // Validation : messages rédigés pour l'humain → les afficher tels quels.
  if (error.code === 'VALIDATION_ERROR' && error.details?.length) {
    return error.details.map((d) => d.message.trim()).filter(Boolean).join('\n')
  }
  const known = V7_MESSAGES[error.code]
  if (known) return known
  return friendlyError(error, fallback)
}

/* ------------------------------------------------------------------ */
/* Téléchargement PDF du bilan — GET /api/subscriptions/me/report     */
/* ------------------------------------------------------------------ */

/**
 * Télécharge le PDF du bilan d'un mois donné (`period` = « YYYY-MM »).
 *
 * ⚠️ ÉCART CONSIGNÉ (v2.8) : ce endpoint n'existe pas encore côté serveur —
 * le contrat v2.8 ne livre le PDF du bilan qu'en pièce jointe de l'e-mail.
 * La fonction est câblée ici telle quelle et dégradera proprement :
 * toute réponse non-2xx lève une `ApiError` (le front affiche un message
 * humain, jamais un code). À faire évoluer côté `@backend` : exposer
 * `GET /api/subscriptions/me/report?period=YYYY-MM` (propriétaire uniquement).
 */
export async function downloadReportPdf(period: string): Promise<void> {
  const res = await fetch(`/api/subscriptions/me/report?period=${encodeURIComponent(period)}`, {
    credentials: 'include',
  })
  if (!res.ok) {
    let code = 'INTERNAL_ERROR'
    let message = 'Le bilan n’a pas pu être téléchargé.'
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } }
      if (body.error?.code) code = body.error.code
      if (body.error?.message) message = body.error.message
    } catch {
      // corps non-JSON (ex. 404 HTML) : on garde le message par défaut
      if (res.status === 404) {
        code = 'NOT_FOUND'
        message = 'Le téléchargement n’est pas encore disponible — le bilan vous est aussi envoyé par e-mail.'
      }
    }
    throw new ApiError(res.status, code, message)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bilan-${period}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ */
/* Formatage — dates longues françaises (aucun timer JS nulle part)     */
/* ------------------------------------------------------------------ */

/** « 17 novembre 2026 » — date en toutes lettres, fuseau UTC (cohérent serveurs). */
export function formatFrLongDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** « 17 novembre 2026 à 10:15 » — pour « Demandé le … ». */
export function formatFrLongDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${date} à ${time}`
}

/** « 17 nov. 2026 » — méta courte. */
export function formatFrShortDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** « 22 mai 2026, 09:41 » — traçabilité admin (activated_at absolu). */
export function formatFrActivation(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${date} à ${time}`
}
