import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ResilientImg } from '../ui/ResilientImg'
import { StatusBadge } from '../ui/StatusBadge'
import { Ico } from '../brand/Ico'
import { fmt } from '../site/SiteBits'
import { formatFrShortDate } from '../../lib/storefront'
import type { StorefrontListingView } from '../../lib/storefront.types'
import type { StatusBadgeKind } from '../../lib/constants'

/**
 * « Mes annonces de boutique » (design §3.3).
 *
 * Retrait **à deux temps, inline** : le bouton devient « Confirmer le
 * retrait ? » + « Annuler » (3 s d’armement, `Échap` désarme) — jamais une
 * modale pour une action réversible. Le focus reste sur la ligne.
 *
 * `imageFor` : la vue abonné (`GET /api/subscriptions/me`) n’expose PAS de
 * photo ; la page résout la vignette via `GET /api/me/products` (déjà
 * chargée pour le sélecteur d’ajout) — aucune seconde source, aucun 404
 * inventé ; sans correspondance, pictogramme neutre (ResilientImg).
 */
const LISTING_BADGE: Record<StorefrontListingView['effectiveStatus'], { kind: StatusBadgeKind; label: string }> = {
  AVAILABLE: { kind: 'approved', label: 'Disponible' },
  RESERVED: { kind: 'reserved', label: 'Réservé' },
  PENDING: { kind: 'pending', label: 'En attente' },
}

const ARM_MS = 3000

function WithdrawButton({
  listing,
  busy,
  onWithdraw,
}: {
  listing: StorefrontListingView
  busy: boolean
  onWithdraw: (id: number, title: string) => void
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<number | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const disarm = () => {
    setArmed(false)
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  const arm = () => {
    setArmed(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setArmed(false), ARM_MS)
  }

  // `Échap` désarme, le focus va sur « Confirmer », aucun minuteur ne survit.
  useEffect(() => {
    if (!armed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') disarm()
    }
    document.addEventListener('keydown', onKey)
    confirmRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed])

  if (!armed) {
    return (
      <button
        type="button"
        className="btn quiet sm"
        onClick={arm}
        aria-label={`Retirer « ${listing.title} » de la boutique`}
      >
        <Ico name="trash" cls="sm" />
        Retirer
      </button>
    )
  }

  return (
    <span className="rv-shop-confirm" role="group" aria-label={`Confirmer le retrait de « ${listing.title} »`}>
      <button
        ref={confirmRef}
        type="button"
        className="btn quiet sm"
        disabled={busy}
        aria-busy={busy}
        onClick={() => {
          disarm()
          onWithdraw(listing.id, listing.title)
        }}
      >
        Confirmer le retrait ?
      </button>
      <button type="button" className="btn quiet sm" onClick={disarm}>
        Annuler
      </button>
    </span>
  )
}

export function ListingManager({
  listings,
  busyId,
  onWithdraw,
  imageFor,
  badgeOverride,
}: {
  listings: StorefrontListingView[]
  /** id en cours de retrait (mutation) — boutons en `aria-busy` */
  busyId: number | null
  onWithdraw: (id: number, title: string) => void
  /** Vignette du produit, `null` si inconnue — jamais d’URL fabriquée */
  imageFor: (productId: number) => string | null
  /** Remplace TOUS les badges de statut (ex. « Conservée » en EXPIRED) */
  badgeOverride?: { kind: StatusBadgeKind; label: string }
}) {
  return (
    <div>
      <ul className="rv-shop-listings" aria-label="Annonces dans votre boutique">
        {listings.map((listing) => {
          const badge = badgeOverride ?? LISTING_BADGE[listing.effectiveStatus]
          const image = imageFor(listing.productId)
          return (
            <li key={listing.id} className="rv-shop-listing">
              {image ? (
                <ResilientImg
                  src={image}
                  alt={listing.title}
                  loading="lazy"
                  className="rv-shop-listing-img"
                />
              ) : (
                <span
                  role="img"
                  aria-label={`Photo indisponible pour « ${listing.title} »`}
                  className="rv-shop-listing-img rv-shop-listing-img--empty"
                >
                  <Ico name="image" cls="sm" />
                </span>
              )}
              <span className="min-w-0">
                <Link to={`/catalogue/${listing.productId}`} className="rv-shop-listing-title">
                  {listing.title}
                </Link>
                <span className="rv-shop-listing-meta">
                  <span>{fmt(listing.price)}</span>
                  <StatusBadge kind={badge.kind} label={badge.label} />
                  <span>Ajoutée le {formatFrShortDate(listing.createdAt)}</span>
                </span>
              </span>
              <span className="rv-shop-listing-actions">
                <WithdrawButton listing={listing} busy={busyId === listing.id} onWithdraw={onWithdraw} />
              </span>
            </li>
          )
        })}
      </ul>
      <p className="rv-shop-recall">Retirer ne supprime ni l’article, ni vos commandes — il libère une place de boutique.</p>
    </div>
  )
}
