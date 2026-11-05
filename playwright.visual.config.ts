import { defineConfig } from '@playwright/test'
import type { ChromaticConfig } from '@chromatic-com/playwright'
export default defineConfig<ChromaticConfig>({
  testDir: './tests/visual', testMatch: '*.visual.ts',
  outputDir: 'artifacts/chromatic-simple/captures',
  forbidOnly: true, retries: 0, workers: 2, timeout: 45_000,
  reporter: [['list'], ['json', { outputFile: 'artifacts/chromatic-simple/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4380', browserName: 'chromium', locale: 'en-US', timezoneId: 'UTC',
    reducedMotion: 'reduce', disableAutoSnapshot: true, resourceArchiveTimeout: 10_000,
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'bunx vite preview --config tests/visual/harness/vite.config.ts', url: 'http://127.0.0.1:4380', reuseExistingServer: false, timeout: 30_000 },
})
