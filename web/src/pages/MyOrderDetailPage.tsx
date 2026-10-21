import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { formatCountdown, formatDateTime, formatFcfa } from '../lib/format'
import { orderStatusBadge, PAYMENT_METHODS } from '../lib/constants'
import { Crumb, SiteHead } from '../components/site/SiteBits'
import { StatusBadge } from '../components/ui/StatusBadge'
import { PageLoader } from '../components/ui/Loading'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { OrderTimeline } from '../components/ui/OrderTimeline'
import { Ico } from '../components/brand/Ico'

/**
 * Ligne dt/dd d'un bloc `.spec` — la maquette attend un SEUL `<dl class="spec">`
 * par fiche (motif de `ProductView`), avec les paires dt/dd en enfants directs.
 */
function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

/** Détail d'une commande — vocabulaire Bureau. */
export function MyOrderDetailPage() {
  const { id = '' } = useParams()
  const order = useQuery({
    queryKey: ['my-order', id],
    queryFn: () => api.myOrderDetail(id),
  })

  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Mes commandes', to: '/mes-commandes' }, { label: 'Détail' }]} />
      <SiteHead level={1} title="Détail de la commande" />

      {order.isPending && <PageLoader label="Chargement de la commande…" />}

      {order.isError && <ErrorMessage error={order.error} showCode />}

      {order.isSuccess && (() => {
        const o = order.data.order
        const badge = orderStatusBadge(o.status)
        const methodLabel = PAYMENT_METHODS.find((m) => m.value === o.payment.method)?.label ?? o.payment.method
        return (
          <>
            <div className="box">
              <div className="head">
                <div>
                  <div className="eyebrow">{o.orderNumber}</div>
                  <h2>{o.orderNumber}</h2>
                </div>
                <div>
                  <StatusBadge kind={badge.kind} label={badge.label} />
                </div>
              </div>
              <div className="sum">
                <div className="r">
                  <div className="muted">{o.product.name}</div>
                  <div className="rv-price">{formatFcfa(o.amount)}</div>
                </div>
              </div>

              <div>
                <p className="ink">
                  {o.role === 'buyer' ? 'Acheté auprès de ' : 'Acheté par '}
                  <strong>{o.role === 'buyer' ? o.seller.displayName : o.buyer.displayName}</strong>
                </p>
                {o.reservedUntil && ['PAYMENT_PENDING'].includes(o.status) && (
                  <div className="note info">
                    <Ico name="clock" cls="sm" /> Délai de paiement restant : {formatCountdown(o.reservedUntil)}
                  </div>
                )}
              </div>

              <div className="two-col">
                <div className="box">
                  <h3>Informations</h3>
                  <dl className="spec">
                    <InfoRow label="Numéro" value={o.orderNumber} />
                    <InfoRow label="Date" value={formatDateTime(o.createdAt)} />
                    <InfoRow label="Prix article" value={formatFcfa(o.amount - o.commission)} />
                    <InfoRow label="Commission" value={formatFcfa(o.commission)} />
                    <InfoRow label="Total" value={formatFcfa(o.amount)} />
                  </dl>
                </div>
                <div className="box">
                  <h3>Paiement</h3>
                  <dl className="spec">
                    <InfoRow label="Moyen de paiement" value={methodLabel} />
                    <InfoRow
                      label="Statut"
                      value={<StatusBadge kind={o.payment.status === 'PAID' ? 'approved' : 'pending'} label={o.payment.status === 'PAID' ? 'Payé' : 'Non payé'} />}
                    />
                    {o.payment.reference && o.role === 'buyer' && <InfoRow label="Référence" value={o.payment.reference} />}
                    {o.payment.paidAt && <InfoRow label="Payé le" value={formatDateTime(o.payment.paidAt)} />}
                  </dl>
                </div>
              </div>

              {(o.deliveryCarrier || o.trackingNumber) && (
                <div className="box">
                  <h3>Livraison</h3>
                  <dl className="spec">
                    <InfoRow label="Transporteur" value={o.deliveryCarrier ?? '—'} />
                    <InfoRow label="N° de suivi" value={o.trackingNumber ?? '—'} />
                  </dl>
                </div>
              )}

              <div className="rv-foot">
                <Link to="/mes-commandes" className="link-arrow">
                  <Ico name="arrow-left" cls="sm" /> Retour à mes commandes
                </Link>
                <Link to={`/commandes/${o.id}/suivi`} className="btn">
                  <Ico name="truck" cls="sm" /> Suivre mon colis
                </Link>
              </div>
            </div>

            <div className="box">
              <div className="head">
                <h3><Ico name="truck" cls="sm" /> Suivi de commande</h3>
              </div>
              <OrderTimeline events={o.events} />
            </div>
          </>
        )
      })()}
    </div>
  )
}
