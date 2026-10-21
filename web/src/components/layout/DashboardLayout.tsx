import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Sidebar, type SidebarItem } from './Sidebar'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface DashboardLayoutProps {
  items: SidebarItem[]
  children: ReactNode
}

/**
 * Layout dashboard admin — spec-admin §6 (shell) : grille 260 px + contenu,
 * fond Ivory. Sous 968 px : colonne unique + tiroir (drawer).
 *
 * Le tiroir est un dialogue modal : `aria-modal`, Échap pour fermer, clic sur
 * le voile, **focus piégé Tab/Shift+Tab** (`useFocusTrap`, partagé avec `Modal`
 * — CA-V5-043), focus du conteneur à l'ouverture puis restitution au bouton de
 * menu au retour, et scroll de la page verrouillé tant qu'il est ouvert.
 */
export function DashboardLayout({ items, children }: DashboardLayoutProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  useFocusTrap(drawerRef, open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Le dialogue reçoit le focus dès l'ouverture : sans lui, Tab part du
    // bouton « Ouvrir le menu » qui se trouve **derrière** le voile.
    drawerRef.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
      // focus rendu au bouton d'ouverture (parcours clavier complet)
      triggerRef.current?.focus()
    }
  }, [open])

  return (
    <div className="market-admin grid min-h-screen grid-cols-[260px_1fr] max-[968px]:grid-cols-1">
      {/* Lien d'évitement — le back-office a son propre shell, il lui faut le
          sien : sans lui, le clavier doit traverser tout le menu (DA §8). */}
      <a href="#contenu-admin" className="skip-link">
        Aller au contenu principal
      </a>
      {/* Desktop : rail fixe */}
      <div className="max-[968px]:hidden">
        <div className="fixed inset-y-0 left-0 w-[260px]">
          <Sidebar items={items} />
        </div>
      </div>

      {/* Tiroir mobile */}
      {open && (
        <div
          ref={drawerRef}
          tabIndex={-1}
          className="fixed inset-0 z-[150] hidden outline-none max-[968px]:block"
          role="dialog"
          aria-modal="true"
          aria-label="Menu administrateur"
        >
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div className="absolute inset-0 bg-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-[280px] animate-[page-in_0.3s_ease]">
            <Sidebar items={items} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* D15 : `p-6` puis `max-[1200px]:p-5` (et non `p-[30px]` fixe) — 724 px
          utiles à 1024 px au lieu de 644. D17 : entrée d'écran `animate-page-in`. */}
      {/* `min-w-0` : sans lui, l'item de grille `1fr` garde `min-width:auto` et sa
          contribution minimale devient le min-content du `.card` (971px) — le
          rail 260px + ce min-content dépassaient le viewport (47px de débordement
          à 1280px, constaté à l'e2e). `min-w-0` laisse la piste `1fr` se réduire
          et laisse `.table-scroll` gérer le scroll du tableau (CA-V5-038). */}
      <main id="contenu-admin" className="min-h-screen min-w-0 animate-page-in bg-ivory p-6 max-[1200px]:p-5">
        {/* D16 : le bouton n'existe QUE sous 968 px. Un conteneur toujours rendu
            laissait 50 px de hauteur morte sur desktop. */}
        <button
          type="button"
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          ref={triggerRef}
          onClick={() => setOpen(true)}
          className="mb-6 hidden h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-md bg-white text-xl text-ink shadow-sm transition-all duration-200 hover:bg-terracotta-deep hover:text-white max-[968px]:flex"
        >
          <i className="fas fa-bars" aria-hidden="true" />
        </button>
        {children}
      </main>
    </div>
  )
}
