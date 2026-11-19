import { useMutation } from '@tanstack/react-query'
import { Notice } from '../ui/Notice'
import { WAVE_HOSTED_LINKS, waveApi } from '../../lib/wave'
import type { Subscription } from '../../lib/storefront.types'

/**
 * V9 — E1 : panneau Wave ajouté avant le formulaire manuel existant.
 *
 * Règles fortes :
 * - le bouton n'existe dans le DOM que si `waveEnabled` ET souscription PENDING
 *   ET `wavePaymentPending === true` (fail-closed, pas de `disabled` grisé) ;
 * - un clic = une requête serveur puis une navigation navigateur de premier niveau ;
 * - les 3 liens hébergés sont un repli statique : aucun clic n'appelle l'API ;
 * - aucune donnée de paiement, aucun montant calculé, aucun secret côté front.
 */

export function WaveChip({ className = '' }: { className?: string }) {
  return (
    <span className={`wave-chip ${className}`.trim()} data-stagger="0">
      Wave
    </span>
  )
}

type WavePanelMode = 'liens-seuls' | 'session' | 'indisponible'

export interface WaveCheckoutPanelProps {
  waveEnabled: boolean
  subscription: Subscription | null
  /** `liens-seuls` force le repli (utilisé par la page de retour d'échec). */
  mode?: 'auto' | 'liens-seuls'
  className?: string
}

function resolveMode(waveEnabled: boolean, subscription: Subscription | null, mode: 'auto' | 'liens-seuls'): WavePanelMode {
  if (mode === 'liens-seuls') return 'liens-seuls'
  if (!waveEnabled || !subscription) return 'liens-seuls'
  if (subscription.status === 'PENDING' && subscription.wavePaymentPending === true) return 'session'
  return 'indisponible'
}

/** Les 3 liens restent cliquables dans tous les modes, y compris en cas d'erreur API. */
function HostedLinks() {
  return (
    <div className="wave-hosted-links">
      <p className="wave-hosted-title">Ou payer depuis un lien Wave</p>
      <ul className="wave-hosted-list">
        {WAVE_HOSTED_LINKS.map((link) => (
          <li key={link.href}>
            <a className="wave-hosted-link" href={link.href} target="_blank" rel="noopener noreferrer">
              <span>{link.label}</span>
              <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function WaveCheckoutPanel({
  waveEnabled,
  subscription,
  mode = 'auto',
  className = '',
}: WaveCheckoutPanelProps) {
  const resolved = resolveMode(waveEnabled, subscription, mode)

  const checkout = useMutation({
    mutationFn: (subscriptionId: string) => waveApi.createCheckoutSession(subscriptionId),
    onSuccess: (result) => {
      window.location.assign(result.waveLaunchUrl)
    },
  })

  return (
    <section className={`wave-checkout-panel rv-shop-panel ${className}`.trim()} aria-labelledby="wave-checkout-title">
      <div className="wave-checkout-head">
        <WaveChip />
        <h2 id="wave-checkout-title" className="wave-checkout-title">
          Paiement Wave
        </h2>
      </div>

      {checkout.isError && (
        <div role="alert" className="wave-checkout-error">
          <Notice tone="danger">
            Impossible d'ouvrir Wave pour le moment. Le paiement manuel reste disponible ci-dessous.
          </Notice>
        </div>
      )}

      {resolved === 'session' && subscription && (
        <>
          <button
            type="button"
            className="btn terra block wave-cta"
            aria-busy={checkout.isPending}
            disabled={checkout.isPending}
            onClick={() => checkout.mutate(String(subscription.id))}
          >
            {checkout.isPending ? 'Ouverture de Wave…' : 'Payer avec Wave'}
          </button>
          <p className="wave-checkout-description">
            Vous allez quitter ReVendsen pour régler votre abonnement sur Wave. L'activation intervient après
            confirmation du paiement.
          </p>
        </>
      )}

      <HostedLinks />

      <p className="wave-checkout-note">
        {resolved === 'liens-seuls'
          ? "Après votre paiement, utilisez le formulaire ci-dessous pour indiquer la référence. L'administration vérifiera avant d'ouvrir votre boutique."
          : 'Ces liens sont un repli manuel : saisissez ensuite la référence dans le formulaire ci-dessous.'}
      </p>
    </section>
  )
}
