import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { api, ApiError } from '../../lib/api'
import { formatDate, formatFcfa } from '../../lib/format'
import { EMPTY_COPY, PRODUCT_STATUS_FILTERS, TOAST_COPY, productStatusBadge } from '../../lib/constants'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { AdminFilterBar } from '../../components/admin/AdminFilterBar'
import { AdminTable, ProductCell, type AdminColumn } from '../../components/admin/AdminTable'
import { AdminProductSheet } from '../../components/admin/AdminProductSheet'
import { ConfirmDelete } from '../../components/admin/ConfirmAction'
import { Button, buttonClasses } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useToast } from '../../lib/toast'
import type { ProductAdmin } from '../../lib/types'

/**
 * Articles (admin) — spec-admin §6-3 + §6-9.
 *
 * Colonnes : Article · Vendeur · Prix · Statut · Date · Actions.
 * La colonne **Actions n'existe que sur cette page** (CA-V5-048) : c'est
 * l'action « Supprimer » de CA-V5-065, bloquée quand `hasActiveOrder` est vrai
 * (le libellé du bouton porte le motif — un élément `disabled` ne reçoit ni
 * hover ni focus, donc **aucune infobulle**).
 */
export function AdminArticlesPage() {
  const stats = useAdminStats()
  const toast = useToast()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  /**
   * Filtre statut : **`?status=` est la source d'état**, comme sur Commandes
   * (§9.1) — le filtre survit au rechargement et reste partageable. C'est aussi
   * ce qui permet à un lien externe d'ouvrir directement un périmètre.
   *
   * Défaut `AVAILABLE`, pas « tous » : l'API `GET /api/admin/products`
   * **exige** un statut et le défaut serveur est `PENDING` — sans paramètre
   * elle ne renvoyait que les articles en attente, sous un intitulé « Tous les
   * statuts » trompeur (constantes.ts / validation.ts:319). La liste démarre
   * donc sur le catalogue publié, périmètre principal de cet écran.
   */
  const [params, setParams] = useSearchParams()
  // Un lien partagé / tapé à la main peut porter un statut inexistant : on le
  // rejette **avant** la requête, sinon le serveur répond 400 et tout l'écran
  // bascule en état d'erreur. Liste fermée = source unique (PRODUCT_STATUS_FILTERS).
  const requested = params.get('status')
  const status = PRODUCT_STATUS_FILTERS.some((o) => o.value === requested) ? requested! : 'AVAILABLE'
  /**
   * Reset de `page` quand le statut change **par l'URL** (back/forward, lien
   * partagé) : sinon `page=4` + nouveau statut = `items: []` et un « Aucun
   * résultat » trompeur (le reset n'existait que sur `q`). Ajustement pendant
   * le rendu (React) : pas de requête intermédiaire avec l'ancienne page.
   */
  const [prevStatus, setPrevStatus] = useState(status)
  if (prevStatus !== status) {
    setPrevStatus(status)
    setPage(1)
  }
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [detail, setDetail] = useState<ProductAdmin | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductAdmin | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(q)
      setPage(1)
    }, 350)
    return () => window.clearTimeout(t)
  }, [q])

  const items = useQuery({
    queryKey: ['admin', 'products', { status, q: debouncedQ, page }],
    queryFn: () => api.adminProducts({ status: status || undefined, q: debouncedQ || undefined, page, per_page: 12 }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.adminDeleteProduct(id),
    onSuccess: () => {
      toast('success', TOAST_COPY.productDeleted)
      setDeleteTarget(null)
      setDetail(null)
      qc.invalidateQueries({ queryKey: ['admin', 'products'] })
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
    },
    onError: (err) => {
      // Le **code** d'erreur décide du texte, jamais le message (§9.4) : le
      // regex `/active/i` ne matchait « Article lié à une commande en cours… »
      // et affichait le toast 409 **en plus** d'un second toast. Un seul toast,
      // tous cas de figure — y compris 404 / 500 / réseau (CA-V5-065).
      if (!(err instanceof ApiError)) {
        toast('error', TOAST_COPY.actionFailed)
      } else if (err.code === 'PRODUCT_HAS_ACTIVE_ORDER') {
        toast('error', TOAST_COPY.productHasActiveOrder)
      } else if (err.code === 'NETWORK_ERROR') {
        toast('error', TOAST_COPY.networkError)
      } else {
        toast('error', err.readableMessage() || TOAST_COPY.actionFailed)
      }
    },
  })

  const rows = items.data?.items ?? []
  const total = items.data?.total ?? 0
  /**
   * « n supprimables » = articles sans commande en cours. Comptage **page-local**
   * (l'API ne le pagine pas) alors que `total` est global : le sous-compteur est
   * donc libellé « sur cette page » pour ne pas se lire comme un sous-ensemble
   * du total affiché juste à côté.
   */
  const deletable = useMemo(() => rows.filter((p) => !p.hasActiveOrder).length, [rows])
  const hasFilter = status !== 'AVAILABLE' || debouncedQ !== ''

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
    {
      key: 'status',
      header: 'Statut',
      cell: (p) => {
        const badge = productStatusBadge(p.status)
        return <StatusBadge kind={badge.kind} label={badge.label} dot />
      },
    },
    { key: 'date', header: 'Date', cell: (p) => <span className="text-muted">{formatDate(p.createdAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      widthClass: 'text-right',
      cell: (p) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setDetail(p)} aria-label={`Voir l’article « ${p.name} »`}>
            <i className="fas fa-eye" aria-hidden="true" /> Voir
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={p.hasActiveOrder}
            title={
              p.hasActiveOrder
                ? `Suppression impossible : l’article « ${p.name} » est lié à une commande en cours`
                : undefined
            }
            aria-label={
              p.hasActiveOrder
                ? `Suppression impossible : l’article « ${p.name} » est lié à une commande en cours`
                : `Supprimer l’article « ${p.name} »`
            }
            onClick={() => setDeleteTarget(p)}
          >
            <i className={`fas ${p.hasActiveOrder ? 'fa-lock' : 'fa-trash-can'}`} aria-hidden="true" />
            {p.hasActiveOrder ? 'Lié à une commande' : 'Supprimer'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout items={adminMenu(stats.data?.pendingProducts ?? 0)}>
      <AdminPageHeader
        title="Articles"
        subtitle={`${total} produits · ${deletable} supprimables sur cette page`}
        actions={
          hasFilter ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setParams({}, { replace: true })
                setQ('')
                setPage(1)
              }}
            >
              <i className="fas fa-rotate-left" aria-hidden="true" /> Réinitialiser les filtres
            </Button>
          ) : undefined
        }
      />

      <AdminFilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Rechercher un article…', label: 'Rechercher un article' }}
        select={{
          value: status,
          onChange: (v) => {
            // `AVAILABLE` est le défaut : inutile de polluer l'URL avec lui.
            setParams(v === 'AVAILABLE' ? {} : { status: v }, { replace: true })
            setPage(1)
          },
          label: 'Filtrer par statut',
          options: PRODUCT_STATUS_FILTERS,
        }}
        resultCount={{ total, noun: 'articles' }}
      />

      <AdminTable
        caption="Articles du catalogue"
        noun="articles"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        onRowClick={setDetail}
        isLoading={items.isPending}
        isRefreshing={items.isFetching}
        isError={items.isError}
        error={items.error}
        onRetry={() => void items.refetch()}
        empty={{
          ...(status !== 'AVAILABLE' || debouncedQ ? EMPTY_COPY.adminArticlesFiltered : EMPTY_COPY.adminArticles),
          action:
            status !== 'AVAILABLE' || debouncedQ
              ? { label: 'Réinitialiser les filtres', to: '/admin/articles' }
              : undefined,
        }}
        page={items.data?.page}
        totalPages={items.data?.totalPages}
        total={total}
        onPageChange={setPage}
      />

      <AdminProductSheet
        product={detail}
        onClose={() => setDetail(null)}
        actions={
          <div className="flex flex-col gap-3">
            {detail && (
              <Link
                to={`/catalogue/${detail.slug}`}
                className={buttonClasses('primary', 'md', true)}
                onClick={() => setDetail(null)}
              >
                <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" /> Voir la fiche publique
              </Link>
            )}
            <Button
              variant="danger"
              block
              disabled={detail?.hasActiveOrder}
              aria-label={
                detail?.hasActiveOrder
                  ? `Suppression impossible : l’article « ${detail.name} » est lié à une commande en cours`
                  : undefined
              }
              onClick={() => detail && setDeleteTarget(detail)}
            >
              <i className={`fas ${detail?.hasActiveOrder ? 'fa-lock' : 'fa-trash-can'}`} aria-hidden="true" />
              {detail?.hasActiveOrder ? 'Lié à une commande' : 'Supprimer'}
            </Button>
          </div>
        }
      />

      <ConfirmDelete
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        productName={deleteTarget?.name ?? ''}
        loading={remove.isPending}
      />
    </DashboardLayout>
  )
}
