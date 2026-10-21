import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api } from '../../lib/api'
import { formatDate, formatFcfa } from '../../lib/format'
import { EMPTY_COPY, ORDER_STATUS_FILTERS, orderStatusBadge } from '../../lib/constants'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { AdminFilterBar } from '../../components/admin/AdminFilterBar'
import { AdminTable, ProductCell, type AdminColumn } from '../../components/admin/AdminTable'
import { StatusBadge } from '../../components/ui/StatusBadge'
import type { AdminOrderItem } from '../../lib/types'

/**
 * Commandes (admin) — spec-admin §6-4.
 *
 * Le statut initial vient de `?status=` (§9.1) : les 8 tuiles « Progression des
 * commandes » du dashboard mènent donc au bon filtre (sinon bouton sans effet,
 * RG-V5-08). Les 12 libellés viennent de `ORDER_STATUS_FILTERS`, dérivé de
 * `ORDER_STATUS_LABELS` — aucune recopie dans la page (§9.4).
 *
 * **Filtre URL blanchi** : un statut hors enum (`?status=FOO`, back/forward ou
 * lien externe) partait tel quel à l'API → zod répond **400** et **toute la
 * page** bascule en état d'erreur. On retombe sur `''` (« Tous ») — la même
 * logique que `AdminArticlesPage` avec `PRODUCT_STATUS_FILTERS`.
 */
export function AdminOrdersPage() {
  const stats = useAdminStats()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const requested = params.get('status')
  const status = requested !== null && ORDER_STATUS_FILTERS.some((o) => o.value === requested) ? requested : ''

  /**
   * Reset de `page` quand le statut change **par l'URL** (back/forward, lien
   * partagé) : sinon `page=4` + nouveau statut = `items: []` et un « Aucun
   * résultat » trompeur. Ajustement pendant le rendu (React) : aucune requête
   * intermédiaire n'est émise avec l'ancienne page.
   */
  const [prevStatus, setPrevStatus] = useState(status)
  if (prevStatus !== status) {
    setPrevStatus(status)
    setPage(1)
  }

  const orders = useQuery({
    queryKey: ['admin', 'orders', { status, page }],
    queryFn: () => api.adminOrders({ status: status || undefined, page, per_page: 12 }),
  })

  const columns: AdminColumn<AdminOrderItem>[] = [
    {
      key: 'order',
      header: 'Commande',
      cell: (o) => (
        <span className="min-w-0">
          <Link
            to={`/admin/commandes/${o.id}`}
            className="block truncate font-semibold text-chocolate transition-colors hover:text-terracotta-ink"
          >
            {o.orderNumber}
          </Link>
          <span className="block text-xs text-muted">{formatDate(o.createdAt)}</span>
        </span>
      ),
    },
    { key: 'date', header: 'Date', cell: (o) => <span className="text-muted">{formatDate(o.updatedAt)}</span> },
    {
      key: 'product',
      header: 'Article',
      cell: (o) => (
        <ProductCell
          name={o.product.name}
          image={o.product.image}
          to={`/catalogue/${o.product.slug}`}
        />
      ),
    },
    { key: 'buyer', header: 'Acheteur', cell: (o) => o.buyer.displayName },
    { key: 'amount', header: 'Montant', cell: (o) => <span className="font-semibold text-ink">{formatFcfa(o.amount)}</span> },
    {
      key: 'status',
      header: 'Statut',
      cell: (o) => {
        const badge = orderStatusBadge(o.status)
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge kind={badge.kind} label={badge.label} dot />
            {o.payout?.status === 'DUE' && <StatusBadge kind="reserved" label="À payer" dot />}
          </span>
        )
      },
    },
  ]

  return (
    <DashboardLayout items={adminMenu(stats.data?.pendingProducts ?? 0)}>
      <AdminPageHeader title="Commandes" />

      <AdminFilterBar
        select={{
          value: status,
          onChange: (v) => {
            setParams(v ? { status: v } : {}, { replace: true })
            setPage(1)
          },
          label: 'Filtrer par statut',
          options: ORDER_STATUS_FILTERS,
        }}
        resultCount={{ total: orders.data?.total ?? 0, noun: 'commandes' }}
      />

      <AdminTable
        caption="Commandes"
        noun="commandes"
        columns={columns}
        rows={orders.data?.items ?? []}
        rowKey={(o) => o.id}
        onRowClick={(o) => navigate(`/admin/commandes/${o.id}`)}
        isLoading={orders.isPending}
        isRefreshing={orders.isFetching}
        isError={orders.isError}
        error={orders.error}
        onRetry={() => void orders.refetch()}
        empty={{ ...(status ? EMPTY_COPY.adminOrdersFiltered : EMPTY_COPY.adminOrders) }}
        page={orders.data?.page}
        totalPages={orders.data?.totalPages}
        total={orders.data?.total}
        onPageChange={setPage}
      />
    </DashboardLayout>
  )
}
