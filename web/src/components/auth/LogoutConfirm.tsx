import { useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { Modal } from '../ui/Modal'

/**
 * Confirmation de déconnexion — recette `react-auth.spec.ts` §2.
 *
 * La maquette déconnecte d'un clic (toast seul) ; l'app React garde une
 * **confirmation** (décision produit antérieure, `docs/journal.md`) car la
 * déconnexion se fait désormais depuis des zones exposées en permanence
 * (pied de page « Mon compte », menu mobile). Le déclencheur est posé par
 * l'appelant — seul ce composant connaît la modale.
 *
 * La maquette n'a PAS de bouton de déconnexion dans l'en-tête : il vit dans
 * le pied de page (`<a data-logout>`, colonne « Mon compte ») et dans
 * `.mlogout` du menu mobile. On suit exactement ces deux emplacements.
 */
export function LogoutConfirm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const confirm = async () => {
    onClose()
    await logout()
    navigate('/')
  }

  return (
    <Modal open={open} title="Se déconnecter" onClose={onClose} size="sm">
      <p className="text-sm leading-relaxed text-muted">
        Votre session sera fermée sur cet appareil. Vos articles, vos favoris et votre panier vous
        retrouveront à la prochaine connexion.
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-full border border-line-strong px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-ink/5"
        >
          Rester connecté
        </button>
        <button
          type="button"
          onClick={confirm}
          className="cursor-pointer rounded-full bg-terracotta-strong px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-terracotta-deep"
        >
          Se déconnecter
        </button>
      </div>
    </Modal>
  )
}
