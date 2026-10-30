import { defineConfig } from 'vitest/config'

// Tests des libs pures du front : pas de DOM ni de navigateur nécessaire.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
  server: { host: '127.0.0.1' },
})