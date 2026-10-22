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
 *
 * Marque : « ReVends » (capital V unique), pas « REVENDS » ni « Le Cœur couture ».
 * Six familles (Mode, Chaussures, Sacs, Tech, Maison, Loisirs).
 * Liens sociaux : placeholders vers les vrais profils (target="_blank").
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
            <div className="logo">Re<span className="text-terracotta-ink">V</span>ends.</div>
            <p className="tagline">Les belles choses méritent une nouvelle histoire.</p>
          </div>

          <Col title="Découvrir">
            <Link to="/search">Tout le catalogue</Link>
            <Link to="/category/mode">Mode</Link>
            <Link to="/category/mode-chaussures">Chaussures</Link>
            <Link to="/category/mode-sacs">Sacs</Link>
            <Link to="/category/electronique">Tech</Link>
            <Link to="/category/maison">Maison & déco</Link>
            <Link to="/category/loisirs">Loisirs</Link>
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
          <span>© {year} Re<span className="text-terracotta-ink">V</span>ends — Tous droits réservés.</span>
          <div className="socials">
            <Link to="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram (s'ouvre dans un nouvel onglet)">
              <Ico name="instagram" cls="sm" />
            </Link>
            <Link to="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook (s'ouvre dans un nouvel onglet)">
              <Ico name="facebook" cls="sm" />
            </Link>
            <Link to="https://tiktok.com" target="_blank" rel="noopener noreferrer" aria-label="TikTok (s'ouvre dans un nouvel onglet)">
              <Ico name="tiktok" cls="sm" />
            </Link>
          </div>
        </div>
      </div>

      <LogoutConfirm open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </footer>
  )
}