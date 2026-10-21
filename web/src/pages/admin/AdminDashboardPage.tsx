import { Link } from 'react-router'
import { formatFcfa, formatNumber, formatToday } from '../../lib/format'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { Card, EmptyState } from '../../components/ui/States'
import { ErrorMessage } from '../../components/ui/ErrorMessage'
import { StatCard } from '../../components/ui/StatCard'
import { StatGridSkeleton } from '../../components/ui/Loading'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { buttonClasses } from '../../components/ui/Button'
import { EMPTY_COPY, ORDER_STATUS_LABELS, orderStatusBadge } from '../../lib/constants'
import type { AdminStats, OrderStatus } from '../../lib/types'

interface ActionRow {
  to: string
  icon: string
  label: string
  count: number
  detail?: string
}

/** 6 lignes « Actions à effectuer » — compteurs du backend (aucune requête ajoutée, §9.1). */
function actionsFrom(stats: AdminStats | undefined): ActionRow[] {
  return [
    { to: '/admin/articles-en-attente', icon: 'fas fa-clock', label: 'Articles en attente', count: stats?.pendingProducts ?? 0 },
    {
      to: '/admin/commandes?status=PAYMENT_PENDING',
      icon: 'fas fa-wallet',
      label: 'Paiements à confirmer',
      count: stats?.orders?.paymentPending ?? 0,
    },
    {
      to: '/admin/commandes?status=PRODUCT_WAITING',
      icon: 'fas fa-box-open',
      label: 'Articles à récupérer',
      count: stats?.orders?.productWaiting ?? 0,
    },
    {
      // Lien `?status=PREPARING` ↔ compteur `preparing` ↔ libellé du statut :
      // les trois désignent la même file. Le compteur lisait `shipped` : la
      // ligne annonçait un volume qui n'était pas celui de la liste ouverte.
      // Libellé repris de `ORDER_STATUS_LABELS` (§9.4, source unique).
      to: '/admin/commandes?status=PREPARING',
      icon: 'fas fa-box',
      label: ORDER_STATUS_LABELS.PREPARING,
      count: stats?.orders?.preparing ?? 0,
    },
    {
      to: '/admin/commandes?status=IN_DELIVERY',
      icon: 'fas fa-truck-fast',
      label: 'En cours de livraison',
      count: stats?.orders?.inDelivery ?? 0,
    },
    {
      to: '/admin/paiements',
      icon: 'fas fa-money-bill-wave',
      label: 'Paiements vendeurs à payer',
      count: stats?.payoutsDue ?? 0,
      detail: stats?.payoutsDueAmount ? formatFcfa(stats.payoutsDueAmount) : undefined,
    },
  ]
}

/** 8 tuiles « Progression des commandes » — chacune mène au filtre correspondant (§9.1). */
const PROGRESSION: { status: OrderStatus; key: keyof NonNullable<AdminStats['orders']> }[] = [
  { status: 'PAYMENT_PENDING', key: 'paymentPending' },
  { status: 'PRODUCT_WAITING', key: 'productWaiting' },
  { status: 'PRODUCT_RECEIVED', key: 'productReceived' },
  { status: 'PREPARING', key: 'preparing' },
  { status: 'SHIPPED', key: 'shipped' },
  { status: 'IN_DELIVERY', key: 'inDelivery' },
  { status: 'DELIVERED', key: 'delivered' },
  { status: 'COMPLETED', key: 'completed' },
]

/**
 * Dashboard admin — spec-admin §6-1.
 *
 * Ordre : `StatCard` ×4 → « Actions à effectuer » (6 lignes) → « Progression des
 * commandes » (8 tuiles) → « Paiements à payer » → « Accès rapides ».
 * **État vide** : si les 4 compteurs, les 8 statuts et `payoutsDue` valent 0, un
 * seul `EmptyState` remplace les 3 derniers blocs — jamais 12 zéros nus.
 */
export function AdminDashboardPage() {
  const stats = useAdminStats()

  const quick = [
    { to: '/admin/articles-en-attente', icon: 'fas fa-clock', label: 'Articles en attente' },
    { to: '/admin/articles', icon: 'fas fa-box', label: 'Articles' },
    { to: '/admin/commandes', icon: 'fas fa-cart-shopping', label: 'Commandes' },
    { to: '/admin/paiements', icon: 'fas fa-money-bill-wave', label: 'Paiements vendeurs' },
  ]

  const actions = actionsFrom(stats.data)
  const orders = stats.data?.orders
  const progressionCount = PROGRESSION.reduce((sum, p) => sum + (orders?.[p.key] ?? 0), 0)
  const tilesEmpty =
    (stats.data?.users ?? 0) === 0 &&
    (stats.data?.pendingProducts ?? 0) === 0 &&
    (stats.data?.activeOrders ?? 0) === 0 &&
    (stats.data?.payoutsDue ?? 0) === 0 &&
    progressionCount === 0

  return (
    <DashboardLayout items={adminMenu(stats.data?.pendingProducts ?? 0)}>
      <AdminPageHeader title="Dashboard" subtitle={formatToday()} />

      {stats.isError ? (
        <ErrorMessage
          error={stats.error}
          showCode
          action={{ label: 'Réessayer', onClick: () => void stats.refetch() }}
          loading={stats.isFetching}
        />
      ) : stats.isPending ? (
        <StatGridSkeleton />
      ) : (
        <div data-testid="admin-stat-cards" className="mb-6 grid grid-cols-4 gap-5 max-[1200px]:grid-cols-2 max-[560px]:grid-cols-1">
          <div className="stagger-1">
            <StatCard title="Utilisateurs" value={stats.data?.users ?? 0} variant="terracotta" icon="fas fa-users" />
          </div>
          <div className="stagger-2">
            <StatCard title="Articles en attente" value={stats.data?.pendingProducts ?? 0} variant="champagne" icon="fas fa-clock" />
          </div>
          <div className="stagger-3">
            <StatCard title="Commandes actives" value={stats.data?.activeOrders ?? 0} variant="chocolate" icon="fas fa-cart-shopping" />
          </div>
          <div className="stagger-4">
            <StatCard
              title="Paiements à payer"
              value={stats.data?.payoutsDue ?? 0}
              variant="positive"
              icon="fas fa-money-bill-wave"
              subtitle={stats.data?.payoutsDueAmount ? formatFcfa(stats.data.payoutsDueAmount) : undefined}
            />
          </div>
        </div>
      )}

      {!tilesEmpty && !stats.isPending && (
        <>
          <Card className="mb-6">
            <h2 className="mb-5 text-[19px] font-bold text-ink">Actions à effectuer</h2>
            {/* D14 : uniquement des `max-[…]`. La sidebar 260 px décale la largeur
                utile, donc le breakpoint `md` (768 px) serait trompeur (CA-V5-038, E8). */}
            <div className="grid gap-4 max-[1200px]:grid-cols-1">
              {actions.map((a) => (
                <Link
                  key={a.label}
                  to={a.to}
                  className="group flex items-center gap-4 rounded-md bg-ivory p-4 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white text-xl text-terracotta-ink shadow-sm">
                    <i className={a.icon} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{a.label}</span>
                    {a.detail ? <small className="text-sm font-medium text-positive">{a.detail}</small> : null}
                  </span>
                  <span
                    className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 text-sm font-bold ${
                      a.count > 0 ? 'bg-champagne-soft text-chocolate' : 'bg-line text-muted'
                    }`}
                  >
                    {a.count}
                  </span>
                  <i
                    className="fas fa-chevron-right text-sm text-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-terracotta-deep"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </Card>

          <Card className="mb-6">
            <h2 className="mb-5 text-[19px] font-bold text-ink">Progression des commandes</h2>
            <div className="grid grid-cols-4 gap-4 max-[1200px]:grid-cols-2 max-[560px]:grid-cols-1">
              {PROGRESSION.map(({ status, key }) => {
                const count = orders?.[key] ?? 0
                const badge = orderStatusBadge(status)
                return (
                  <Link
                    key={status}
                    to={`/admin/commandes?status=${status}`}
                    className="flex h-full items-center justify-between gap-2 rounded-md bg-ivory p-3 transition-colors duration-200 hover:bg-terracotta-wash"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-muted">{ORDER_STATUS_LABELS[status]}</span>
                      <span className="tabular block text-lg font-bold text-ink">{count}</span>
                    </span>
                    <StatusBadge kind={badge.kind} label={badge.label} dot />
                  </Link>
                )
              })}
            </div>
          </Card>

          <Card className="mb-6">
            <h2 className="mb-3 text-[19px] font-bold text-ink">Paiements à payer</h2>
            <p className="text-[32px] font-bold leading-none text-terracotta-strong">
              {formatFcfa(stats.data?.payoutsDueAmount ?? 0)}
            </p>
            <p className="mt-2 text-sm text-muted">
              {stats.data?.payoutsDue ?? 0} paiement{stats.data?.payoutsDue === 1 ? '' : 's'} vendeur
              {stats.data?.payoutsDue === 1 ? '' : 's'} · commission 10 % déjà déduite
            </p>
            <Link to="/admin/paiements" className={`${buttonClasses('primary', 'md')} mt-4`}>
              Payer les vendeurs <i className="fas fa-arrow-right" aria-hidden="true" />
            </Link>
          </Card>

          <Card className="mb-6">
            <h2 className="mb-5 text-[19px] font-bold text-ink">Accès rapides</h2>
            <div className="flex flex-wrap gap-3">
              {quick.map((q) => (
                <Link key={q.to} to={q.to} className={buttonClasses('outline', 'sm')}>
                  <i className={q.icon} aria-hidden="true" /> {q.label}
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}

      {tilesEmpty && !stats.isPending && !stats.isError && (
        /* PAS de `<Card>` autour : `EmptyState variant="card"` est déjà une carte
           blanche. L'imbriquer donnait une carte blanche sur une carte blanche —
           64 px de padding cumulé et deux ombres superposées, sans surface
           visible (D1 : une seule surface par plan). */
        <EmptyState
          variant="card"
          className="mb-6"
          title="Tout est à jour"
          description={EMPTY_COPY.admin.description}
          action={{ label: 'Voir les articles', to: '/admin/articles' }}
        />
      )}

      <p className="text-sm text-muted">
        Utilisateurs inscrits : <strong className="text-ink">{formatNumber(stats.data?.users ?? 0)}</strong>
      </p>
    </DashboardLayout>
  )
}
