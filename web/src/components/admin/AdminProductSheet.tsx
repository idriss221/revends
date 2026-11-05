import type { ReactNode } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { StatusBadge } from '../ui/StatusBadge'
import type { StatusBadgeKind } from '../../lib/constants'
import { formatDate, formatFcfa } from '../../lib/format'
import { resolveImageUrl } from '../../lib/catalogPhotos'
import { ResilientImg } from '../ui/ResilientImg'
import type { ProductAdmin, ProductStatus } from '../../lib/types'

/**
 * Dossier produit — spec-admin §4.5 (CA-V5-048). Remplace `ProductPreview` et la
 * modale de détail article par **un seul** composant.
 *
 * Contrat : la feuille ne possède **que la mise en page** (`actions: ReactNode`).
 * Le flux de modération de `AdminPendingPage` reste entièrement dans la page —
 * la feuille n'invente aucune action, elle ne fait que cadrer l'existant.
 *
 * 2 colonnes (`max-[968px]` : aperçu d'abord), image principale `h-[240px]`
 * `object-cover`, vignettes `rounded-sm` avec bordure transparente → Terracotta
 * sur l'active. Le compteur `(n/12)` est `aria-live="polite"` : un clic au
 * clavier doit être annoncé.
 */
export interface AdminProductSheetProps {
  /** `null` = feuille fermée. Le composant gère lui-même l'état « rien à montrer ». */
  product: ProductAdmin | null
  onClose: () => void
  /** surcharge du libellé de statut (la modération affiche « En attente », pas `PENDING`) */
  statusLabel?: string
  actions?: ReactNode
}

/**
 * Statut produit → kind de badge. Les clés sont les **valeurs réelles de l'API**
 * (`productStatuses` = PENDING · AVAILABLE · RESERVED · SOLD · REJECTED) : une
 * clé `APPROVED` ne correspondait à rien et laissait un article **publié** en
 * `neutral` (gris, indistinct d'un inactif). Indexée par `ProductStatus` pour
 * qu'un statut serveur inconnu soit un défaut de compilation, pas un trou muet.
 */
const STATUS_KIND: Record<ProductStatus, StatusBadgeKind> = {
  PENDING: 'pending',
  AVAILABLE: 'approved',
  RESERVED: 'reserved',
  SOLD: 'sold',
  REJECTED: 'rejected',
}

export function AdminProductSheet({ product, onClose, statusLabel, actions }: AdminProductSheetProps) {
  // `Modal` ne rend rien quand `open` est false ; on concentre ici la garde pour
  // que tout le JSX ci-dessous typed `product` comme non-null.
  if (!product) return null
  const images = product.images ?? []
  // Double sécurité : `STATUS_KIND` est `Record<ProductStatus, …>` → ajouter un
  // statut à l'API casse la compilation (choix explicite d'un badge). Mais la
  // donnée vient du **réseau** : sans repli, un statut inconnu produirait
  // `KINDS[undefined]` et un badge au class `undefined` (silencieux). On garde
  // donc `neutral` en garde-fou d'affichage.
  const kind = STATUS_KIND[product.status] ?? 'neutral'

  return (
    <Modal open={Boolean(product)} onClose={onClose} size="xl">
      <div className="grid gap-6 max-[968px]:grid-cols-1">
        {/* Aperçu — en PREMIER sur mobile (l'utilisateur décide sur l'image) */}
        <div className="max-[968px]:order-1">
          {images[0] ? (
            <ResilientImg
              src={resolveImageUrl(images[0].url)}
              alt={product.name}
              className="h-[240px] w-full rounded-md object-cover"
            />
          ) : (
            <div className="flex h-[240px] w-full items-center justify-center rounded-md bg-ivory text-4xl text-faint">
              <i className="fas fa-image" aria-hidden="true" />
            </div>
          )}

          {images.length > 1 && (
            <>
              <p aria-live="polite" className="mt-2 text-xs text-muted">
                {images.length} photo{images.length > 1 ? 's' : ''}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <li key={img.id}>
                    <ResilientImg
                      src={resolveImageUrl(img.url)}
                      alt={`${product.name} — photo ${i + 1}`}
                      loading="lazy"
                      className={`h-16 w-16 rounded-sm object-cover ${
                        i === 0 ? 'border-2 border-terracotta-strong' : 'border-2 border-transparent'
                      }`}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Catégorie</dt>
              <dd className="mt-1 truncate text-sm font-medium text-ink">
                {product.subcategory?.name ?? product.category?.name ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">État</dt>
              <dd className="mt-1 truncate text-sm font-medium text-ink">{product.condition}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Localisation</dt>
              <dd className="mt-1 truncate text-sm font-medium text-ink">{product.location}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Vendeur</dt>
              <dd className="mt-1 truncate text-sm font-medium text-ink">{product.owner?.displayName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Téléphone</dt>
              <dd className="tabular mt-1 truncate text-sm font-medium text-ink">{product.owner?.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Soumis le</dt>
              <dd className="mt-1 text-sm font-medium text-ink">
                {formatDate(product.createdAt)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Modération — les actions viennent de la page (CA-V5-048) */}
        <div className="max-[968px]:order-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Modération</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge kind={kind} label={statusLabel ?? product.status} dot />
            <span className="tabular text-[19px] font-bold text-ink">{formatFcfa(product.price)}</span>
          </div>

          {product.description && (
            <>
              <h3 className="mt-5 text-xs font-semibold tracking-wide text-muted uppercase">Description</h3>
              <p className="mt-1 text-sm whitespace-pre-line text-ink">{product.description}</p>
            </>
          )}

          {product.rejectionReason && (
            <p className="mt-4 rounded-sm bg-danger-soft px-4 py-3 text-sm text-danger">
              <span className="font-semibold">Motif du refus : </span>
              {product.rejectionReason}
            </p>
          )}

          {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-line pt-5">
        <Button variant="outline" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </Modal>
  )
}
