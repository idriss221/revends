import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { EMPTY_COPY } from '../../lib/constants'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { AdminFilterBar } from '../../components/admin/AdminFilterBar'
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable'
import type { AdminUser } from '../../lib/types'

/** Initiales pour l'avatar — l'initiale n'est jamais l'unique information (le nom est à côté). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Utilisateurs (admin) — spec-admin §6-6 : **lecture seule stricte**, aucun
 * bouton d'action, aucune colonne vide (CA-V5-041).
 */
export function AdminUsersPage() {
  const stats = useAdminStats()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  // debounce 350 ms — même constante que les autres pages de liste
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(q)
      setPage(1)
    }, 350)
    return () => window.clearTimeout(t)
  }, [q])

  const users = useQuery({
    queryKey: ['admin', 'users', { q: debouncedQ, page }],
    queryFn: () => api.adminUsers({ q: debouncedQ || undefined, page, per_page: 20 }),
  })

  const columns: AdminColumn<AdminUser>[] = [
    {
      key: 'name',
      header: 'Nom',
      cell: (u) => (
        <span className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-chocolate text-[13px] font-extrabold text-on-dark"
          >
            {initials(u.displayName)}
          </span>
          <span className="min-w-0 truncate font-semibold text-ink">{u.displayName}</span>
        </span>
      ),
    },
    { key: 'email', header: 'E-mail', cell: (u) => <span className="text-muted">{u.email}</span> },
    { key: 'phone', header: 'Téléphone', cell: (u) => u.phone },
    { key: 'since', header: 'Inscrit le', cell: (u) => <span className="text-muted">{formatDate(u.createdAt)}</span> },
    {
      key: 'activity',
      header: 'Activité',
      cell: (u) => (
        <span className="text-muted">
          {u.productCount ?? 0} article{(u.productCount ?? 0) > 1 ? 's' : ''} · {u.orderCount ?? 0} commande
          {(u.orderCount ?? 0) > 1 ? 's' : ''}
        </span>
      ),
    },
  ]

  return (
    <DashboardLayout items={adminMenu(stats.data?.pendingProducts ?? 0)}>
      <AdminPageHeader title="Utilisateurs" />

      <AdminFilterBar
        search={{
          value: q,
          onChange: (v) => {
            setQ(v)
            setPage(1)
          },
          placeholder: 'Nom, e-mail ou téléphone…',
          label: 'Rechercher un utilisateur',
        }}
        resultCount={{ total: users.data?.total ?? 0, noun: 'utilisateurs' }}
      />

      <AdminTable
        caption="Utilisateurs"
        noun="utilisateurs"
        columns={columns}
        rows={users.data?.items ?? []}
        rowKey={(u) => u.id}
        isLoading={users.isPending}
        isRefreshing={users.isFetching}
        isError={users.isError}
        error={users.error}
        onRetry={() => void users.refetch()}
        empty={{ ...(debouncedQ ? EMPTY_COPY.adminUsersFiltered : EMPTY_COPY.adminUsers) }}
        page={users.data?.page}
        totalPages={users.data?.totalPages}
        total={users.data?.total}
        onPageChange={setPage}
      />
    </DashboardLayout>
  )
}
