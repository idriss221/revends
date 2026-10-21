import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { Logo } from '../brand'

export interface SidebarItem {
  to: string
  icon: string
  label: string
  badge?: number
  exact?: boolean
}

interface SidebarProps {
  items: SidebarItem[]
  onNavigate?: () => void
}

/**
 * Sidebar admin — spec §6 (admin > shell) : fond **Charcoal**, jamais clair.
 *
 * · logo `sidebar` + `surface="dark"` → symbole champagne, V on-dark-accent ;
 * · lien actif : aplat Terracotta **+** filet champagne à gauche + graisse
 *   (traitement NON coloré seul — §8) ;
 * · lien inactif : `on-dark-muted` (7.83:1), survol = `on-dark` sur hover Charcoal ;
 * · badge : pastille champagne, texte Charcoal (contraste inversé assumé) ;
 * · hauteur 100 %, défilement propre (`min-h-0`) — jamais de page qui déborde.
 */
export function Sidebar({ items, onNavigate }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const isActive = (item: SidebarItem) => {
    if (item.exact) return location.pathname === item.to
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  }

  const handleLogout = async () => {
    await logout()
    onNavigate?.()
    navigate('/')
  }

  return (
    <aside className="on-dark flex h-full min-h-0 flex-col overflow-y-auto bg-ink p-5 text-on-dark">
      <div className="mb-9 px-1 pt-1">
        <Logo variant="sidebar" surface="dark" />
      </div>

      <nav aria-label="Menu administrateur">
        <ul className="space-y-1.5">
          {items.map((item) => {
            const active = isActive(item)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-[44px] items-center gap-3 rounded-md py-2.5 pr-4 pl-5 text-[15px] transition-colors duration-200 ${
                    active
                      ? 'bg-terracotta-strong font-bold text-white'
                      : 'font-medium text-on-dark-muted hover:bg-ink-2 hover:text-on-dark'
                  }`}
                >
                  {/* Filet 3 px : second signal de l'état actif (pas la couleur seule) */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-champagne transition-opacity duration-200 ${
                      active ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <i className={`${item.icon} w-6 text-xl`} aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      aria-label={`${item.label} : ${item.badge} en attente`}
                      className="grid h-5 min-w-5 animate-pop-in place-items-center rounded-full bg-champagne px-1.5 text-xs font-bold text-ink"
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* §4.6 : filet `border-white/10` + `pt-6` avant la déconnexion — sépare
          la navigation de la zone session. */}
      <div className="mt-auto border-t border-white/10 pt-6">
        {user && (
          <p className="mb-1 truncate px-4 text-xs text-on-dark-muted" title={user.email}>
            Connecté : {user.displayName}
          </p>
        )}
        <Link
          to="/"
          className="flex min-h-[44px] items-center gap-3 rounded-md py-2.5 pr-4 pl-5 text-[15px] font-medium text-on-dark-muted transition-colors duration-200 hover:bg-ink-2 hover:text-on-dark"
        >
          <i className="fas fa-store w-6 text-xl" aria-hidden="true" />
          <span>Voir la boutique</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-md py-2.5 pr-4 pl-5 text-[15px] font-medium text-on-dark-muted transition-colors duration-200 hover:bg-danger hover:text-white"
        >
          <i className="fas fa-arrow-right-from-bracket w-6 text-xl" aria-hidden="true" />
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
  )
}
