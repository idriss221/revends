import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * Config dédiée aux **captures** (`npm run test:e2e:capture`).
 *
 * Séparée de la config principale pour que la suite fonctionnelle reste rapide :
 * les captures ne sont ni un test de non-régression ni un audit — elles
 * produisent les images de la recette (écran × viewport) dans `e2e/captures/`.
 */
export default defineConfig({
  ...base,
  testMatch: /capture\.spec\.ts$/,
  // Une capture = un état visuel déterministe : pas de retry, pas de trace.
  retries: 0,
  workers: 1,
  use: { ...base.use, trace: 'off', screenshot: 'off' },
  projects: [
    { name: 'cap-1440', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'cap-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'cap-390', use: { ...{ viewport: { width: 390, height: 844 } }, isMobile: true, hasTouch: true } },
  ],
})
