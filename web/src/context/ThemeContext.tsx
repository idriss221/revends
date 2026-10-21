import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/**
 * Thème clair / sombre — mécanique reprise de `Bureau/main/assets/theme.css`.
 *
 * · sélecteur : attribut `data-theme="light|dark"` sur `<html>` ;
 * · persistance : `localStorage` clé `rv:theme` (lue aussi par le script
 *   anti-flash de `index.html` AVANT le premier rendu) ;
 * · défaut : **dark** (« Burgundy Night »), comme Bureau/main ;
 * · `theme-anim` est posé le temps de la bascule pour une transition douce ;
 * · la `meta[name=theme-color]` suit le thème.
 *
 * IMPORTANT : le thème global n'affecte QUE les surfaces publiques
 * (`.market-site`). L'admin (`.market-admin`) est hors scope CSS et reste
 * donc insensible à `data-theme` (cf. index.css).
 */
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'rv:theme'
const THEME_COLOR: Record<Theme, string> = { dark: '#11100F', light: '#FFFFFF' }

function readInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* localStorage indisponible (mode privé) → défaut */
  }
  return 'dark'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[theme])
}

interface ThemeContextValue {
  theme: Theme
  isDark: boolean
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme)

  // Synchronise l'attribut <html> avec l'état React (le script anti-flash a
  // déjà posé la bonne valeur au boot : on ne fait que garantir la cohérence).
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    const root = document.documentElement
    root.classList.add('theme-anim')
    window.setTimeout(() => root.classList.remove('theme-anim'), 400)
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
