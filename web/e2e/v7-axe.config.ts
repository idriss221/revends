/**
 * Config Playwright dédiée à l'audit axe V7 (CA-V7-027/062) contre une
 * instance locale jetable (NODE_ENV=test, base revends_test, Vite 5180).
 * Aucun globalSetup, aucun webServer — les deux serveurs sont démarrés
 * manuellement. Jamais la production.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './functional',
  testMatch: /v7-accessibility\.spec\.ts$/,
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
