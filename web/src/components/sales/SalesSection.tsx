import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { formatFcfa } from '../../lib/format'
import { orderStatusBadge } from '../../lib/constants'
import { resolveImageUrl } from '../../lib/catalogPhotos'
import { ResilientImg } from '../ui/ResilientImg'
import { StatusBadge } from '../ui/StatusBadge'
import { SiteEmpty } from '../site/SiteBits'
import { ErrorMessage } from '../ui/ErrorMessage'
import { TableSkeleton } from '../ui/Loading'
import { buttonClasses } from '../ui/Button'
import { Ico } from '../brand/Ico'
import { EMPTY_COPY } from '../../lib/constants'

/**
 * Ventes de mes articles (V3 E2 — GET /api/me/sales, vue vendeur).
 * Listées du plus récent au plus ancien ; chaque vente en cours peut être
 * suivie (lien « Suivre » → /commandes/:id/suivi). Confidentialité D2 :
 * aucune coordonnée acheteur ni référence de paiement ici.
 *
 * Visuel : vocabulaire `Bureau/main` (`.rv-sub` + `.head` + `.box` +
 * `.rv-tab` + `.prod-cell`), icônes du **sprite SVG** (`Ico`) plutôt que
 * Font Awesome. Seuls les composants PARTAGÉS avec l'admin (`StatusBadge`,
 * `ErrorMessage`, `TableSkeleton`) conservent leur style d'origine : les
 * re-styler modifierait l'interface admin, qui doit être conservée à
 * l'identique — dette documentée dans le rapport.
 */
export function SalesSection() {
  const sales = useQuery({ queryKey: ['my-sales'], queryFn: () => api.mySales() })

  return (
    <section className="rv-sub" aria-labelledby="sales-h">
      <div className="head">
        <div>
          <h2 id="sales-h">Mes ventes</h2>
          <p className="sub">Suivez l'état de vos articles vendus</p>
        </div>
      </div>

      {sales.isError && <ErrorMessage error={sales.error} showCode />}

      {sales.isPending && <TableSkeleton rows={3} />}

      {sales.isSuccess && sales.data.items.length === 0 && (
        <SiteEmpty
          icon="truck"
          title={EMPTY_COPY.sales.title}
          action={{ label: 'Publier un article', to: '/vendre' }}
        >
          {EMPTY_COPY.sales.description}
        </SiteEmpty>
      )}

      {sales.isSuccess && sales.data.items.length > 0 && (
        <div className="box">
          <div className="table-scroll">
            <table className="rv-tab" aria-label="Liste de mes ventes">
              <thead>
                <tr>
                  <th scope="col">Article</th>
                  <th scope="col">Commande</th>
                  <th scope="col">Montant reçu</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Suivi</th>
                </tr>
              </thead>
              <tbody>
                {sales.data.items.map((o) => {
                  const badge = orderStatusBadge(o.status)
                  return (
                    <tr key={o.id}>
                      <td>
                        <div className="prod-cell">
                          {o.product.image ? (
                            <ResilientImg
                              src={resolveImageUrl(o.product.image.url)}
                              alt={o.product.name}
                              className="prod-thumb"
                            />
                          ) : (
                            <div className="prod-thumb" aria-hidden="true">
                              <Ico name="image" cls="sm" />
                            </div>
                          )}
                          <div>
                            <Link to={`/catalogue/${o.product.slug}`} className="prod-name">
                              {o.product.name}
                            </Link>
                            <div className="prod-meta">{o.orderNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td className="muted">{o.orderNumber}</td>
                      <td>
                        <span className="amt">{formatFcfa(o.sellerAmount)}</span>
                      </td>
                      <td>
                        <StatusBadge kind={badge.kind} label={badge.label} />
                      </td>
                      <td>
                        <Link to={`/commandes/${o.id}/suivi`} className={buttonClasses('outline', 'sm')}>
                          {o.status === 'COMPLETED' ? 'Voir le récapitulatif' : 'Suivre la vente'}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
