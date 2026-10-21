import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { ADMIN_ACTION_FILTERS, ADMIN_ACTION_META, EMPTY_COPY } from '../../lib/constants'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { AdminFilterBar } from '../../components/admin/AdminFilterBar'
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable'
import { StatusBadge } from '../../components/ui/StatusBadge'
import type { AdminHistoryItem } from '../../lib/types'

/** Libellés, icônes et tons de l'action : source unique `ADMIN_ACTION_META` (§9.4). */
function meta(item: AdminHistoryItem) {
  return ADMIN_ACTION_META[item.action] ?? ADMIN_ACTION_META['product.approved']
}

/** Cible de l'action — libellé par type (`category` = `category.update`, CA-ADM06). */
const TARGET_LABELS: Record<AdminHistoryItem['targetType'], string> = {
  product: 'Article',
  order: 'Commande',
  category: 'Catégorie',
}

/** Historique admin — spec-admin : journal des actions + filtre. */
export function AdminHistoryPage() {
  const stats = useAdminStats()
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')

  const history = useQuery({
    queryKey: ['admin', 'history', { action, page }],
    queryFn: () => api.adminHistory({ action: action || undefined, page, per_page: 15 }),
  })

  const columns: AdminColumn<AdminHistoryItem>[] = [
    {
      key: 'action',
      header: 'Action',
      cell: (item) => {
        const m = meta(item)
        return <StatusBadge kind={m.kind} label={m.label} dot />
      },
    },
    {
      key: 'description',
      header: 'Description',
      cell: (item) => <span className="text-ink">{item.description}</span>,
    },
    {
      key: 'target',
      header: 'Cible',
      cell: (item) => (
        <span className="text-muted">
          {TARGET_LABELS[item.targetType]} n° {item.targetId}
        </span>
      ),
    },
    { key: 'admin', header: 'Administrateur', cell: (item) => item.admin.displayName },
    { key: 'date', header: 'Date', cell: (item) => <span className="text-muted">{formatDateTime(item.createdAt)}</span> },
  ]

  return (
    <DashboardLayout items={adminMenu(stats.data?.pendingProducts ?? 0)}>
      <AdminPageHeader title="Historique" />

      <AdminFilterBar
        select={{
          value: action,
          onChange: (v) => {
            setAction(v)
            setPage(1)
          },
          label: 'Filtrer par action',
          options: ADMIN_ACTION_FILTERS,
        }}
        resultCount={{ total: history.data?.total ?? 0, noun: 'actions' }}
      />

      <AdminTable
        caption="Historique des actions"
        noun="actions"
        minWidth="lg"
        columns={columns}
        rows={history.data?.items ?? []}
        rowKey={(i) => i.id}
        isLoading={history.isPending}
        isRefreshing={history.isFetching}
        isError={history.isError}
        error={history.error}
        onRetry={() => void history.refetch()}
        empty={{ ...EMPTY_COPY.adminHistory }}
        page={history.data?.page}
        totalPages={history.data?.totalPages}
        total={history.data?.total}
        onPageChange={setPage}
      />
    </DashboardLayout>
  )
}
