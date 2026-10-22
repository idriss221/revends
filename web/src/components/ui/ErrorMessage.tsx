import { ApiError } from '../../lib/api'
import { Button } from './Button'
import { Ico } from '../brand/Ico'

interface ErrorMessageProps {
  error: unknown
  /** afficher aussi le code machine (ex. PRODUCT_RESERVED) — utile pour le support */
  showCode?: boolean
  /** action de rattrapage — tout état d'erreur doit être rattrapable (RG-V5-08) */
  action?: { label: string; onClick: () => void }
  loading?: boolean
}

/**
 * Alerte erreur — `bg-danger-soft text-danger`, rayon token `sm` (12 px),
 * `role="alert"` (DA §8). Le bouton « Réessayer » vit à droite : l'erreur n'est
 * jamais une impasse muette.
 * Utilise les jetons de design system et Ico (pas Font Awesome).
 */
export function ErrorMessage({ error, showCode = false, action, loading = false }: ErrorMessageProps) {
  const apiError = error instanceof ApiError ? error : null
  const message = apiError?.readableMessage() ?? (error instanceof Error ? error.message : 'Une erreur est survenue.')
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start justify-between gap-4 rounded-sm bg-danger-soft px-4 py-3.5 text-danger"
    >
      <div className="flex items-start gap-3">
        <Ico name="circle-info" cls="sm" aria-hidden="true" style={{ marginTop: 2 }} />
        <div>
          <p className="text-sm font-semibold whitespace-pre-line">{message}</p>
          {showCode && apiError && <p className="mt-1 text-xs opacity-80">Code : {apiError.code}</p>}
        </div>
      </div>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick} loading={loading} icon="rotate-left">
          {action.label}
        </Button>
      )}
    </div>
  )
}