import { Ico } from '../brand/Ico'
import { SELLER_BADGES, normalizeSellerBadge, type SellerBadgeKind } from '../../lib/sellerBadge'

/**
 * Badge de palier V8 (`sellerBadge` API — CA-V8-020/023/027).
 *
 * · `pro` (« Boutique Pro », or/champagne) · `verifiee` (« Boutique Vérifiée »,
 *   accent bordeaux + coche) · `boutique` (« Boutique », neutre) ;
 * · **jamais** rendu si `badge` est null/undefined/inconnu (CA-V8-025) ;
 * · libellé TEXTUEL toujours visible : l'information ne repose pas sur la
 *   couleur seule (WCAG 1.4.1) ; `aria-label` complet (CA-V8-027) ;
 * · aucune couleur hors tokens (`--champagne-*`, `--accent-*`, neutres
 *   existants) — ground `.badge-boutique` dans `styles/bureau.css`.
 */
export function SellerBadge({ badge, className }: { badge: SellerBadgeKind | null | undefined; className?: string }) {
  const kind = normalizeSellerBadge(badge)
  if (!kind) return null
  const spec = SELLER_BADGES[kind]
  return (
    <span
      className={`badge-boutique badge-boutique--${kind}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={spec.ariaLabel}
      title={spec.ariaLabel}
    >
      <Ico name={spec.icon} cls="sm" />
      {spec.label}
    </span>
  )
}
