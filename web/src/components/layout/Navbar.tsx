import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { useFavorites } from '../../context/FavoritesContext'
import { useTheme } from '../../context/ThemeContext'
import { LogoutConfirm } from '../auth/LogoutConfirm'
import { univers } from '../../lib/menus'
import { Ico } from '../brand/Ico'
import { SearchSuggest } from './SearchSuggest'
import { suggestionsLoader } from './suggestions'

/**
 * En-tête UNIQUE du site — reproduction du `<header class="site">` de
 * `Bureau/main/index.html`.
 *
 * · desktop : logo · 6 univers (`nav.cats`) · recherche · actions (Vendre,
 *   favoris, panier, compte, thème) ;
 * · `< 760 px` : `.hide-m` masque « Vendre » et « favoris », et le `.burger`
 *   ouvre le menu plein écran `.mmenu` ;
 * · l'icône compte vaut `i-login` pour un visiteur et `i-user-check` pour un
 *   membre (comme `syncAccountBtn()` de la maquette).
 */

/** Rejoue l'animation `badgePop` dès que le compteur augmente. */
function usePopWhenUp(value: number): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null)
  const prev = useRef(value)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (value > prev.current) {
      el.classList.remove('pop')
      void el.offsetWidth
      el.classList.add('pop')
    }
    prev.current = value
  }, [value])
  return ref
}

function Badge({ value, label }: { value: number; label: string }) {
  const ref = usePopWhenUp(value)
  return (
    <b className="badge" ref={ref} data-n={value}>
      {value}
      {/* `.sr` = visually-hidden de la maquette (`bureau.css`, scopé
          `.market-site`) : ici on reste dans le public. Attention :
          `sr-only` existe aussi — il vient de Font Awesome (chargé globalement),
          pas de Tailwind. Les composants RENDUS EN ADMIN (Loading,
          OrderTimeline) doivent donc utiliser `sr-only` sinon le texte
          s'affiche en clair (`.sr` est invisible hors `.market-site`). */}
      <span className="sr">{label}</span>
    </b>
  )
}

export function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { count: cartCount } = useCart()
  const { count: favCount } = useFavorites()
  const { isDark, toggleTheme } = useTheme()

  const urlQ = new URLSearchParams(location.search).get('q') ?? ''
  const [query, setQuery] = useState(urlQ)
  useEffect(() => setQuery(urlQ), [urlQ])

  const [menuMounted, setMenuMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const openMenu = () => {
    setMenuMounted(true)
    requestAnimationFrame(() => setMenuOpen(true))
  }
  const closeMenu = () => {
    setMenuOpen(false)
    window.setTimeout(() => setMenuMounted(false), 260)
  }
  useEffect(() => {
    closeMenu()
    // (aucune dépendance manquante : `closeMenu` ne capture que des setters
    //  de l'état local — pas d'ESLint dans ce projet, commentaire mort retiré.)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const submitSearch = () => {
    const q = query.trim()
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
  }

  // La maquette n'a PAS de bouton de déconnexion dans l'en-tête : on ouvre
  // uniquement la confirmation, déclenchée depuis le menu mobile (le pied de
  // page porte l'autre déclencheur, comme `<a data-logout>` de la maquette).
  const [logoutOpen, setLogoutOpen] = useState(false)

  const accountTo = user ? '/profil' : '/login'
  const themeLabel = isDark ? 'Activer le thème clair' : 'Activer le thème sombre'
  const themeTitle = isDark ? 'Thème clair' : 'Thème sombre'

  return (
    <>
      <header className="site">
        <div className="wrap bar">
          <Link className="logo" to="/" aria-label="REVENDS, accueil">
            REVENDS<b>.</b>
          </Link>

          <nav className="cats" aria-label="Univers">
            {univers.map((u) => (
              <Link
                key={u.slug}
                to={`/category/${u.slug}`}
                data-cat={u.slug}
                className={location.pathname === `/category/${u.slug}` ? 'on' : undefined}
                aria-current={location.pathname === `/category/${u.slug}` ? 'page' : undefined}
              >
                {u.label}
              </Link>
            ))}
          </nav>

          <SearchSuggest
            id="q"
            value={query}
            onChange={setQuery}
            onSubmit={submitSearch}
            load={suggestionsLoader}
          />

          <div className="hacts">
            <Link className="btn sm hide-m" to="/sell">
              <Ico name="plus" cls="sm" />
              Vendre
            </Link>

            <Link className="ic hide-m" to="/favoris" aria-label={favCount ? `Favoris (${favCount} article${favCount > 1 ? 's' : ''})` : 'Favoris'}>
              <Ico name="heart" />
              <Badge value={favCount} label={`${favCount} favori(s)`} />
            </Link>

            <Link
              className="ic"
              to="/panier"
              aria-label={cartCount ? `Panier (${cartCount} article${cartCount > 1 ? 's' : ''})` : 'Panier'}
             
            >
              <Ico name="bag" />
              <Badge value={cartCount} label={`${cartCount} article(s) dans le panier`} />
            </Link>

            <Link className="ic" to={accountTo} aria-label={user ? 'Mon compte' : 'Se connecter'}>
              <Ico name={user ? 'user-check' : 'login'} />
            </Link>

            <button
              className="ic themebtn"
              type="button"
              onClick={toggleTheme}
              aria-label={themeLabel}
              title={themeTitle}
              aria-pressed={isDark}
            >
              <Ico name={isDark ? 'sun' : 'moon'} />
            </button>

            <button
              className="burger"
              type="button"
              onClick={openMenu}
              aria-label="Ouvrir le menu"
              aria-controls="mmenu"
              aria-expanded={menuOpen}
            >
              <Ico name="menu" />
            </button>
          </div>
        </div>
      </header>

      {menuMounted && (
        <div
          className={`mmenu${menuOpen ? ' on' : ''}`}
          id="mmenu"
          aria-hidden={!menuOpen}
          inert={!menuOpen ? true : undefined}
        >
          <div className="mhead">
            <Link className="logo" to="/" aria-label="REVENDS, accueil">
              REVENDS<b>.</b>
            </Link>
            <button className="mclose" type="button" onClick={closeMenu} aria-label="Fermer le menu">
              <Ico name="x" />
            </button>
          </div>

          <nav className="mnav" aria-label="Menu principal">
            <Link className="mcta" to="/sell">
              <Ico name="plus" cls="sm" />
              Vendre un article
            </Link>

            <span className="meyebrow">Explorer les univers</span>
            <div className="mgrid">
              {univers.map((u) => (
                <Link key={u.slug} to={`/category/${u.slug}`}>
                  <Ico name={u.icon} />
                  <span>{u.label}</span>
                </Link>
              ))}
            </div>
            <Link className="mlink-all" to="/search">
              <span>Tout le catalogue</span>
              <Ico name="arrow-right" cls="sm" />
            </Link>

            <span className="meyebrow">Mon espace</span>
            <div className="mlinks">
              <Link to="/favoris">
                <Ico name="heart" />
                Favoris
                {favCount > 0 && <span className="mbadge">{favCount}</span>}
              </Link>
              <Link to="/panier">
                <Ico name="bag" />
                Panier
                {cartCount > 0 && <span className="mbadge">{cartCount}</span>}
              </Link>
              <Link to={accountTo}>
                <Ico name="circle-user" />
                Mon compte
              </Link>
            </div>

            <span className="meyebrow">Compte &amp; préférences</span>
            <div className="mlinks">
              <button className="themebtn" type="button" onClick={toggleTheme} aria-label={themeLabel} aria-pressed={isDark}>
                <Ico name={isDark ? 'sun' : 'moon'} />
                <span>{themeTitle}</span>
              </button>
              {!user && (
                <Link to="/login">
                  <Ico name="login" />
                  Se connecter
                </Link>
              )}
              {user && (
                <button
                  type="button"
                  className="mlogout"
                  onClick={() => {
                    closeMenu()
                    setLogoutOpen(true)
                  }}
                >
                  <Ico name="logout" />
                  Se déconnecter
                </button>
              )}
            </div>

            <div className="mfoot">
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
          </nav>
        </div>
      )}

      <LogoutConfirm open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </>
  )
}
