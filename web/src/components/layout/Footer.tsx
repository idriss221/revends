import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { LogoutConfirm } from '../auth/LogoutConfirm'
import { Ico } from '../brand/Ico'

/**
 * Pied de page — reproduction du `<footer class="site">` de
 * `Bureau/main/index.html` (3 colonnes + bas de page social).
 * Les liens pointent vers des **routes réelles** de l'app React.
 *
 * La maquette rend la déconnexion de la colonne « Mon compte » par
 * `<a href="#/login" data-logout hidden>` (masqué hors session) : on garde
 * EXACTEMENT cet emplacement et cette visibilité, avec un `<button>` (contrôle
 * d'action, ouvre la confirmation) et l'`aria-label` verrouillé par la recette.
 */

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="col">
      <h4>{title}</h4>
      {children}
    </div>
  )
}

export function Footer() {
  const { user } = useAuth()
  const year = new Date().getFullYear()
  const [logoutOpen, setLogoutOpen] = useState(false)

  return (
    <footer className="site">
      <div className="wrap">
        <div className="top">
          <div>
            <div className="logo">REVENDS.</div>
            <p className="tagline">Les belles choses méritent une nouvelle histoire.</p>
          </div>

          <Col title="Découvrir">
            <Link to="/search">Tout le catalogue</Link>
            <Link to="/category/mode">Mode</Link>
            <Link to="/category/electronique">Téléphones &amp; tech</Link>
            <Link to="/category/maison">Maison &amp; décoration</Link>
          </Col>

          <Col title="Vendre">
            <Link to="/sell">Publier un article</Link>
            <Link to="/mes-articles">Mes annonces</Link>
            <Link to="/favoris">Mes favoris</Link>
            <Link to="/panier">Mon panier</Link>
          </Col>

          <Col title="Mon compte">
            {user ? (
              <>
                <Link to="/profil">Mon espace</Link>
                <Link to="/mes-commandes">Mes commandes</Link>
                <Link to="/mes-articles">Mes articles</Link>
                <Link to="/notifications">Notifications</Link>
                <button type="button" aria-label="Se déconnecter" onClick={() => setLogoutOpen(true)}>
                  Se déconnecter
                </button>
              </>
            ) : (
              <>
                <Link to="/login">Se connecter</Link>
                <Link to="/register">Créer un compte</Link>
                <Link to="/conditions">Conditions générales</Link>
                <Link to="/confidentialite">Confidentialité</Link>
              </>
            )}
          </Col>
        </div>

        <div className="bottom">
          <span>© {year} REVENDS — Tous droits réservés.</span>
          {/* LIAISONS SOCIALES — fidélité à la maquette : celle-ci pointe
              `href="#/"` avec `aria-label="Instagram/Facebook/TikTok"` (liens
              témoins). On reproduit tel quel `<Link to="/">`. À CONFIRMER
              côté client : fournir les vraies URL de profil pour remplacer
              ces placeholders (sinon on conserve le rendu de la référence). */}
          <div className="socials">
            <Link to="/" aria-label="Instagram">
              <Ico name="instagram" cls="sm" />
            </Link>
            <Link to="/" aria-label="Facebook">
              <Ico name="facebook" cls="sm" />
            </Link>
            <Link to="/" aria-label="TikTok">
              <Ico name="tiktok" cls="sm" />
            </Link>
          </div>
        </div>
      </div>

      <LogoutConfirm open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </footer>
  )
}
