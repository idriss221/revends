import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { formatDate, formatFcfa } from '../lib/format'
import { productStatusBadge } from '../lib/constants'
import { resolveImageUrl } from '../lib/catalogPhotos'
import { ResilientImg } from '../components/ui/ResilientImg'
import { Crumb, SiteEmpty, SiteHead } from '../components/site/SiteBits'
import { buttonClasses } from '../components/ui/Button'
import { StatusBadge } from '../components/ui/StatusBadge'
import { TableSkeleton } from '../components/ui/Loading'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { SalesSection } from '../components/sales/SalesSection'
import { Ico } from '../components/brand/Ico'

/**
 * Page « Mes articles » — restylée avec vocabulaire Bureau/main.
 * Logique inchangée. Table sémantique conservée pour accessibilité/tests.
 */
export function MyArticlesPage() {
  const products = useQuery({ queryKey: ['my-products'], queryFn: () => api.myProducts() })

  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Mes articles' }]} />
      <SiteHead level={1} title="Mes articles" sub="Gérez vos annonces et retrouvez les ventes en cours." />

      {products.isError && <ErrorMessage error={products.error} showCode />}

      {products.isPending && <TableSkeleton rows={5} />}

      {products.isSuccess && products.data.items.length === 0 && (
        <SiteEmpty
          icon="plus-circle"
          title="Aucun article publié"
          action={{ label: 'Revendre un article', to: '/vendre' }}
        >
          Publiez votre premier article en quelques minutes : trois photos, une description, un prix.
        </SiteEmpty>
      )}

      {products.isSuccess && products.data.items.length > 0 && (
        <div className="box">
          <div className="table-scroll">
            <table className="rv-tab" aria-label="Liste de mes articles">
              <thead>
                <tr>
                  <th scope="col">Article</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Publié le</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.data.items.map((p) => {
                  const badge = productStatusBadge(p.status)
                  const editable = p.status === 'PENDING' || p.status === 'AVAILABLE' || p.status === 'REJECTED'
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="prod-cell">
                          {p.images[0] ? (
                            <ResilientImg src={resolveImageUrl(p.images[0].url)} alt={p.name} className="prod-thumb" />
                          ) : (
                            <div className="prod-thumb" aria-hidden="true">
                              <Ico name="image" cls="sm" />
                            </div>
                          )}
                          <div>
                            <Link to={`/catalogue/${p.slug}`} className="prod-name">
                              {p.name}
                            </Link>
                            <div className="prod-meta">{formatFcfa(p.price)}</div>
                            {p.status === 'REJECTED' && p.rejectionReason && (
                              <div className="note warn">
                                <Ico name="circle-info" cls="sm" /> Refusé : {p.rejectionReason}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusBadge kind={badge.kind} label={badge.label} />
                      </td>
                      <td className="muted">{formatDate(p.createdAt)}</td>
                      <td>
                        {editable ? (
                          <Link to={`/vendre?id=${p.id}`} className={buttonClasses('outline', 'sm')}>
                            Modifier
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SalesSection />
    </div>
  )
}
