import { Link } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { Ico } from '../brand/Ico'

/**
 * Retour vers l'espace d'administration, visible UNIQUEMENT pour un admin.
 *
 * Le lien « Voir la boutique » de la barre latérale admin quitte la coquille
 * `/admin` : sans ce bouton, l'administrateur se retrouvait dans le site public
 * sans aucun chemin de retour (il devait retaper l'URL).
 *
 * Pastille flottante en bas à gauche — loin du bouton « retour en haut » et du
 * toast (centré), au-dessus du contenu mais sous les feuilles mobiles.
 */
export function AdminReturn() {
  const { user } = useAuth()
  if (user?.role !== 'admin') return null

  return (
    <Link
      to="/admin"
      className="admin-return"
      aria-label="Revenir à l'espace administrateur"
      title="Revenir à l'espace administrateur"
    >
      <Ico name="gear" cls="sm" />
      <span>Espace admin</span>
    </Link>
  )
}
