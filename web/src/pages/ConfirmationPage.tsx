import { Link } from 'react-router'
import { Crumb, SiteEmpty } from '../components/site/SiteBits'

/**
 * Page confirmation après soumission — gabarit `.empty` de la maquette
 * (même structure que `NotFound()` : `.wrap` > `Crumb` > `.section` > `.empty`).
 * `SiteEmpty` ne gère qu'une action : le second lien « Retour à l'accueil »
 * est rendu à côté du bloc, dans le même `.section` (`.rv-empty-extra`).
 */
export function ConfirmationPage() {
  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Confirmation' }]} />
      <div className="section">
        <SiteEmpty
          icon="circle-check"
          level={1}
          title="Article soumis avec succès !"
          action={{ label: 'Voir mes articles', to: '/mes-articles' }}
        >
          Votre article a été envoyé à l'administrateur pour vérification. Vous serez notifié dès qu'il sera approuvé.
        </SiteEmpty>
        <div className="rv-empty-extra">
          <Link to="/" className="btn ghost">Retour à l'accueil</Link>
        </div>
      </div>
    </div>
  )
}
