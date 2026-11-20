import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Crumb, SiteEmpty } from '../components/site/SiteBits'
import { HeartLoader } from '../components/ui/HeartLoader'
import { Notice } from '../components/ui/Notice'
import { WaveCheckoutPanel } from '../components/storefront/WaveCheckoutPanel'
import { storefrontApi, storefrontError } from '../lib/storefront'

/**
 * V9 — E4 : `/paiement-wave/echec`.
 *
 * Aucune écriture au montage, aucun paramètre de requête, aucune déduction
 * sur un éventuel débit (seul Wave le sait). Le formulaire manuel et les 3
 * liens hébergés restent le seul repli.
 */
export function WaveEchec() {
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

  return shell(
    <>
      <h1 className="rv-shop-h1">Le paiement Wave n’a pas abouti</h1>

      <div role="alert" className="wave-return-error">
        <Notice tone="danger">
          Wave n’a pas confirmé ce paiement. Votre abonnement reste en attente et aucune activation n’a été effectuée.
        </Notice>
      </div>

      <h2 className="rv-shop-h2 wave-return-subtitle">Choisissez votre repli</h2>

      <div className="wave-return-actions">
        <Link className="btn terra" to="/mon-abonnement">
          Voir le paiement manuel
        </Link>
        <Link className="rv-shop-shop-link" to="/shop">
          Retour au catalogue
        </Link>
      </div>

      <WaveCheckoutPanel waveEnabled={false} subscription={null} mode="liens-seuls" />

      <p className="wave-checkout-note">
        Si vous avez utilisé un lien Wave, l’administration vérifiera votre paiement dans le portail Wave ; votre
        boutique restera en attente jusqu’à confirmation.
      </p>

      <p className="wave-return-support">
        Si le montant a été débité, écrivez à revendsen@gmail.com.
      </p>
    </>,
  )
}
