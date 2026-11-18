import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { storefrontApi, storefrontError, formatFrActivation } from '../../lib/storefront'
import { paymentMethodLabel, formatRemainingAge, isSlaBreach } from '../../lib/v8'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { useAuth } from '../../context/AuthContext'
import type { SubscriptionAdminItem } from '../../lib/storefront.types'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable'
import { ConfirmAction } from '../../components/admin/ConfirmAction'
import { Modal } from '../../components/ui/Modal'
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
 * · V8.1 — « Contrôle boutique » (contrat v8.1) : deux gouvernances ajoutées
 *   dans la colonne Actions de l'onglet « Tous » — « Désactiver » (ACTIVE
 *   uniquement, réversible, confirmation simple) et « Supprimer définitivement »
 *   (ACTIVE + CANCELLED, deux temps : saisie « Supprimer ») ;
 * · Onglet « En attente » inchangé (seule « Activer ») ; compteurs, cartes,
 *   layout, cards et navigation : 0 ligne ;
 * · Non-admin : redirection accueil (RequireAdmin, convention ARB-V5-02 —
 *   pas de page 403) ;
 * · Aucun CRUD forfait (CA-V7-053).
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
  const [deactivateTarget, setDeactivateTarget] = useState<SubscriptionAdminItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SubscriptionAdminItem | null>(null)
  const [deleteWord, setDeleteWord] = useState('')
  const [activatedBanner, setActivatedBanner] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<SubscriptionAdminItem | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectBanner, setRejectBanner] = useState<string | null>(null)

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

  // V8.1 — « Contrôle boutique » : désactivation réversible (ACTIVE → CANCELLED).
  const deactivate = useMutation({
    mutationFn: (id: number) => storefrontApi.adminDeactivate(id),
    onSuccess: () => {
      if (deactivateTarget) {
        toast('success', `« ${deactivateTarget.slug} » passe hors-ligne — les annonces restent au catalogue. Le vendeur peut la réactiver plus tard.`)
      }
      setDeactivateTarget(null)
      invalidate()
    },
    onError: (err) => {
      toast('error', storefrontError(err, 'Impossible de désactiver cette boutique. Réessayez.'))
      setDeactivateTarget(null)
      invalidate()
    },
  })

  // V8.2 — refus d'une demande PENDING : motif saisi par l'admin, e-mail best-effort envoyé au vendeur.
  const rejectCtl = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => storefrontApi.adminReject(id, reason),
    onSuccess: () => {
      if (rejectTarget) {
        setRejectBanner(`Abonnement « ${rejectTarget.slug} » refusé — e-mail envoyé au vendeur.`)
      }
      setRejectTarget(null)
      setRejectReason('')
      invalidate()
    },
    onError: () => {
      toast('error', "Refus impossible pour l'instant ; la demande est conservée. Réessayez.")
      setRejectTarget(null)
      setRejectReason('')
      invalidate()
    },
  })

  // V8.1 — suppression DÉFINITIVE (CANCELLED + articles masqués + listings supprimés).
  const deleteCtl = useMutation({
    mutationFn: (id: number) => storefrontApi.adminDelete(id),
    onSuccess: () => {
      if (deleteTarget) {
        toast('success', `« ${deleteTarget.slug} » supprimée définitivement — articles masqués, annonces retirées.`)
      }
      setDeleteTarget(null)
      setDeleteWord('')
      invalidate()
    },
    onError: (err) => {
      toast('error', storefrontError(err, 'Impossible de supprimer cette boutique. Réessayez.'))
      setDeleteTarget(null)
      setDeleteWord('')
      invalidate()
    },
  })

  const closeDelete = () => {
    setDeleteTarget(null)
    setDeleteWord('')
  }

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
      key: 'payment',
      header: 'Paiement',
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-ink">{paymentMethodLabel(row.paymentMethod)}</span>
          <span className="font-mono text-xs break-all text-ink" title="Référence complète — admin uniquement ; à recopier dans l'app Wave/OM/virement pour vérifier la transaction">
            {row.paymentReference ?? 'référence absente'}
          </span>
        </span>
      ),
    },
    // §14.D clos — aucune adresse de collecte dans l'UI (admin inclus).
    {
      key: 'created',
      header: 'Demande',
      cell: (row) => {
        const isPending = tab === 'pending' || row.status === 'PENDING'
        const overSla = isPending && isSlaBreach(row.createdAt)
        return (
          <span className="flex min-w-0 flex-col">
            <span className="text-muted">{formatFrActivation(row.createdAt)}</span>
            {isPending && (
              <span
                className={`mt-0.5 inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  overSla ? 'border-danger-border bg-danger-soft text-danger' : 'border-line bg-surface-sunken text-muted'
                }`}
                title={overSla ? 'Étude en attente depuis plus de 24h (SLA dépassé)' : 'Temps écoulé depuis la soumission'}
              >
                <i className="fas fa-clock" aria-hidden="true" />
                {formatRemainingAge(row.createdAt)}{overSla ? ' · SLA' : ''}
              </span>
            )}
          </span>
        )
      },
    },
    ...(tab === 'pending'
      ? [
          {
            key: 'action',
            header: 'Action',
            widthClass: 'text-right',
            cell: (row: SubscriptionAdminItem) => (
              <div className="flex justify-end gap-2">
                <Button
                  variant="positive"
                  size="sm"
                  onClick={() => setTarget(row)}
                  aria-label={`Activer la boutique « ${row.slug} » pour ${row.sellerDisplayName}`}
                >
                  <i className="fas fa-circle-check" aria-hidden="true" />
                  Activer
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setRejectTarget(row)
                    setRejectReason('')
                  }}
                  aria-label={`Refuser la boutique « ${row.slug} » pour ${row.sellerDisplayName}`}
                >
                  <i className="fas fa-xmark" aria-hidden="true" />
                  Refuser
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
          // V8.1 — « Contrôle boutique » : « Désactiver » uniquement sur une
          // ACTIVE (une CANCELLED l'est déjà) ; « Supprimer définitivement »
          // proposé aussi pour les CANCELLED (clôture d'une commande).
          {
            key: 'actions',
            header: 'Actions',
            widthClass: 'text-right',
            cell: (row: SubscriptionAdminItem) => {
              const canDeactivate = row.status === 'ACTIVE'
              const canDelete = row.status === 'ACTIVE' || row.status === 'CANCELLED'
              if (!canDeactivate && !canDelete) return <span className="text-muted">—</span>
              return (
                <div className="flex flex-wrap justify-end gap-2">
                  {canDeactivate && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="chevron-down"
                      onClick={() => setDeactivateTarget(row)}
                      aria-label={`Désactiver la boutique « ${row.slug} »`}
                    >
                      Désactiver
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="danger"
                      size="sm"
                      icon="trash"
                      onClick={() => {
                        setDeleteWord('')
                        setDeleteTarget(row)
                      }}
                      aria-label={`Supprimer définitivement la boutique « ${row.slug} »`}
                    >
                      Supprimer définitivement
                    </Button>
                  )}
                </div>
              )
            },
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

      {rejectBanner && (
        <div role="status" aria-live="polite" className="mb-4 flex items-center justify-between gap-3 rounded-sm border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
          <span className="flex min-w-0 items-center gap-2">
            <i className="fas fa-circle-xmark shrink-0" aria-hidden="true" />
            <span className="min-w-0">{rejectBanner}</span>
          </span>
          <button
            type="button"
            onClick={() => setRejectBanner(null)}
            aria-label="Fermer le message"
            className="shrink-0 cursor-pointer rounded-md p-1 text-danger transition-colors hover:bg-danger/10"
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

      <p className="mb-3 text-xs text-muted">
        La référence Wave / Orange Money / virement est affichée <strong>masquée</strong> (préfixe + 3 derniers
        caractères) ; « référence absente » = demande héritée, activable. L’adresse de collecte est{' '}
        <strong>interne</strong> — visible uniquement ici, jamais publique.
      </p>

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
          {
            icon: 'fa-money-bill-wave',
            text: `Paiement à vérifier (Wave/OM/virement) : ${paymentMethodLabel(target?.paymentMethod)} — référence ${target?.paymentReference ?? 'absente'}`,
          },
          { icon: 'fa-signature', text: 'Votre nom et la date seront enregistrés (activated_by, activated_at).' },
        ]}
      />

      {/* V8.1 — Désactiver : confirmation simple (une étape, Annuler/Désactiver) */}
      <ConfirmAction
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => deactivateTarget && deactivate.mutate(deactivateTarget.id)}
        title="Désactiver la boutique ?"
        confirmLabel="Désactiver"
        tone="secondary"
        urgency="warning"
        loading={deactivate.isPending}
        message={
          <span className="block">
            Les annonces restent dans le catalogue, mais la boutique passe hors-ligne. Réactiver plus tard ?
          </span>
        }
        consequences={[
          { icon: 'fa-eye-slash', text: `« ${deactivateTarget?.slug ?? ''} » est retirée des boutiques publiques (statut Annulée).` },
          { icon: 'fa-undo', text: 'Aucune annonce n’est supprimée — le vendeur peut la réactiver en se réabonnant.' },
        ]}
      />

      {/* V8.1 — Supprimer définitivement : deux temps — nom + saisie « Supprimer » */}
      <ConfirmAction
        open={deleteTarget !== null}
        onClose={closeDelete}
        onConfirm={() => deleteTarget && deleteCtl.mutate(deleteTarget.id)}
        title="Cette action est irréversible"
        confirmLabel="Supprimer définitivement"
        tone="danger"
        urgency="danger"
        loading={deleteCtl.isPending}
        confirmDisabled={deleteWord.trim() !== 'Supprimer'}
        message={
          <span className="block font-bold">
            Supprimer définitivement la boutique « {deleteTarget?.slug} » ?
          </span>
        }
        consequences={[
          { icon: 'fa-ban', text: 'Le statut passe à Annulée — aucune restauration possible.' },
          { icon: 'fa-eye-slash', text: 'Les articles du vendeur sont masqués (soft-delete) — l’historique des commandes est préservé.' },
          { icon: 'fa-trash', text: 'Les annonces boutique (listings) sont supprimées définitivement.' },
        ]}
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            Saisissez « Supprimer » pour confirmer
          </span>
          <input
            type="text"
            value={deleteWord}
            onChange={(e) => setDeleteWord(e.target.value)}
            placeholder="Supprimer"
            autoComplete="off"
            aria-label="Saisissez « Supprimer » pour confirmer"
            className="field-input w-full"
          />
        </label>
      </ConfirmAction>

      {/* V8.2 — Refuser une demande PENDING : motif obligatoire + e-mail vendeur best-effort */}
      {rejectTarget !== null && (
        <Modal
          open={rejectTarget !== null}
          dismissable={false}
          title="Refuser la demande ?"
          onClose={() => setRejectTarget(null)}
          size="md"
        >
          <div className="space-y-4 p-4">
            <p className="text-sm text-ink">
              Vendeur : <strong>{rejectTarget.sellerDisplayName}</strong> · Forfait
              <strong> {rejectTarget.planName}</strong> · Adresse <strong>/boutique/{rejectTarget.slug}</strong>
            </p>
            <p className="text-sm text-muted">
              Un motif est obligatoire : le vendeur le reçoit par e-mail (« Abonnement non validé ») pour corriger la situation.
            </p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                Motif du refus (≥ 10 caractères)
              </span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Référence introuvable dans Wave / montant supérieur / duplication…"
                aria-label="Motif du refus"
                className="field-input"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">{rejectReason.trim().length} / 2000 caractères</span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setRejectTarget(null)}>Annuler</Button>
                <Button
                  variant="danger"
                  loading={rejectCtl.isPending}
                  disabled={rejectReason.trim().length < 10}
                  onClick={() => rejectCtl.mutate({ id: rejectTarget.id, reason: rejectReason.trim() })}
                >
                  <i className="fas fa-xmark" aria-hidden="true" /> Refuser et envoyer
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  )
}
