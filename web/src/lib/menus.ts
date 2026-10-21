import type { SidebarItem } from '../components/layout/Sidebar'

/**
 * Source UNIQUE des listes de liens.
 *
 * · `univers` — les six univers du site public (`Bureau/main/index.html`
 *   → `nav.cats`). Slugs alignés sur `002_seed_categories.sql` ;
 * · `adminMenu` — menu du back-office (`Sidebar.tsx`).
 */

/** Entrée d'univers (navigation publique, menu mobile, filtres). */
export interface Universe {
  /** slug de la catégorie — cible réelle `/category/:slug` */
  slug: string
  label: string
  /** icône du sprite SVG (sans le préfixe `i-`) */
  icon: string
}

/**
 * Les six univers de `Bureau/main` (`nav.cats` + `.mgrid`), dans l'ordre de la
 * maquette. Les slugs sont ceux de `002_seed_categories.sql` :
 * Mode, Chaussures, Sacs, Tech, Maison, Loisirs.
 */
export const univers: Universe[] = [
  { slug: 'mode', label: 'Mode', icon: 'shirt' },
  { slug: 'mode-chaussures', label: 'Chaussures', icon: 'shoe' },
  { slug: 'mode-sacs', label: 'Sacs', icon: 'bag' },
  { slug: 'electronique', label: 'Tech', icon: 'mobile' },
  { slug: 'maison', label: 'Maison', icon: 'couch' },
  { slug: 'loisirs', label: 'Loisirs', icon: 'gamepad' },
]

/** Menu sidebar admin (mapping design-system §4.3). */
export function adminMenu(pending: number): SidebarItem[] {
  return [
    { to: '/admin', icon: 'fas fa-gauge-high', label: 'Dashboard', exact: true },
    { to: '/admin/articles-en-attente', icon: 'fas fa-clock', label: 'Articles en attente', badge: pending, exact: true },
    { to: '/admin/articles', icon: 'fas fa-box', label: 'Articles' },
    { to: '/admin/commandes', icon: 'fas fa-cart-shopping', label: 'Commandes' },
    { to: '/admin/paiements', icon: 'fas fa-money-bill-wave', label: 'Paiements vendeurs' },
    { to: '/admin/utilisateurs', icon: 'fas fa-users', label: 'Utilisateurs' },
    { to: '/admin/categories', icon: 'fas fa-tags', label: 'Catégories' },
    { to: '/admin/historique', icon: 'fas fa-clock-rotate-left', label: 'Historique' },
  ]
}

/** Menu admin de bas d'écran (< 968 px, tiroir) — même source que la sidebar. */
export const adminMenuLabels: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/articles-en-attente': 'Articles en attente',
  '/admin/articles': 'Articles',
  '/admin/commandes': 'Commandes',
  '/admin/paiements': 'Paiements',
  '/admin/utilisateurs': 'Utilisateurs',
  '/admin/categories': 'Catégories',
  '/admin/historique': 'Historique',
}
