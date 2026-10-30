import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { SplashLoader } from '../ui/SplashLoader'
import { Lightbox } from '../site/Lightbox'
import { useReveals } from '../../hooks/useReveals'

/**
 * Coquille du SITE public — reproduction du chrome de `Bureau/main/index.html`
 * (loader signature, en-tête, pied de page). Le sprite d'icônes, lui, est
 * monté **à la racine** (`main.tsx`) : il doit aussi servir au toast et aux
 * routes admin, qui ne passent pas par cette coquille.
 *
 * · le conteneur porte `market-site` : TOUT le CSS porté de la maquette est
 *   scopé sous ce préfixe (`src/styles/bureau.css`), donc l'admin
 *   (`.market-admin`) n'est jamais touché ;
 * · `home` / `bare` rejouent `body.home` / `body.bare` de la maquette :
 *   en-tête transparent sur le héros, et rendu « à nu » pour l'authentification ;
 * · `--header-h` est mesuré sur `header.site .bar` (comme `syncHeaderH()` de
 *   `app.js`) et posé **sur le conteneur** : `.market-site` redéfinit la
 *   variable, une valeur posée sur `<html>` serait donc masquée ;
 * · `<main id="app">` + lien d'évitement `#app`, comme la maquette ;
 * · la maquette n'a PAS de barre de navigation basse : il n'y en a donc plus ;
 * · `Lightbox` + `useReveals` : la visionneuse (`#lightbox`) et la révélation
 *   au défilement (`.rv` → `.on`) sont globales au site public, exactement
 *   comme `openZoom()` / `observeReveals()` le sont dans `app.js`.
 */
const BARE_ROUTES = ['/login', '/register', '/reset-password']

export function SiteShell() {
  const location = useLocation()
  const wrapperRef = useRef<HTMLDivElement>(null)

  const bare = BARE_ROUTES.includes(location.pathname)
  const home = location.pathname === '/'

  // observeReveals() — repasse à chaque route (la maquette le rappelait après chaque route()).
  useReveals(wrapperRef)

  // syncHeaderH() — mesure la hauteur réelle de la barre de l'en-tête.
  useEffect(() => {
    if (bare) return
    const root = wrapperRef.current
    const bar = root?.querySelector<HTMLElement>('header.site')
    if (!root || !bar) return

    const sync = () => {
      const val = `${Math.round(bar.getBoundingClientRect().height)}px`
      if (root.style.getPropertyValue('--header-h') !== val) root.style.setProperty('--header-h', val)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(bar)
    window.addEventListener('resize', sync, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [bare, location.pathname])

  return (
    <div ref={wrapperRef} className={`market-site${home ? ' home' : ''}${bare ? ' bare' : ''}`}>
      <SplashLoader />
      <a className="skip" href="#app">
        Aller au contenu principal
      </a>
      <Navbar />
      {/* `key` : rejoue l'animation `viewIn` à chaque changement de route. */}
      <main id="app" tabIndex={-1}>
        <div className="view" key={location.pathname}>
          <Outlet />
        </div>
      </main>
      <Footer />
      <Lightbox />
    </div>
  )
}
