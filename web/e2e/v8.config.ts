/**
 * V8 — HÉBERGEMENT BOUTIQUE · parcours navigateur contre une instance LOCALE
 * dédiée (API NODE_ENV=test port 4050 + base `revends_test` neuve, front Vite
 * port 5180 avec proxy /api → 4050). Config dédiée séparée de
 * `playwright.config.ts` (pas de globalSetup, pas de webServer) — comme V7.
 * Un seul projet Chromium, tests sériels. Jamais la production.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './functional',
  testMatch: /v8-hebergement-boutique\.spec\.ts$/,
  workers: 1,
  fullyParallel: false,
  timeout: 300_000,
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
