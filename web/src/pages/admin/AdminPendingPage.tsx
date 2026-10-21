import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { formatDate, formatFcfa } from '../../lib/format'
import { EMPTY_COPY, REJECTION_REASONS, TOAST_COPY } from '../../lib/constants'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { AdminFilterBar } from '../../components/admin/AdminFilterBar'
import { AdminTable, ProductCell, type AdminColumn } from '../../components/admin/AdminTable'
import { AdminProductSheet } from '../../components/admin/AdminProductSheet'
import { ConfirmAction } from '../../components/admin/ConfirmAction'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useToast } from '../../lib/toast'
import type { ProductAdmin } from '../../lib/types'

/**
 * Articles en attente — spec-admin §6-2.
 * `AdminTable` 5 colonnes · `ConfirmAction` pour l'approbation et le refus
 * (motif toujours dans la liste fermée `REJECTION_REASONS`) · libellés inchangés.
 */
export function AdminPendingPage() {
  const stats = useAdminStats()
  const toast = useToast()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [preview, setPreview] = useState<ProductAdmin | null>(null)
  const [approveTarget, setApproveTarget] = useState<ProductAdmin | null>(null)
  const [refuse, setRefuse] = useState<ProductAdmin | null>(null)
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0])

  const items = useQuery({
    queryKey: ['admin', 'products', { status: 'PENDING', page }],
    queryFn: () => api.adminProducts({ status: 'PENDING', page, per_page: 12 }),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'products'] })
    qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
  }

  const approve = useMutation({
    mutationFn: (id: number) => api.approveProduct(id),
    onSuccess: () => {
      toast('success', TOAST_COPY.productApproved)
      setApproveTarget(null)
      invalidate()
    },
    onError: (err) => toast('error', err instanceof Error ? err.message : TOAST_COPY.productApprovalFailed),
  })

  const reject = useMutation({
    mutationFn: async () => {
      if (!refuse) throw new Error('Aucun article sélectionné.')
      return api.rejectProduct(refuse.id, reason)
    },
    onSuccess: () => {
      toast('success', TOAST_COPY.productRejected)
      setRefuse(null)
      invalidate()
    },
    onError: (err) => toast('error', err instanceof Error ? err.message : TOAST_COPY.productRejectionFailed),
  })

  const columns: AdminColumn<ProductAdmin>[] = [
    {
      key: 'product',
      header: 'Article',
      cell: (p) => (
        <ProductCell
          name={p.name}
          image={p.images[0] ?? null}
          sub={`${p.category.name} · ${p.subcategory.name}`}
        />
      ),
    },
    { key: 'seller', header: 'Vendeur', cell: (p) => p.owner.displayName },
    { key: 'price', header: 'Prix', cell: (p) => <span className="font-semibold text-ink">{formatFcfa(p.price)}</span> },
    { key: 'date', header: 'Date', cell: (p) => <span className="text-muted">{formatDate(p.createdAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      widthClass: 'text-right',
      cell: (p) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreview(p)} aria-label={`Voir l’article « ${p.name} »`}>
            <i className="fas fa-eye" aria-hidden="true" /> Voir
          </Button>
          <Button
            variant="positive"
            size="sm"
            onClick={() => setApproveTarget(p)}
            aria-label={`Approuver l’article « ${p.name} »`}
          >
            <i className="fas fa-check" aria-hidden="true" /> Approuver
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setRefuse(p)}
            aria-label={`Refuser l’article « ${p.name} »`}
          >
            <i className="fas fa-xmark" aria-hidden="true" /> Refuser
          </Button>
        </div>
      ),
    },
  ]

  const count = items.data?.total ?? 0

  return (
    <DashboardLayout items={adminMenu(stats.data?.pendingProducts ?? 0)}>
      <AdminPageHeader
        title="Articles en attente"
        meta={<StatusBadge kind="pending" label={`${count} à modérer`} dot />}
      />

      <AdminFilterBar resultCount={{ total: count, noun: 'article(s) à modérer' }} />

      <AdminTable
        caption="Articles en attente de modération"
        noun="articles"
        columns={columns}
        rows={items.data?.items ?? []}
        rowKey={(p) => p.id}
        onRowClick={setPreview}
        isLoading={items.isPending}
        isRefreshing={items.isFetching}
        isError={items.isError}
        error={items.error}
        onRetry={() => void items.refetch()}
        empty={{
          ...EMPTY_COPY.adminPending,
          action: { label: 'Voir les articles publiés', to: '/admin/articles' },
        }}
        page={items.data?.page}
        totalPages={items.data?.totalPages}
        total={items.data?.total}
        onPageChange={setPage}
      />

      <AdminProductSheet
        product={preview}
        onClose={() => setPreview(null)}
        statusLabel="En attente"
        actions={
          <div className="flex flex-col gap-3">
            <Button variant="positive" block onClick={() => setApproveTarget(preview)}>
              <i className="fas fa-check" aria-hidden="true" /> Approuver
            </Button>
            <Button variant="danger" block onClick={() => setRefuse(preview)}>
              <i className="fas fa-xmark" aria-hidden="true" /> Refuser
            </Button>
          </div>
        }
      />

      <ConfirmAction
        open={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        onConfirm={() => approveTarget && approve.mutate(approveTarget.id)}
        title="Approuver l’article"
        confirmLabel="Confirmer l’approbation"
        tone="positive"
        urgency="info"
        loading={approve.isPending}
        message={
          <>
            <span className="block font-bold">« {approveTarget?.name} »</span>
            <span className="mt-1 block">
              L’article sera publié en ligne immédiatement. Vous pourrez toujours le refuser ou le retirer par la suite.
            </span>
          </>
        }
      />

      <ConfirmAction
        open={Boolean(refuse)}
        onClose={() => setRefuse(null)}
        onConfirm={() => reject.mutate()}
        title={`Refuser « ${refuse?.name ?? ''} »`}
        confirmLabel="Confirmer le refus"
        tone="danger"
        urgency="danger"
        loading={reject.isPending}
        message="Choisissez un motif : la liste est fermée et sera envoyée au vendeur."
      >
        <fieldset className="grid gap-2">
          <legend className="sr-only">Motif du refus</legend>
          {REJECTION_REASONS.map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer items-center gap-3 rounded-md border-[1.5px] p-3.5 transition-colors ${
                reason === r
                  ? 'border-terracotta-strong bg-terracotta-wash'
                  : 'border-line-strong bg-white hover:border-terracotta'
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="h-5 w-5 accent-terracotta-strong"
              />
              <span className="text-sm font-medium text-ink">{r}</span>
            </label>
          ))}
        </fieldset>
      </ConfirmAction>
    </DashboardLayout>
  )
}
