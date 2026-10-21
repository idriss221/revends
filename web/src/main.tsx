import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
// Design system de `Bureau/main`, scopé sous `.market-site` — APRÈS index.css
// pour que les jetons de la maquette l'emportent.
import './styles/bureau.css'
// Correctifs écrits à la main (a11y, états non couverts par la maquette) :
// DOIT suivre bureau.css pour pouvoir les compléter.
import './styles/bureau-fixes.css'
import { App } from './App'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
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