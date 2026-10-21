import { ApiError } from '../../lib/api'
import { Button } from './Button'

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
        <i className="fas fa-circle-exclamation mt-1" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold whitespace-pre-line">{message}</p>
          {showCode && apiError && <p className="mt-1 text-xs opacity-80">Code : {apiError.code}</p>}
        </div>
      </div>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick} loading={loading}>
          <i className="fas fa-rotate-left" aria-hidden="true" /> {action.label}
        </Button>
      )}
    </div>
  )
}
