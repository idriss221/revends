import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { formatDate, formatFcfa } from '../../lib/format'
import { EMPTY_COPY, PAYOUT_FILTERS, TOAST_COPY, orderStatusBadge, payoutStatusBadge } from '../../lib/constants'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { AdminFilterBar } from '../../components/admin/AdminFilterBar'
import { AdminTable, ProductCell, type AdminColumn } from '../../components/admin/AdminTable'
import { ConfirmAction } from '../../components/admin/ConfirmAction'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { FormField } from '../../components/ui/FormField'
import { useToast } from '../../lib/toast'
import type { AdminOrderItem } from '../../lib/types'

/**
 * Paiements vendeurs (spec-admin §6-5) — cycle PENDING → DUE → PAID.
 * Le filtre par défaut est « À payer » : c'est l'action quotidienne.
 * `minWidth="lg"` (7 colonnes) : le scroll reste **interne à la carte**, la page
 * ne déborde jamais.
 */
export function AdminPaymentsPage() {
  const stats = useAdminStats()
  const toast = useToast()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('due')
  const [payTarget, setPayTarget] = useState<AdminOrderItem | null>(null)
  const [payoutReference, setPayoutReference] = useState('')

  const payouts = useQuery({
    queryKey: ['admin', 'payouts', { filter, page }],
    queryFn: () => api.adminOrders({ payout: filter || undefined, page, per_page: 12 }),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'orders'] })
    qc.invalidateQueries({ queryKey: ['admin', 'payouts'] })
    qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
  }

  const pay = useMutation({
    mutationFn: (o: AdminOrderItem) => api.sellerPayout(o.id, payoutReference.trim() || undefined),
    onSuccess: () => {
      toast('success', TOAST_COPY.payoutMarked)
      setPayTarget(null)
      setPayoutReference('')
      invalidate()
    },
    onError: (err) => toast('error', err instanceof Error ? err.message : TOAST_COPY.payoutFailed),
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
    {
      key: 'product',
      header: 'Article',
      cell: (o) => <ProductCell name={o.product.name} image={o.product.image} />,
    },
    { key: 'seller', header: 'Vendeur', cell: (o) => o.seller.displayName },
    {
      key: 'amount',
      header: 'Montant vendeur',
      cell: (o) => <span className="font-semibold text-ink">{formatFcfa(o.sellerAmount)}</span>,
    },
    {
      key: 'orderStatus',
      header: 'Statut commande',
      cell: (o) => {
        const badge = orderStatusBadge(o.status)
        return <StatusBadge kind={badge.kind} label={badge.label} dot />
      },
    },
    {
      key: 'payout',
      header: 'Statut paiement',
      cell: (o) =>
        o.payout ? (
          <StatusBadge kind={payoutStatusBadge(o.payout.status).kind} label={payoutStatusBadge(o.payout.status).label} dot />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'action',
      header: 'Action',
      widthClass: 'text-right',
      cell: (o) =>
        o.payout?.status === 'DUE' ? (
          <Button variant="secondary" size="sm" onClick={() => setPayTarget(o)} aria-label={`Marquer comme payé la commande ${o.orderNumber}`}>
            <i className="fas fa-money-bill-wave" aria-hidden="true" /> Marquer comme payé
          </Button>
        ) : (
          <Link
            to={`/admin/commandes/${o.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-terracotta-ink transition-colors hover:text-terracotta-deep"
          >
            <i className="fas fa-arrow-right text-[10px]" aria-hidden="true" /> Voir détails
          </Link>
        ),
    },
  ]

  return (
    <DashboardLayout items={adminMenu(stats.data?.pendingProducts ?? 0)}>
      <AdminPageHeader title="Paiements vendeurs" subtitle="Commission 10 % déjà déduite." />

      <AdminFilterBar
        select={{
          value: filter,
          onChange: (v) => {
            setFilter(v)
            setPage(1)
          },
          label: 'Filtrer par statut de paiement',
          options: PAYOUT_FILTERS,
        }}
        resultCount={{ total: payouts.data?.total ?? 0, noun: 'paiements' }}
      />

      <AdminTable
        caption="Paiements vendeurs"
        noun="paiements"
        minWidth="lg"
        columns={columns}
        rows={payouts.data?.items ?? []}
        rowKey={(o) => o.id}
        isLoading={payouts.isPending}
        isRefreshing={payouts.isFetching}
        isError={payouts.isError}
        error={payouts.error}
        onRetry={() => void payouts.refetch()}
        empty={{ ...EMPTY_COPY.adminPayments }}
        page={payouts.data?.page}
        totalPages={payouts.data?.totalPages}
        total={payouts.data?.total}
        onPageChange={setPage}
      />

      <ConfirmAction
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        onConfirm={() => payTarget && pay.mutate(payTarget)}
        title="Marquer comme payé"
        confirmLabel="Marquer comme payé"
        tone="secondary"
        urgency="warning"
        loading={pay.isPending}
        message={
          <>
            <span className="block font-bold">{payTarget?.orderNumber}</span>
            <span className="mt-1 block">
              Le vendeur {payTarget?.seller.displayName} recevra {payTarget ? formatFcfa(payTarget.sellerAmount) : ''}.
              L’opération est tracée dans l’historique.
            </span>
          </>
        }
      >
        <FormField label="Référence du virement (facultatif)" htmlFor="payout-reference">
          <input
            id="payout-reference"
            className="field-input"
            value={payoutReference}
            onChange={(e) => setPayoutReference(e.target.value)}
            placeholder="Ex. TRX-4821…"
            autoComplete="off"
          />
        </FormField>
      </ConfirmAction>
    </DashboardLayout>
  )
}
