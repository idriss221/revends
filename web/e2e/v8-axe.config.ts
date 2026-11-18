/**
 * V8 — HÉBERGEMENT BOUTIQUE · accessibilité (CA-V8-076/077) contre une
 * instance LOCALE (NODE_ENV=test, base `revends_test` neuve, Vite 5180).
 *
 * 0 violation critique ou sérieuse exigée (axe-core) sur 3 écrans :
 *   1. /boutique/:slug (publique, anonyme) ;
 *   2. /mon-abonnement (vendeur — onglet « Statistiques » inclus, contrat v2.8) ;
 *   3. /admin/abonnements (admin — file des demandes Wave/Orange Money/virement).
 * + 1 scan axe en mode Mobile Chrome (375×667, isMobile/hasTouch) sur la boutique,
 *   avec vérification scrollWidth ≤ 375 (CA-V8-078).
 *
 * Config dédiée, aucun globalSetup — les deux serveurs sont démarrés
 * manuellement. Jamais la production.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './functional',
  testMatch: /v8\.axe\.spec\.ts$/,
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5180',
    locale: 'fr-FR',
    timezoneId: 'Africa/Dakar',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
})
