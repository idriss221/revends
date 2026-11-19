import { Link } from 'react-router'
import { StatusBadge } from '../ui/StatusBadge'
import { HeartMark } from '../ui/HeartMark'
import { fmt } from '../site/SiteBits'
import { formatFrLongDate, formatFrLongDateTime } from '../../lib/storefront'
import type { Subscription } from '../../lib/storefront.types'
import type { StatusBadgeKind } from '../../lib/constants'
import { WaveChip } from './WaveCheckoutPanel'

/**
 * Panneau statut (design §3.2 / §3.4) — `aria-live="polite"` : si le statut
 * bascule en cours de session, le lecteur d'écran l'annonce. Aucune barre de
 * progression fictive, aucun « temps estimé », aucun chrono.
 *
 * L’état ACTIVE est rendu par la page elle-même (jauge + annonces + forfaits
 * alternatifs en deux colonnes) : ce composant couvre PENDING / EXPIRED /
 * CANCELLED.
 */
const STATUS_BADGE: Record<'PENDING' | 'EXPIRED' | 'CANCELLED', { kind: StatusBadgeKind; label: string }> = {
  PENDING: { kind: 'pending', label: "En attente d'activation" },
  EXPIRED: { kind: 'neutral', label: 'Expirée' },
  CANCELLED: { kind: 'neutral', label: 'Annulée' },
}

export function SubscriptionStatusPanel({ subscription }: { subscription: Subscription }) {
  // ACTIVE : rendu par la page (jauge + annonces). Ce composant ne couvre que
  // PENDING / EXPIRED / CANCELLED — jamais l’état actif.
  if (subscription.status === 'ACTIVE') return null
  const badge = STATUS_BADGE[subscription.status]
  const planLine = `${subscription.plan.name} — ${fmt(subscription.plan.priceFcfa)} / mois`

  // V9 — variante Wave strictement conditionnelle. Le libellé OM/virement/legacy
  // « En attente d'activation » ci-dessous reste mot pour mot inchangé.
  if (subscription.status === 'PENDING' && subscription.wavePaymentPending === true) {
    return (
      <section className="rv-shop-panel wave-pending-panel" aria-live="polite" aria-labelledby="sub-pending-title">
        <div className="rv-shop-subhead">
          <WaveChip />
          <StatusBadge
            kind="pending"
            dot
            label="Wave — en attente de confirmation du paiement"
            className="wave-status-badge"
          />
          <Link className="rv-shop-shop-link" to="/shop">
            Retour au catalogue
          </Link>
        </div>
        <HeartMark />
        <h1 id="sub-pending-title">Votre boutique est en attente d’activation</h1>
        <p className="rv-shop-sub wave-pending-note">
          Votre paiement Wave est en cours de vérification. Vous pouvez fermer cette page : votre boutique s'ouvrira dès
          que Wave confirmera le paiement.
        </p>
        <dl className="rv-shop-recap">
          <div className="rv-shop-recap-row" data-stagger="0">
            <dt>Forfait</dt>
            <dd>{planLine}</dd>
          </div>
          <div className="rv-shop-recap-row" data-stagger="1">
            <dt>Quotité</dt>
            <dd>{subscription.plan.quota} annonces de boutique</dd>
          </div>
          <div className="rv-shop-recap-row" data-stagger="2">
            <dt>Adresse</dt>
            <dd>boutique/{subscription.slug}</dd>
          </div>
          <div className="rv-shop-recap-row" data-stagger="3">
            <dt>Demandé le</dt>
            <dd>{formatFrLongDateTime(subscription.createdAt)}</dd>
          </div>
        </dl>
      </section>
    )
  }

  if (subscription.status === 'PENDING') {
    return (
      <section className="rv-shop-panel" aria-live="polite" aria-labelledby="sub-pending-title">
        <div className="rv-shop-subhead">
          <StatusBadge kind={badge.kind} label={badge.label} dot />
          <Link className="rv-shop-shop-link" to="/shop">
            Retour au catalogue
          </Link>
        </div>
        <HeartMark />
        <h1 id="sub-pending-title">Votre boutique est en attente d’activation</h1>
        <p className="rv-shop-sub">
          L’administration examine votre demande. Vous pourrez suivre son état ici — rien d’autre à faire.
        </p>
        <dl className="rv-shop-recap">
          <div className="rv-shop-recap-row">
            <dt>Forfait</dt>
            <dd>{planLine}</dd>
          </div>
          <div className="rv-shop-recap-row">
            <dt>Quotité</dt>
            <dd>{subscription.plan.quota} annonces de boutique</dd>
          </div>
          <div className="rv-shop-recap-row">
            <dt>Adresse</dt>
            <dd>boutique/{subscription.slug}</dd>
          </div>
          <div className="rv-shop-recap-row">
            <dt>Demandé le</dt>
            <dd>{formatFrLongDateTime(subscription.createdAt)}</dd>
          </div>
        </dl>
      </section>
    )
  }

  if (subscription.status === 'EXPIRED') {
    return (
      <section className="rv-shop-panel" aria-live="polite" aria-labelledby="sub-expired-title">
        <StatusBadge kind={badge.kind} label={badge.label} dot />
        <h1 id="sub-expired-title">Votre abonnement a expiré</h1>
        <p className="rv-shop-deadline">
          {subscription.message ?? `Votre abonnement a expiré le ${formatFrLongDate(subscription.endsAt)}.`}
        </p>
      </section>
    )
  }

  return (
    <section className="rv-shop-panel" aria-live="polite" aria-labelledby="sub-cancelled-title">
      <StatusBadge kind={badge.kind} label={badge.label} dot />
      <h1 id="sub-cancelled-title">Votre abonnement est annulé</h1>
      <p className="rv-shop-deadline">
        {subscription.supersedesId
          ? 'Cet abonnement a été remplacé par un autre forfait. Vos annonces de boutique restent rattachées à votre forfait actif.'
          : 'Cet abonnement n’est plus actif (demande refusée ou boutique désactivée). Vos annonces du catalogue restent en ligne ; contactez l’administration pour en connaître le motif.'}
      </p>
    </section>
  )
}
