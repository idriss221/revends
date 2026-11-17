import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { storefrontApi, storefrontError, formatFrActivation } from '../../lib/storefront'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { useAuth } from '../../context/AuthContext'
import type { SubscriptionAdminItem } from '../../lib/storefront.types'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable'
import { ConfirmAction } from '../../components/admin/ConfirmAction'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../lib/toast'

/**
 * `/admin/abonnements` — file des demandes d'activation (design §4, contrat
 * v2.7 §7.7/§7.8, CA-V7-013/014/050/051).
 *
 * · Onglet « En attente » (défaut) : file PENDING ;
 * « Tous » : sélecteur des statuts non-PENDING (ACTIVE / EXPIRED / CANCELLED) —
 * l’API ne sait filtrer qu’UN statut à la fois (déviation assumée vs le
 * design, qui suggérait un agrégat « tous » : l’agrégat n’existe pas côté
 * contrat) ;
 * · Activation = 1 confirmation, 0 ambiguïté, 1 trace (activated_by / activated_at) ;
 * · Traçabilité : « par vous » si l’activateur est l’admin connecté, sinon
 *   « par l’admin #id » — le contrat expose `activatedBy` en id, jamais en
 *   nom (activation : CA-V7-051 ; le nom d’affichage du *vendeur*, lui, est
 *   exposé par `sellerDisplayName`) ;
 * · Non-admin : redirection accueil (RequireAdmin, convention ARB-V5-02 —
 *   pas de page 403) ;
 * · Aucun CRUD forfait (CA-V7-053) : seuls « Activer » et la navigation.
 */
type Tab = 'pending' | 'all'
type NonPendingStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED'

const NON_PENDING: { value: NonPendingStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Actives' },
  { value: 'EXPIRED', label: 'Expirées' },
  { value: 'CANCELLED', label: 'Annulées' },
]

function statusBadge(status: string) {
  switch (status) {
    case 'ACTIVE':
      return { kind: 'approved' as const, label: 'Active' }
    case 'EXPIRED':
      return { kind: 'neutral' as const, label: 'Expirée' }
    case 'CANCELLED':
      return { kind: 'neutral' as const, label: 'Annulée' }
    default:
      return { kind: 'pending' as const, label: "En attente d'activation" }
  }
}

export function Abonnements() {
  const stats = useAdminStats()
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()

  const [tab, setTab] = useState<Tab>('pending')
  const [historyStatus, setHistoryStatus] = useState<NonPendingStatus>('ACTIVE')
  const [page, setPage] = useState(1)
  const [target, setTarget] = useState<SubscriptionAdminItem | null>(null)
  const [activatedBanner, setActivatedBanner] = useState<string | null>(null)

  const status: 'PENDING' | NonPendingStatus = tab === 'pending' ? 'PENDING' : historyStatus

  const pendingCount = useQuery({
    queryKey: ['admin', 'subscriptions', 'count-pending'],
    queryFn: () => storefrontApi.adminList({ status: 'PENDING', page: 1, perPage: 1 }),
    staleTime: 15_000,
  })

  const list = useQuery({
    queryKey: ['admin', 'subscriptions', status, page],
    queryFn: () => storefrontApi.adminList({ status, page, perPage: 12 }),
    staleTime: 15_000,
  })

  // Traçabilité : les 5 dernières activations (file « Historique »)
  const recent = useQuery({
    queryKey: ['admin', 'subscriptions', 'recent'],
    queryFn: () => storefrontApi.adminList({ status: 'ACTIVE', page: 1, perPage: 5 }),
    staleTime: 30_000,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
  }

  const activate = useMutation({
    mutationFn: (id: number) => storefrontApi.adminActivate(id),
    onSuccess: () => {
      if (target) {
        setActivatedBanner(`1 abonnement activé — « ${target.slug} » (${target.sellerDisplayName})`)
        toast('success', `« ${target.slug} » est ouverte. ${target.sellerDisplayName} peut maintenant gérer ses annonces.`)
      }
      setTarget(null)
      invalidate()
    },
    onError: (err) => {
      toast('error', storefrontError(err, 'Impossible d’activer cette boutique. Réessayez.'))
      setTarget(null)
      invalidate()
    },
  })

  const backlog = pendingCount.data?.total
  const activatedByLabel = (id: number | null) =>
    id === null ? '—' : id === user?.id ? 'vous' : `l’admin #${id}`

  const columns: AdminColumn<SubscriptionAdminItem>[] = [
    {
      key: 'seller',
      header: 'Vendeur',
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-ink">{row.sellerDisplayName}</span>
          <span className="text-xs text-muted">#{row.sellerId}</span>
        </span>
      ),
    },
    {
      key: 'plan',
      header: 'Forfait',
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold text-ink">{row.planName}</span>
          <span className="text-xs text-muted">
            {new Intl.NumberFormat('fr-FR').format(row.priceFcfa)} FCFA · {row.quota} annonces
          </span>
        </span>
      ),
    },
    {
      key: 'slug',
      header: 'Adresse',
      cell: (row) => (
        <Link to={`/boutique/${row.slug}`} className="font-mono text-xs text-terracotta-ink hover:underline">
          /boutique/{row.slug}
        </Link>
      ),
    },
    {
      key: 'created',
      header: 'Demande',
      cell: (row) => <span className="text-muted">{formatFrActivation(row.createdAt)}</span>,
    },
    ...(tab === 'pending'
      ? [
          {
            key: 'action',
            header: 'Action',
            widthClass: 'text-right',
            cell: (row: SubscriptionAdminItem) => (
              <div className="flex justify-end">
                <Button
                  variant="positive"
                  size="sm"
                  onClick={() => setTarget(row)}
                  aria-label={`Activer la boutique « ${row.slug} » pour ${row.sellerDisplayName}`}
                >
                  <i className="fas fa-circle-check" aria-hidden="true" />
                  Activer
                </Button>
              </div>
            ),
          } satisfies AdminColumn<SubscriptionAdminItem>,
        ]
      : [
          {
            key: 'trace',
            header: 'Traçabilité',
            cell: (row: SubscriptionAdminItem) => (
              <span className="flex min-w-0 flex-col">
                <StatusBadge kind={statusBadge(row.status).kind} label={statusBadge(row.status).label} dot />
                <span className="mt-1 text-xs text-muted">
                  {row.activatedAt ? `${formatFrActivation(row.activatedAt)} · par ${activatedByLabel(row.activatedBy)}` : '—'}
                </span>
              </span>
            ),
          } satisfies AdminColumn<SubscriptionAdminItem>,
        ]),
  ]

  const rows = list.data?.items ?? []

  return (
    <DashboardLayout items={adminMenu(stats.data?.pendingProducts ?? 0, backlog)}>
      <AdminPageHeader
        title="Abonnements"
        subtitle="Demandes d’activation des boutiques vendeurs"
        meta={
          backlog !== undefined ? (
            <StatusBadge kind="pending" label={`${backlog} en attente`} dot />
          ) : undefined
        }
      />

      {activatedBanner && (
        <div role="status" aria-live="polite" className="mb-4 flex items-center justify-between gap-3 rounded-sm bg-positive-soft px-4 py-3 text-sm text-positive">
          <span className="flex min-w-0 items-center gap-2">
            <i className="fas fa-circle-check shrink-0" aria-hidden="true" />
            <span className="min-w-0">{activatedBanner}</span>
          </span>
          <button
            type="button"
            onClick={() => setActivatedBanner(null)}
            aria-label="Fermer le message"
            className="shrink-0 cursor-pointer rounded-md p-1 text-positive transition-colors hover:bg-positive/10"
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Onglets liés En attente / Tous (sélecteur de statut non-PENDING) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Filtrer les abonnements"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
            const next = e.key === 'ArrowRight' ? (tab === 'pending' ? 'all' : 'pending') : tab === 'pending' ? 'all' : 'pending'
            setTab(next)
            setPage(1)
            document.getElementById(next === 'pending' ? 'tab-pending' : 'tab-all')?.focus()
          }}
        >
        <button
          type="button"
          role="tab"
          id="tab-pending"
          aria-selected={tab === 'pending'}
          aria-controls="subscriptions-panel"
          onClick={() => {
            setTab('pending')
            setPage(1)
          }}
          className={`min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-4 text-sm font-semibold transition-colors ${
            tab === 'pending' ? 'border-terracotta-strong bg-terracotta-wash text-terracotta-ink' : 'border-line-strong bg-white text-muted hover:text-ink'
          }`}
        >
          En attente{backlog !== undefined ? ` (${backlog})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          id="tab-all"
          aria-selected={tab === 'all'}
          aria-controls="subscriptions-panel"
          onClick={() => {
            setTab('all')
            setPage(1)
          }}
          className={`min-h-[44px] cursor-pointer rounded-md border-[1.5px] px-4 text-sm font-semibold transition-colors ${
            tab === 'all' ? 'border-terracotta-strong bg-terracotta-wash text-terracotta-ink' : 'border-line-strong bg-white text-muted hover:text-ink'
          }`}
        >
          Tous
        </button>
        </div>
        {tab === 'all' && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <span className="sr-only">Statut affiché</span>
            <select
              aria-label="Statut affiché"
              value={historyStatus}
              onChange={(e) => {
                setHistoryStatus(e.target.value as NonPendingStatus)
                setPage(1)
              }}
              className="field-input w-44 cursor-pointer"
            >
              {NON_PENDING.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div
        id="subscriptions-panel"
        role="tabpanel"
        aria-labelledby={tab === 'pending' ? 'tab-pending' : 'tab-all'}
        aria-busy={list.isFetching}
        className="grid grid-cols-[1fr_340px] items-start gap-6 max-[1280px]:grid-cols-1"
      >
        <AdminTable
          caption={tab === 'pending' ? 'Demandes d’abonnement en attente d’activation' : `Abonnements — ${NON_PENDING.find((s) => s.value === historyStatus)?.label ?? ''}`}
          noun="abonnements"
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          isLoading={list.isPending}
          isRefreshing={list.isFetching && !list.isPending}
          isError={list.isError}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty={
            tab === 'pending'
              ? { title: 'Rien en attente', description: 'Aucune demande d’abonnement à activer — la file est à jour.', action: { label: 'Retour au tableau de bord', to: '/admin' } }
              : { title: `Aucune demande ${NON_PENDING.find((s) => s.value === historyStatus)?.label.toLowerCase()}`, description: 'Rien à afficher pour ce statut pour le moment.' }
          }
          page={list.data?.page}
          totalPages={list.data?.totalPages}
          total={list.data?.total}
          onPageChange={setPage}
        />

        {/* Activations récentes — traçabilité visible (CA-V7-013/051) */}
        <aside aria-labelledby="recent-activations-title" className="max-[1280px]:order-first">
          <div className="rounded-md border border-line bg-white p-5">
            <h2 id="recent-activations-title" className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
              Activations récentes
            </h2>
            {recent.isPending ? (
              <p className="text-sm text-muted">Chargement…</p>
            ) : recent.isError ? (
              <p className="text-sm text-danger">Impossible de charger l’historique.</p>
            ) : (recent.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted">Aucune activation pour le moment.</p>
            ) : (
              <ul className="space-y-3">
                {recent.data!.items.map((row) => (
                  <li key={row.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="min-w-0 truncate text-sm font-semibold text-ink">« {row.slug} »</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {row.sellerDisplayName} · activée le {formatFrActivation(row.activatedAt)}
                      {' · '}par {activatedByLabel(row.activatedBy)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <ConfirmAction
        open={target !== null}
        onClose={() => setTarget(null)}
        onConfirm={() => target && activate.mutate(target.id)}
        title="Activer la boutique ?"
        confirmLabel="Activer la boutique"
        tone="secondary"
        urgency="info"
        loading={activate.isPending}
        message={
          <>
            <span className="block font-bold">« {target?.slug} » — {target?.sellerDisplayName}</span>
            <span className="mt-1 block">
              {target?.planName} — {target ? new Intl.NumberFormat('fr-FR').format(target.priceFcfa) : ''} FCFA / mois ·{' '}
              {target?.quota} annonces
            </span>
          </>
        }
        consequences={[
          { icon: 'fa-store', text: 'La boutique devient publique immédiatement.' },
          { icon: 'fa-signature', text: 'Votre nom et la date seront enregistrés (activated_by, activated_at).' },
        ]}
      />
    </DashboardLayout>
  )
}
