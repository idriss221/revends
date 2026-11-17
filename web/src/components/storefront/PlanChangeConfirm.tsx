import { Modal } from '../ui/Modal'
import { fmt } from '../site/SiteBits'
import type { SubscriptionPlan } from '../../lib/storefront.types'

/**
 * Confirmation « Changer de forfait » (design §3.7).
 *
 * `role="dialog"`/`aria-modal` via `Modal` existant (piège de focus, Échap,
 * focus rendu au déclencheur) ; prix et quotas = plans reçus de l'API.
 * Aucune double facturation, aucune double ACTIVE : l'ancien forfait reste
 * actif jusqu'à l'activation du nouveau (CA-V7-015).
 */
export function PlanChangeConfirm({
  open,
  current,
  target,
  loading,
  context = 'active',
  onConfirm,
  onCancel,
}: {
  open: boolean
  current: SubscriptionPlan
  target: SubscriptionPlan
  loading: boolean
  /** `active` : changement avec supersedesId (forfait reste actif) · `pending` : nouvelle demande sans supersedesId */
  context?: 'active' | 'pending'
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title="Changer de forfait" size="sm">
      <p className="rv-shop-h2" style={{ fontSize: 20 }}>
        {current.name} → {target.name}
      </p>
      <p className="rv-shop-sub" style={{ marginBottom: 14 }}>
        {fmt(current.priceFcfa)}/mois → {fmt(target.priceFcfa)} / mois
        <br />
        {current.quota} → {target.quota} annonces
      </p>
      <ul className="rv-shop-recap" style={{ borderTop: 0, marginBottom: 18, paddingLeft: 0, listStyle: 'none' }}>
        <li className="rv-shop-recap-row" style={{ gridTemplateColumns: '1fr' }}>
          <span aria-hidden="true">• </span>
          {context === 'active'
            ? 'Votre forfait actuel reste actif jusqu’à l’activation du nouveau.'
            : 'Votre demande actuelle reste en file jusqu’à l’activation d’un forfait.'}
        </li>
        <li className="rv-shop-recap-row" style={{ gridTemplateColumns: '1fr' }}>
          <span aria-hidden="true">• </span>Votre slug et vos annonces sont conservés.
        </li>
        <li className="rv-shop-recap-row" style={{ gridTemplateColumns: '1fr' }}>
          <span aria-hidden="true">• </span>
          Aucune double facturation d’annonces : le quota appliqué sera celui du forfait actif.
        </li>
      </ul>
      <div className="rv-shop-altplans">
        <button type="button" className="btn terra block" onClick={onConfirm} disabled={loading} aria-busy={loading}>
          Confirmer la demande
        </button>
        <button type="button" className="btn ghost block" onClick={onCancel} disabled={loading}>
          Annuler
        </button>
      </div>
    </Modal>
  )
}
