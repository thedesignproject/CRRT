import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
const dirname = path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@widget': resolve(dirname, 'src')
    }
  },
  test: {
    coverage: {
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'api/**/*.ts', 'apps/dashboard/**/*.{ts,tsx}', 'apps/landing/**/*.{ts,tsx}', 'apps/extension/**/*.{ts,tsx}', 'shared/product-audit/**/*.{ts,tsx}', 'workflows/**/*.ts', 'server/**/*.ts'],
      exclude: ['src/__tests__/**', '**/*.test.*', '**/*.stories.*', '**/*.d.ts', 'server/public-site-entry.ts']
    },
    projects: [{
      extends: true,
      test: {
        name: 'unit',
        environment: 'happy-dom',
        globals: false,
        setupFiles: ['./src/__tests__/setup.ts'],
        // Nested packages own their test runners and CI. In particular, the
        // Storybook addon's `.mjs` suites use `node:test`, not Vitest.
        exclude: [...configDefaults.exclude, 'packages/**']
      }
    }, {
      extends: true,
      envDir: false,
      plugins: [
      // Browser tests need the same CSS transform as .storybook/vite.config.ts.
      tailwindcss(),
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});
