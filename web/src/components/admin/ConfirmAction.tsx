import type { ReactNode } from 'react'
import { Modal, type ModalSize } from '../ui/Modal'
import { Button, type ButtonVariant } from '../ui/Button'

/**
 * Modale d'action — spec-admin §4.4 (D3). **Point d'entrée unique** des 5
 * modales d'action : corps, pied, bandeau et vocabulaire identiques.
 *
 * Le bandeau `urgency` reprend exactement les 4 tons de `Notice` (D10) — d'où
 * l'absence de bleu décoratif (DA §9.5) : l'information « attention » est
 * champagne-soft + chocolat, l'erreur danger-soft + danger.
 *
 * **Vocabulaire fermé (RG-V5-08)** : `ConfirmDelete` porte le préréglage exact du
 * spec (titre, ton, urgence, conséquences). Ne jamais improvised un libellé
 * d'action : l'utilisateur doit reconnaître le même verbe partout.
 */
const TONE: Record<'info' | 'warning' | 'danger' | 'success', string> = {
  info: 'bg-champagne-soft text-chocolate',
  warning: 'bg-champagne-soft text-chocolate',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-positive-soft text-positive',
}

const ICON: Record<'info' | 'warning' | 'danger' | 'success', string> = {
  info: 'fa-circle-info',
  warning: 'fa-triangle-exclamation',
  danger: 'fa-triangle-exclamation',
  success: 'fa-circle-check',
}

export interface ConfirmActionProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  confirmLabel: string
  loading?: boolean
  dismissable?: boolean
  message: ReactNode
  /** « ce qui va se passer » — énuméré, jamais FLOAT */
  consequences?: { icon: string; text: string }[]
  urgency?: 'none' | 'info' | 'warning' | 'danger' | 'success'
  tone?: ButtonVariant
  children?: ReactNode
  size?: ModalSize
  confirmDisabled?: boolean
}

export function ConfirmAction({
  open,
  onClose,
  onConfirm,
  title,
  confirmLabel,
  loading = false,
  dismissable = true,
  message,
  consequences,
  urgency = 'none',
  tone = 'secondary',
  children,
  size = 'sm',
  confirmDisabled = false,
}: ConfirmActionProps) {
  return (
    <Modal open={open} title={title ?? ''} onClose={onClose} size={size} dismissable={dismissable}>
      {urgency !== 'none' ? (
        <div className={`mb-5 flex items-start gap-3 rounded-sm px-4 py-3.5 text-sm ${TONE[urgency]}`}>
          <i className={`fas ${ICON[urgency]} mt-0.5 shrink-0`} aria-hidden="true" />
          <div>
            {message}
            {consequences && consequences.length > 0 && (
              <ul className="mt-2 space-y-1">
                {consequences.map((c) => (
                  <li key={c.text} className="flex items-start gap-2">
                    <i className={`fas ${c.icon} mt-1 shrink-0 text-[10px]`} aria-hidden="true" />
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-5 text-sm text-muted">{message}</div>
      )}
      {children}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Annuler
        </Button>
        <Button variant={tone} loading={loading} disabled={confirmDisabled} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Suppression d'un article — préréglage imposé par le spec §4.4 / §6-9.
 * `consequences` est **obligatoire** : une suppression sans énumération de ses
 * effets est un dark pattern (l'utilisateur ne sait pas ce qu'il perd).
 */
export function ConfirmDelete({
  open,
  onClose,
  onConfirm,
  loading = false,
  dismissable = true,
  productName,
  confirmDisabled = false,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  loading?: boolean
  dismissable?: boolean
  productName: string
  confirmDisabled?: boolean
}) {
  return (
    <ConfirmAction
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
      dismissable={dismissable}
      confirmDisabled={confirmDisabled}
      title="Cette action est irréversible"
      confirmLabel="Supprimer l'article"
      tone="danger"
      urgency="danger"
      message={
        <>
          <span className="block font-semibold">« {productName} » sera définitivement supprimé.</span>
        </>
      }
      consequences={[
        { icon: 'fa-eye-slash', text: "L'article quitte le catalogue et n'est plus achetable." },
        { icon: 'fa-bell', text: 'Le vendeur est prévenu par notification.' },
        { icon: 'fa-ban', text: 'Aucune restauration possible : cette action est définitive.' },
      ]}
    />
  )
}
