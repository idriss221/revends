import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api, ApiError } from '../lib/api'
import { formatDate, formatFcfa } from '../lib/format'
import { productStatusBadge } from '../lib/constants'
import { resolveImageUrl } from '../lib/catalogPhotos'
import { ResilientImg } from '../components/ui/ResilientImg'
import { Crumb, SiteEmpty, SiteHead } from '../components/site/SiteBits'
import { buttonClasses, Button } from '../components/ui/Button'
import { StatusBadge } from '../components/ui/StatusBadge'
import { TableSkeleton } from '../components/ui/Loading'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { SalesSection } from '../components/sales/SalesSection'
import { Ico } from '../components/brand/Ico'
import { ConfirmAction } from '../components/admin/ConfirmAction'
import { useToast } from '../lib/toast'
import { friendlyError } from '../lib/errors'
import type { OwnerProduct } from '../lib/types'

/** V8.1 — « Contrôle boutique » : message humain "commande en cours" (409 PRODUCT_ORDER_ACTIVE). */
const PRODUCT_ORDER_ACTIVE_MESSAGE =
  'Cet article est impliqué dans une commande en cours, supprimez-le seulement une fois réceptionnée/soldée.'

/**
 * Page « Mes articles » — restylée avec vocabulaire Bureau/main.
 * Logique inchangée. Table sémantique conservée pour accessibilité/tests.
 *
 * V8.1 — « Contrôle boutique » : action « Supprimer » (propriétaire) par
 * article — confirmation à deux temps (titre « Supprimer l'article ? » +
 * saisie « Supprimer ») ; 409 PRODUCT_ORDER_ACTIVE ⇒ toast warning humain.
 */
export function MyArticlesPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const [target, setTarget] = useState<OwnerProduct | null>(null)
  const [deleteWord, setDeleteWord] = useState('')

  const products = useQuery({ queryKey: ['my-products'], queryFn: () => api.myProducts() })

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteOwnerProduct(id),
    onSuccess: () => {
      toast('success', `« ${target?.name ?? 'Article'} » supprimé.`)
      setTarget(null)
      setDeleteWord('')
      void qc.invalidateQueries({ queryKey: ['my-products'] })
      void qc.invalidateQueries({ queryKey: ['my-articles'] })
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'PRODUCT_ORDER_ACTIVE') {
        toast('warning', PRODUCT_ORDER_ACTIVE_MESSAGE)
      } else {
        toast('error', friendlyError(err, "L'article n'a pas pu être supprimé. Réessayez."))
      }
      setTarget(null)
      setDeleteWord('')
    },
  })

  const closeModal = () => {
    setTarget(null)
    setDeleteWord('')
  }

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
                        <div className="flex flex-wrap items-center justify-start gap-2">
                          {editable ? (
                            <Link to={`/vendre?id=${p.id}`} className={buttonClasses('outline', 'sm')}>
                              Modifier
                            </Link>
                          ) : (
                            <span className="muted">—</span>
                          )}
                          <Button
                            variant="danger"
                            size="sm"
                            icon="trash"
                            onClick={() => {
                              setDeleteWord('')
                              setTarget(p)
                            }}
                            aria-label={`Supprimer l'article « ${p.name} »`}
                          >
                            Supprimer
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* V8.1 — Confirmation à deux temps : « Supprimer l'article ? » + saisie « Supprimer » */}
      <ConfirmAction
        open={target !== null}
        onClose={closeModal}
        onConfirm={() => target && remove.mutate(target.id)}
        title="Supprimer l'article ?"
        confirmLabel="Supprimer"
        tone="danger"
        urgency="danger"
        loading={remove.isPending}
        confirmDisabled={deleteWord.trim() !== 'Supprimer'}
        message={
          <span className="block font-bold">« {target?.name} » sera définitivement supprimé.</span>
        }
        consequences={[
          { icon: 'fa-eye-slash', text: "L'article quitte le catalogue et n'est plus achetable." },
          { icon: 'fa-ban', text: 'Aucune restauration possible : cette action est définitive.' },
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

      <SalesSection />
    </div>
  )
}
