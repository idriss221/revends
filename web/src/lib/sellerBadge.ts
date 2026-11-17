/**
 * Badges de palier V8 — dérivés côté serveur en lecture (JAMAIS stockés),
 * sérialisés en `sellerBadge` (« pro » | « verifiee » | « boutique » | null).
 *
 * CA-V8-026 : les libellés FR n'apparaissent QUE dans ce module (et ses
 * tests) — jamais codés en dur ailleurs dans le front. Le composant
 * `components/storefront/SellerBadge.tsx` ne fait que rendre ces valeurs.
 */

/** Valeurs contractuelles du champ additif `sellerBadge` (contrat v2.8, E5). */
export type SellerBadgeKind = 'pro' | 'verifiee' | 'boutique'

export interface SellerBadgeSpec {
  /** Libellé FR exact — CA-V8-020. */
  label: string
  /** Palier d'abonnement correspondant (pour l'aria-label complet — CA-V8-027). */
  tier: 'Atelier' | 'Boutique' | 'Découverte'
  /** Nom du picto Ico (sprite existant). */
  icon: 'star' | 'circle-check' | 'store'
  /** Libellé accessible complet : « Vendeur Atelier — boutique Boutique Pro ». */
  ariaLabel: string
}

export const SELLER_BADGES: Record<SellerBadgeKind, SellerBadgeSpec> = {
  boutique: {
    label: 'Boutique',
    tier: 'Découverte',
    icon: 'store',
    ariaLabel: 'Vendeur Découverte — boutique Boutique',
  },
  verifiee: {
    label: 'Boutique Vérifiée',
    tier: 'Boutique',
    icon: 'circle-check',
    ariaLabel: 'Vendeur Boutique — boutique Boutique Vérifiée',
  },
  pro: {
    label: 'Boutique Pro',
    tier: 'Atelier',
    icon: 'star',
    ariaLabel: 'Vendeur Atelier — boutique Boutique Pro',
  },
}

/** Normalise la valeur API (inconnue/absente ⇒ null — jamais de badge fantôme). */
export function normalizeSellerBadge(value: unknown): SellerBadgeKind | null {
  return value === 'pro' || value === 'verifiee' || value === 'boutique' ? value : null
}
