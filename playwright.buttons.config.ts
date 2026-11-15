import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './tests/storybook', testMatch: 'buttons.spec.ts', workers: 2, use: { baseURL: 'http://127.0.0.1:6009', reducedMotion: 'reduce' }, webServer: { command: 'STORYBOOK_PORT=6009 node .storybook/serve.mjs', url: 'http://127.0.0.1:6009' } })
