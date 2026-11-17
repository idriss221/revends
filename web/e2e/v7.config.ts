/**
 * Config Playwright DÉDIÉE à la recette V7 contre une instance locale
 * jetable (API NODE_ENV=test sur 4050 + base `revends_test`, front Vite sur
 * 5180 avec proxy /api → 4050). Volontairement séparée de
 * `playwright.config.ts` : pas de globalSetup (celui-ci écrase
 * l’hygiène/seed de l’instance `api-e2e` docker sur 4002 — hors périmètre ici),
 * pas de webServer (les deux serveurs sont démarrés manuellement, base V7
 * neuve). Un seul test sériel, un seul projet Chromium.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './functional',
  testMatch: /v7-hebergement\.spec\.ts$/,
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
