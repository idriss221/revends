import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { api } from '../lib/api'
import { formatDateTime, formatFcfa } from '../lib/format'
import { orderStatusBadge, PAYMENT_METHODS } from '../lib/constants'
import { Crumb, SiteHead } from '../components/site/SiteBits'
import { StatusBadge } from '../components/ui/StatusBadge'
import { PageLoader } from '../components/ui/Loading'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { OrderTimeline } from '../components/ui/OrderTimeline'
import { Ico } from '../components/brand/Ico'

/**
 * Page « Suivre mon colis » — vocabulaire Bureau.
 */
export function OrderTrackingPage() {
  const { id = '' } = useParams()
  const order = useQuery({
    queryKey: ['order-tracking', id],
    queryFn: () => api.myOrderDetail(id),
  })

  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Suivi de colis' }]} />
      <SiteHead level={1} title="Suivi de colis" />

      {order.isPending && <PageLoader label="Chargement du suivi…" />}

      {order.isError && <ErrorMessage error={order.error} showCode />}

      {order.isSuccess && (() => {
        const o = order.data.order
        const badge = orderStatusBadge(o.status)
        const methodLabel = PAYMENT_METHODS.find((m) => m.value === o.payment.method)?.label ?? o.payment.method
        const otherParty = o.role === 'buyer' ? o.seller : o.buyer
        return (
          <>
            <div className="box">
              <div className="head">
                <div>
                  <div className="eyebrow">Commande</div>
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

              <div className="two-col">
                <div className="box">
                  <h3>Détails</h3>
                  <p className="ink">
                    {o.role === 'buyer' ? 'Acheté auprès de ' : 'Acheté par '}
                    <strong>{otherParty.displayName}</strong>
                  </p>
                  <p className="muted">{o.product.name}</p>
                  <p className="muted">{formatDateTime(o.createdAt)}</p>
                  {o.deliveryCarrier || o.trackingNumber ? (
                    <div className="note info">
                      <Ico name="truck" cls="sm" />
                      {o.deliveryCarrier ? `${o.deliveryCarrier} — ` : ''}
                      {o.trackingNumber ? `N° ${o.trackingNumber}` : 'Livraison en cours'}
                    </div>
                  ) : null}
                </div>
                <div className="box">
                  <h3>Paiement</h3>
                  <p className="muted">Moyen : {methodLabel}</p>
                  <p className="muted">
                    Statut : {o.payment.status === 'PAID' ? 'Payé' : 'Non payé'}
                    {o.payment.paidAt ? ` — le ${formatDateTime(o.payment.paidAt)}` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="box">
              <div className="head">
                <h3><Ico name="truck" cls="sm" /> Progression du colis</h3>
              </div>
              <OrderTimeline events={o.events} />
            </div>

            <div>
              <Link to={o.role === 'buyer' ? '/mes-commandes' : '/mes-articles'} className="link-arrow">
                <Ico name="arrow-left" cls="sm" /> Retour
              </Link>
            </div>
          </>
        )
      })()}
    </div>
  )
}
