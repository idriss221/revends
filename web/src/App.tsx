import { Navigate, Route, Routes } from 'react-router'
import { SiteShell } from './components/layout/SiteShell'
import { RequireAdmin, RequireUser } from './components/auth/RouteGuards'

import { HomeView } from './views/HomeView'
import { ShopView } from './views/ShopView'
import { CategoryShopView } from './views/CategoryShop'
import { ProductView } from './views/ProductView'
import { FavoritesView } from './views/FavoritesView'
import { CartView } from './views/CartView'
import { CheckoutView } from './views/CheckoutView'
import { SellView } from './views/SellView'
import { AuthView } from './views/AuthView'
import { AccountView } from './views/AccountView'
import { NotFoundView } from './views/NotFoundView'

/* Pages d'espace connecté SANS équivalent dans `Bureau/main` : conservées
   (CA-V5-135/142, parcours commande) — elles seront re-stylées en classes du
   site. Aucune ancienne interface ne subsiste côté catalogue/catalogue. */
import { ConfirmationPage } from './pages/ConfirmationPage'
import { MyArticlesPage } from './pages/MyArticlesPage'
import { MyOrdersPage } from './pages/MyOrdersPage'
import { MyOrderDetailPage } from './pages/MyOrderDetailPage'
import { OrderTrackingPage } from './pages/OrderTrackingPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ConditionsPage } from './pages/ConditionsPage'
import { PrivacyPage } from './pages/PrivacyPage'

/* Espace administrateur — conservé tel quel (hors SiteShell, coquille dédiée). */
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminPendingPage } from './pages/admin/AdminPendingPage'
import { AdminArticlesPage } from './pages/admin/AdminArticlesPage'
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage'
import { AdminOrderDetailPage } from './pages/admin/AdminOrderDetailPage'
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage'
import { AdminUsersPage } from './pages/admin/AdminUsersPage'
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage'
import { AdminHistoryPage } from './pages/admin/AdminHistoryPage'

/**
 * Routes du SITE PUBLIC — toutes servies par `SiteShell` (coquille de
 * `Bureau/main`), en suivant la table `route()` de `assets/app.js` :
 *
 * | Référence (hash)     | Route React                     | Vue        |
 * |----------------------|---------------------------------|------------|
 * | `#/`                 | `/` · `/accueil-react`          | HomeView   |
 * | `#/shop?…`           | `/shop` · `/search` · `/category`| ShopView   |
 * | `#/shop?c=<slug>`    | `/category/:slug`               | → `/shop`  |
 * | `#/p/:slug`          | `/catalogue/:slug`              | ProductView|
 * | `#/favs`             | `/favoris` · `/favs`            | Favorites  |
 * | `#/cart`             | `/panier` · `/cart`             | CartView   |
 * | `#/checkout`         | `/commande` · `/checkout`       | Checkout   |
 * | `#/sell`             | `/sell` (connecté)              | SellView   |
 * | `#/login`            | `/login` `/register` `/reset-password` | AuthView |
 * | `#/account`          | `/profil` · `/account` (connecté) | AccountView |
 * | `*`                  | `*`                             | NotFound   |
 *
 * Les chemins historiques du projet (`/search`, `/panier`, `/favoris`…) sont
 * **conservés** : ils sont déclarés dans `docs/`, cités par les user stories
 * et ciblés par la recette. Les alias de la référence (`/shop`, `/favs`,
 * `/cart`, `/checkout`) sont **ajoutés** — jamais l'un à la place de l'autre.
 *
 * Les authentification sont **dans** `SiteShell` : c'est lui qui pose la
 * classe `bare` (en-tête/pied masqués) et le sprite d'icônes dont
 * `AuthView` a besoin (`.market-site.bare header.site{display:none}`).
 */
export function App() {
  return (
    <Routes>
      <Route element={<SiteShell />}>
        {/* ── Accueil ───────────────────────────────────────────────── */}
        <Route path="/" element={<HomeView />} />
        <Route path="/accueil-react" element={<HomeView />} />

        {/* ── Catalogue (la « boutique » de la référence) ────────────── */}
        <Route path="/shop" element={<ShopView />} />
        <Route path="/search" element={<ShopView />} />
        {/* `/category` DOIT exister : c'est la cible du lien « Catégories » de la
            navbar et de « Toutes les catégories » du footer (CA-V5-137, RG-V5-08). */}
        <Route path="/category" element={<ShopView />} />
        {/* Slug catégorie → résolu puis redirigé vers `/shop?c=<id>`, exactement
            comme `catTile()` de la référence pointe `#/shop?c=…`. Slug inconnu →
            404 dédié (CA-ACC-15). */}
        <Route path="/category/:slug" element={<CategoryShopView />} />

        {/* ── Fiche article ─────────────────────────────────────────── */}
        <Route path="/catalogue/:slug" element={<ProductView />} />

        {/* ── Favoris / Panier / Commande ───────────────────────────── */}
        <Route path="/favoris" element={<FavoritesView />} />
        <Route path="/favs" element={<Navigate to="/favoris" replace />} />
        <Route path="/panier" element={<CartView />} />
        <Route path="/cart" element={<Navigate to="/panier" replace />} />
        <Route path="/commande" element={<CheckoutView />} />
        <Route path="/checkout" element={<Navigate to="/commande" replace />} />

        {/* ── Authentification (mode unique, 3 routes) ──────────────── */}
        <Route path="/login" element={<AuthView mode="login" />} />
        <Route path="/register" element={<AuthView mode="register" />} />
        <Route path="/reset-password" element={<AuthView mode="reset" />} />

        {/* ── Vente — réservé aux utilisateurs connectés ────────────── */}
        <Route path="/vendre" element={<RequireUser><Navigate to="/sell" replace /></RequireUser>} />
        <Route path="/sell" element={<RequireUser><SellView /></RequireUser>} />
        <Route path="/confirmation" element={<RequireUser><ConfirmationPage /></RequireUser>} />

        {/* ── Espace utilisateur ────────────────────────────────────── */}
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/profil" element={<RequireUser><AccountView /></RequireUser>} />
        <Route path="/account" element={<RequireUser><AccountView /></RequireUser>} />
        <Route path="/mes-commandes" element={<RequireUser><MyOrdersPage /></RequireUser>} />
        <Route path="/mes-commandes/:id" element={<RequireUser><MyOrderDetailPage /></RequireUser>} />
        <Route path="/commandes/:id/suivi" element={<RequireUser><OrderTrackingPage /></RequireUser>} />
        <Route path="/mes-articles" element={<RequireUser><MyArticlesPage /></RequireUser>} />
        <Route path="/notifications" element={<RequireUser><NotificationsPage /></RequireUser>} />

        {/* ── Liens légaux du pied de page (CA-V5-142, PO-V5-20) ───── */}
        <Route path="/conditions" element={<ConditionsPage />} />
        <Route path="/confidentialite" element={<PrivacyPage />} />

        {/* 404 — DANS la coquille du site : un lien mort ne doit pas priver
            l'utilisateur de navbar ni de pied de page. `*` reste le dernier
            enfant de `<SiteShell />`. */}
        <Route path="*" element={<NotFoundView />} />
      </Route>

      {/* Espace administrateur — coquille dédiée, hors SiteShell, INCHANGÉ. */}
      <Route path="/admin" element={<RequireAdmin><AdminDashboardPage /></RequireAdmin>} />
      <Route path="/admin/articles-en-attente" element={<RequireAdmin><AdminPendingPage /></RequireAdmin>} />
      <Route path="/admin/articles" element={<RequireAdmin><AdminArticlesPage /></RequireAdmin>} />
      <Route path="/admin/commandes" element={<RequireAdmin><AdminOrdersPage /></RequireAdmin>} />
      <Route path="/admin/commandes/:id" element={<RequireAdmin><AdminOrderDetailPage /></RequireAdmin>} />
      <Route path="/admin/paiements" element={<RequireAdmin><AdminPaymentsPage /></RequireAdmin>} />
      <Route path="/admin/utilisateurs" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
      <Route path="/admin/categories" element={<RequireAdmin><AdminCategoriesPage /></RequireAdmin>} />
      <Route path="/admin/historique" element={<RequireAdmin><AdminHistoryPage /></RequireAdmin>} />
    </Routes>
  )
}
