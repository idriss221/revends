import type { OrderEvent, OrderStatus } from '../../lib/types'
import { ORDER_STEPS, ORDER_STATUS_LABELS } from '../../lib/constants'
import { formatDateTime } from '../../lib/format'

function isFailure(status: OrderStatus): boolean {
  return status === 'CANCELLED' || status === 'PAYMENT_FAILED'
}

/** Position de la marche courante = dernier évènement (ordre du backend). */
function stepsReached(event: OrderEvent | null): number {
  if (!event) return 0
  return ORDER_STEPS.indexOf(event.toStatus) + 1
}

function isStepReached(status: OrderStatus, events: OrderEvent[]): boolean {
  return events.some((e) => e.toStatus === status)
}

function eventLabel(toStatus: OrderStatus): string {
  if (toStatus === 'CANCELLED') return 'Commande annulée'
  if (toStatus === 'PAYMENT_FAILED') return 'Paiement échoué'
  return ORDER_STATUS_LABELS[toStatus]
}

function actorLabel(actor: OrderEvent['actor']): string {
  switch (actor) {
    case 'system':
      return 'Automatique'
    case 'admin':
      return 'Équipe'
    default:
      return 'Utilisateur'
  }
}

/**
 * Cycle de commande — DA §3.10 (spec-admin §6-8, bloc 4).
 *
 * Nœuds (l'information n'est **jamais** portée par la couleur seule) :
 * atteinte `bg-positive-soft` + coche · courante `bg-terracotta` + pastille
 * (anneau pulsé) · à venir `bg-white border-line` + numéro · échec
 * `bg-danger-soft` + croix. Rail continu `bg-line`.
 *
 * Exception I4 (revue) : le DA prescrit LITTÉRALEMENT ce markup Tailwind +
 * Font Awesome au §3.10 — la maquette `Bureau/main` n'a aucun écran de suivi
 * de commande. Icônes FA ici = conformité DA, pas de dette à « re-siter ».
 */
export function OrderTimeline({ events }: { events: OrderEvent[] }) {
  const last = events[events.length - 1] ?? null
  const failed = last ? isFailure(last.toStatus) : false

  return (
    <div className="w-full">
      <ol className="relative">
        <span aria-hidden="true" className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-line" />
        {ORDER_STEPS.map((status, i) => {
          const reached = isStepReached(status, events)
          const ev = events.find((e) => e.toStatus === status) ?? null
          const isCurrent = last?.toStatus === status && !failed
          const dimmed = failed && !reached
          const node = isCurrent
            ? 'bg-terracotta text-white ring-4 ring-terracotta-glow animate-pulse'
            : reached
              ? 'bg-positive-soft text-positive'
              : dimmed
                ? 'bg-danger-soft text-danger'
                : 'border border-line bg-white text-muted'
          return (
            <li key={status} className="relative flex gap-4 pb-7 last:pb-0">
              <span className={`relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-bold ${node}`}>
                {isCurrent ? (
                  <i className="fas fa-circle-dot text-[10px]" aria-hidden="true" />
                ) : reached ? (
                  <i className="fas fa-check text-[10px]" aria-hidden="true" />
                ) : dimmed ? (
                  <i className="fas fa-xmark text-[10px]" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[15px] font-bold ${reached || isCurrent ? 'text-ink' : 'text-muted'}`}>
                  {ORDER_STATUS_LABELS[status]}
                  {isCurrent && <span className="sr-only"> (étape en cours)</span>}
                </p>
                {ev ? (
                  <time dateTime={ev.createdAt} className="mt-0.5 block text-[13px] text-muted">
                    {formatDateTime(ev.createdAt)}
                  </time>
                ) : null}
                {ev?.note ? <p className="mt-1 text-sm text-muted">{ev.note}</p> : null}
              </div>
            </li>
          )
        })}
      </ol>

      {failed && last ? (
        <div className="mt-2 flex items-start gap-3 rounded-md bg-danger-soft p-4">
          <i className="fas fa-triangle-exclamation mt-0.5 text-danger" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-danger">{eventLabel(last.toStatus)}</p>
            <p className="mt-1 text-sm text-danger">{last.note ?? 'Cette commande ne peut pas continuer.'}</p>
          </div>
        </div>
      ) : null}

      {!failed && events.length > 0 ? (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium text-muted transition-colors hover:text-ink">
            <i className="fa-solid fa-clock-rotate-left mr-1.5 text-xs" aria-hidden="true" />
            Historique détaillé ({events.length})
          </summary>
          <ul className="mt-3 space-y-2 border-l-2 border-line pl-4">
            {events.map((ev) => (
              <li key={ev.id} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-ink">{eventLabel(ev.toStatus)}</span>
                  <time dateTime={ev.createdAt} className="text-[13px] text-muted">
                    {formatDateTime(ev.createdAt)}
                  </time>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{actorLabel(ev.actor)}</span>
                </div>
                {ev.note ? <p className="mt-0.5 text-muted">{ev.note}</p> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!failed ? (
        <p className="mt-4 text-right text-[13px] text-muted">
          {stepsReached(last)} / {ORDER_STEPS.length} étapes franchies
        </p>
      ) : null}
    </div>
  )
}
