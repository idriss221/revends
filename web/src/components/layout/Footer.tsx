import { Link } from 'react-router'
import { Ico } from '../brand/Ico'

/**
 * Pied de page — design premium ReVends
 * Structure : logo + tagline, 4 colonnes, bas de page social
 */

export function Footer() {
  return (
    <footer className="site">
      <div className="wrap">
        <div className="top">
          <div>
            <div className="logo">Re<span className="text-terracotta-ink">V</span>ends.</div>
            <p className="tagline">Les belles choses méritent une nouvelle histoire.</p>
          </div>

          <div className="col">
            <h4>Explorer</h4>
            <Link to="/search">Tout le catalogue</Link>
            <Link to="/category/mode">Mode</Link>
            <Link to="/category/mode-chaussures">Chaussures</Link>
            <Link to="/category/mode-sacs">Sacs</Link>
            <Link to="/category/electronique">Tech</Link>
            <Link to="/category/maison">Maison</Link>
            <Link to="/category/loisirs">Loisirs</Link>
          </div>

          <div className="col">
            <h4>Vendre</h4>
            <Link to="/sell">Publier un article</Link>
            <Link to="/mes-articles">Mes annonces</Link>
            <Link to="/favoris">Mes favoris</Link>
            <Link to="/panier">Mon panier</Link>
          </div>

          <div className="col">
            <h4>Aide</h4>
            <Link to="/faq">FAQ</Link>
            <Link to="/livraison">Livraison</Link>
            <Link to="/paiement">Paiement</Link>
            <Link to="/securite">Sécurité</Link>
          </div>

          <div className="col">
            <h4>ReVends</h4>
            <Link to="/apropos">À propos</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/presse">Presse</Link>
            <Link to="/carrieres">Carrières</Link>
          </div>
        </div>

        <div className="bottom">
          <span>© {new Date().getFullYear()} ReVends — Tous droits réservés.</span>
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
            <Link to="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn (s'ouvre dans un nouvel onglet)">
              <Ico name="linkedin" cls="sm" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}