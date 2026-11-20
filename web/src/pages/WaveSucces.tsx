import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Crumb, SiteEmpty } from '../components/site/SiteBits'
import { HeartLoader } from '../components/ui/HeartLoader'
import { Notice } from '../components/ui/Notice'
import { StatusBadge } from '../components/ui/StatusBadge'
import { WaveChip } from '../components/storefront/WaveCheckoutPanel'
import { storefrontApi, storefrontError } from '../lib/storefront'

/**
 * V9 — E3 : `/paiement-wave/succes`.
 *
 * Page de RETOUR navigateur : aucune écriture, aucun paramètre de requête lu,
 * aucune activation. Le seul appel est `GET /api/subscriptions/me` (lecture).
 * Tant que le webhook signé n'est pas reçu, le libellé reste « en attente ».
 */
export function WaveSucces() {
  const me = useQuery({
    queryKey: ['my-subscription'],
    queryFn: () => storefrontApi.mySubscription(),
    staleTime: 0,
    retry: false,
  })

  const shell = (children: React.ReactNode) => (
    <div className="wrap">
      <Crumb items={[{ label: 'Mon abonnement' }]} />
      <div className="section tight wave-return-page">{children}</div>
    </div>
  )

  if (me.isPending) {
    return shell(
      <div aria-live="polite">
        <HeartLoader size="sm" label="Vérification de votre abonnement…" />
      </div>,
    )
  }

  if (me.isError) {
    return shell(
      <SiteEmpty
        icon="triangle-exclamation"
        level={1}
        role="alert"
        title="Impossible de vérifier votre abonnement"
        action={{ label: 'Réessayer', onClick: () => void me.refetch() }}
        style={{ maxWidth: '640px', marginInline: 'auto' }}
      >
        {storefrontError(me.error, 'Réessayez dans un instant.')}
      </SiteEmpty>,
    )
  }

  const subscription = me.data?.subscription ?? null
  const isActive = subscription?.status === 'ACTIVE'

  return shell(
    <>
      <span className="eyebrow">Paiement Wave</span>
      <h1 className="rv-shop-h1">Retour de Wave</h1>

      <div className="wave-return-badges">
        <WaveChip />
        {/* Le badge « en attente » et sa pastille pulsée s'arrêtent dès que /me
            indique ACTIVE (design V9 §3 E3 / §6). Aucun abonnement = aucun
            paiement à confirmer : le badge n'a pas lieu d'être non plus. */}
        {subscription && !isActive && (
          <StatusBadge
            kind="pending"
            dot
            label="Wave — en attente de confirmation du paiement"
            className="wave-status-badge"
          />
        )}
      </div>

      {subscription ? (
        <p className="rv-shop-sub wave-return-message">
          {isActive
            ? 'Votre abonnement est à jour. Retrouvez votre boutique depuis « Mon abonnement ».'
            : 'Votre paiement est en attente de confirmation de la part de Wave. Votre abonnement reste en attente : il sera activé automatiquement dès que le paiement sera confirmé.'}
        </p>
      ) : (
        <p className="rv-shop-sub wave-return-message">Aucun abonnement en cours.</p>
      )}

      <Notice tone="info" className="wave-return-notice">
        Vous pouvez fermer cette page. Aucune action de votre part n'est nécessaire pour l'activation.
      </Notice>

      <div className="wave-return-actions">
        <Link className="btn terra" to="/mon-abonnement">
          Voir mon abonnement
        </Link>
        <Link className="rv-shop-shop-link" to="/shop">
          Retour au catalogue
        </Link>
      </div>
    </>,
  )
}
