import { Modal } from '../ui/Modal'
import { StatusBadge } from '../ui/StatusBadge'
import { Ico } from '../brand/Ico'
import { ResilientImg } from '../ui/ResilientImg'
import { resolveImageUrl } from '../../lib/catalogPhotos'
import { Link } from 'react-router'
import { fmt } from '../site/SiteBits'
import { productStatusBadge } from '../../lib/constants'
import type { OwnerProduct } from '../../lib/types'

/**
 * Panneau « + Ajouter une annonce » (design §3.6) — sélection d’un produit
 * éligible du vendeur. Source : `GET /api/me/products` (déjà chargé par la
 * page, aucun nouvel endpoint) ; éligibles = statuts PENDING|AVAILABLE|
 * RESERVED et pas déjà listés (SOLD/REJECTED exclus, la borne quota est
 * serveur). Préview « n places après ajout » si > 0.
 */
export function AddListingSheet({
  open,
  onClose,
  products,
  remainingAfterAdd,
  pendingId,
  onPick,
}: {
  open: boolean
  onClose: () => void
  /** Éligibles uniquement (la page filtre) */
  products: OwnerProduct[]
  /** Places restantes APRÈS un ajout (quota - used - 1), idéalement ≥ 0 */
  remainingAfterAdd: number
  /** productId en cours d’ajout (mutation) */
  pendingId: number | null
  onPick: (product: OwnerProduct) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Ajouter à votre boutique" size="md">
      {products.length === 0 ? (
        <div className="rv-shop-addbox" role="status">
          <p className="rv-shop-sub" style={{ margin: 0 }}>
            Tous vos articles éligibles sont déjà dans votre boutique — ou aucun n’est en ligne pour le moment.
          </p>
          <Link className="btn ghost sm" to="/vendre" onClick={onClose}>
            <Ico name="plus-circle" cls="sm" />
            Publier un article
          </Link>
        </div>
      ) : (
        <>
          <p className="rv-shop-sub">Choisissez un article :</p>
          <ul className="rv-shop-listings" aria-label="Vos articles éligibles">
            {products.map((p) => {
              const image = p.images[0]?.url ? resolveImageUrl(p.images[0].url) : null
              const badge = productStatusBadge(p.status)
              return (
                <li key={p.id} className="rv-shop-listing">
                  {image ? (
                    <ResilientImg src={image} alt={p.name} loading="lazy" className="rv-shop-listing-img" />
                  ) : (
                    <span role="img" aria-label={`Photo indisponible pour « ${p.name} »`} className="rv-shop-listing-img rv-shop-listing-img--empty">
                      <Ico name="image" cls="sm" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="rv-shop-listing-title">{p.name}</span>
                    <span className="rv-shop-listing-meta">
                      <span>{fmt(p.price)}</span>
                      {badge ? <StatusBadge kind={badge.kind} label={badge.label} /> : null}
                    </span>
                  </span>
                  <span className="rv-shop-listing-actions">
                    <button
                      type="button"
                      className="btn terra sm"
                      disabled={pendingId !== null}
                      aria-busy={pendingId === p.id}
                      onClick={() => onPick(p)}
                      aria-label={`Ajouter « ${p.name} » à votre boutique`}
                    >
                      {pendingId === p.id ? '…' : 'Ajouter'}
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="rv-shop-recall" aria-live="polite">
            {remainingAfterAdd > 0
              ? `${remainingAfterAdd} place${remainingAfterAdd > 1 ? 's' : ''} sur votre quota après ajout.`
              : 'Votre boutique sera complète après ajout.'}
          </p>
        </>
      )}
    </Modal>
  )
}
