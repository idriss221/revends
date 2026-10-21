import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { formatDate, formatFcfa } from '../lib/format'
import { orderStatusBadge } from '../lib/constants'
import { resolveImageUrl } from '../lib/catalogPhotos'
import { Crumb, SiteEmpty, SiteHead } from '../components/site/SiteBits'
import { StatusBadge } from '../components/ui/StatusBadge'
import { TableSkeleton } from '../components/ui/Loading'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { EMPTY_COPY } from '../lib/constants'
import { Ico } from '../components/brand/Ico'

/** Page « Mes commandes » — vocabulaire Bureau, table sémantique conservée. */
export function MyOrdersPage() {
  const orders = useQuery({ queryKey: ['my-orders'], queryFn: () => api.myOrders() })

  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Mes commandes' }]} />
      <SiteHead level={1} title="Mes commandes" sub="Retrouvez vos achats, paiements et statuts ici." />

      {orders.isError && <ErrorMessage error={orders.error} showCode />}

      {orders.isPending && <TableSkeleton rows={4} />}

      {orders.isSuccess && orders.data.items.length === 0 && (
        <SiteEmpty
          icon="bag"
          title={EMPTY_COPY.orders.title}
          action={{ label: 'Voir le catalogue', to: '/' }}
        >
          {EMPTY_COPY.orders.description}
        </SiteEmpty>
      )}

      {orders.isSuccess && orders.data.items.length > 0 && (
        <div className="box">
          <div className="table-scroll">
            <table className="rv-tab" aria-label="Liste de mes commandes">
              <thead>
                <tr>
                  <th scope="col">Commande</th>
                  <th scope="col">Date</th>
                  <th scope="col">Article</th>
                  <th scope="col">Prix</th>
                  <th scope="col">Statut</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.items.map((o) => {
                  const badge = orderStatusBadge(o.status)
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/mes-commandes/${o.id}`} className="prod-name">
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="muted">{formatDate(o.createdAt)}</td>
                      <td>
                        <div className="prod-cell">
                          {o.product.image ? (
                            <img src={resolveImageUrl(o.product.image.url)} alt={o.product.name} className="prod-thumb" />
                          ) : (
                            <div className="prod-thumb" aria-hidden="true">
                              <Ico name="image" cls="sm" />
                            </div>
                          )}
                          <span className="prod-name">{o.product.name}</span>
                        </div>
                      </td>
                      <td className="prod-meta amt">{formatFcfa(o.amount)}</td>
                      <td>
                        <StatusBadge kind={badge.kind} label={badge.label} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
