import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/replay', testMatch: '*.replay.ts',
  outputDir: 'artifacts/chromatic-simple/replay-results',
  updateSnapshots: 'none',
  forbidOnly: true, fullyParallel: true, retries: 0, workers: 2, timeout: 30_000,
  reporter: [['list'], ['json', { outputFile: 'artifacts/chromatic-simple/replays.json' }]],
  snapshotPathTemplate: '{testDir}/../../artifacts/chromatic-simple/checkpoints/{arg}{ext}',
  use: { baseURL: 'http://127.0.0.1:4381', reducedMotion: 'reduce' },
  webServer: { command: 'bun scripts/chromatic/serve-archive.ts', url: 'http://127.0.0.1:4381', reuseExistingServer: false },
})
