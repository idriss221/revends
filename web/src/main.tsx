import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
// Design system de `Bureau/main`, scopé sous `.market-site` — APRÈS index.css
// pour que les jetons de la maquette l'emportent.
import './styles/bureau.css'
// Source unique des jetons du site public : DOIT suivre bureau.css pour
// écraser ses jetons de palette et précéder bureau-fixes.css qui les consomme.
import './styles/tokens.css'
// Correctifs écrits à la main (a11y, états non couverts par la maquette) :
// DOIT suivre bureau.css pour pouvoir les compléter.
import './styles/bureau-fixes.css'
// Écrans V7 « Hébergement des vendeurs » (additif, design-v7 §5.6 ; DOIT suivre
// bureau-fixes.css : consomme les mêmes jetons .market-site).
import './styles/storefront.css'
import { App } from './App'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ScrollToTop } from './components/layout/ScrollToTop'
import { IconSprite } from './components/brand/IconSprite'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { FavoritesProvider } from './context/FavoritesContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './lib/toast'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
})

/**
 * Parrainage : capture du code `?ref=RV…` AVANT le rendu React.
 *
 * Pourquoi ici et pas dans une page : un filleul peut atterrir n'importe où
 * (`/`, `/catalogue/…`) puis s'inscrire 10 minutes plus tard. Si le code n'est
 * conservé qu'à l'affichage de `/register`, il est perdu. On le mémorise donc
 * au chargement — et `AuthView` le relit à l'inscription.
 */
try {
  const ref = new URLSearchParams(window.location.search).get('ref')?.trim().toUpperCase()
  if (ref && /^RV[A-Z0-9]{6,12}$/.test(ref)) localStorage.setItem('rv_ref', ref)
} catch {
  // Stockage indisponible (navigation privée stricte) : le parrainage reste
  // facultatif, jamais bloquant.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <CartProvider>
              <FavoritesProvider>
                <BrowserRouter>
                  {/* Sprite SVG des icônes : monté une fois à la racine, comme
                      dans `Bureau/main/index.html`, pour que les
                      `<use href="#i-…">` résorbent sur **toutes** les routes
                      (public ET admin, toast compris). Hors `ErrorBoundary` :
                      le sprite doit survivre à une erreur de rendu. */}
                  <IconSprite />
                  {/* Haut de page à chaque navigation (les filtres passent par
                      `search`, jamais par `pathname` : ils ne remontent pas). */}
                  <ScrollToTop />
                  <ErrorBoundary>
                    <App />
                  </ErrorBoundary>
                </BrowserRouter>
              </FavoritesProvider>
            </CartProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)