import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@widget': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'api/**/*.ts', 'apps/dashboard/**/*.{ts,tsx}', 'workflows/**/*.ts'],
      exclude: ['src/__tests__/**', '**/*.test.*', '**/*.d.ts'],
    },
  },
})
