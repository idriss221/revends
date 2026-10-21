import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Cible du proxy API. Par défaut `127.0.0.1:4001` (api1 de la stack Docker).
 *
 * `VITE_API_PROXY_TARGET` permet de pointer la recette e2e sur une instance
 * **dédiée** (`api-e2e`, port 4002, `RATE_LIMIT_DISABLED=true`) : sans cela, la
 * suite e2e épuise le plafond `/api/auth` (20 appels/10 min) et se produit des
 * faux négatifs (429 → session admin absente → tests admin rouges).
 *
 * `127.0.0.1` explicite et non `localhost` : selon /etc/hosts, `localhost` se
 * résout d'abord en ::1 — si le proxy IPv6 est prioritaire, la requête `/api/*`
 * reste suspendue et l'app bloquée sur « Chargement… » (constaté à l'e2e, sans
 * la moindre erreur console).
 */
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:4001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // `changeOrigin: false` conserve l'en-tête `Host` du navigateur (port du
      // front) afin que le contrôle d'origine CSRF (same-host) ne rejette pas
      // les mutations proxifiées (preview/dev e2e sur 5180/5181).
      '/api': { target: API_TARGET, changeOrigin: false },
      '/uploads': { target: API_TARGET, changeOrigin: false },
    },
  },
  // `vite preview` (recette e2e sur le BUILD) proxifie aussi l'API : sans cela
  // les tests Playwright tourneraient sur une app sans données.
  preview: {
    // `127.0.0.1` explicite : `localhost` se résout en IPv6 dans ce
    // environnement et les sondes HTTP (Playwright) n'atteignent pas le serveur.
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/uploads': { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
  },
})