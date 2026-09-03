import { expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
vi.mock('wxt', () => ({ defineConfig: (config: unknown) => config }))
import config from '../wxt.config'

it('builds the extension with its canonical icon and declared permissions', () => {
  expect((config.vite as () => unknown)()).toEqual({ build: { assetsInlineLimit: Infinity } })
  const files: { absoluteSrc: string; relativeDest: string }[] = []
  const hook = config.hooks!['build:publicAssets'] as (wxt: unknown, assets: typeof files) => void
  hook({ config: { root: resolve('apps/extension') } }, files)
  expect(files[0].relativeDest).toBe('icon.png')
  expect(readFileSync(files[0].absoluteSrc)).toEqual(readFileSync('branding/design-system-crrt/Frame 11.png'))
  expect(config.manifest).toMatchObject({ permissions: ['activeTab', 'scripting', 'storage'], action: { default_icon: { 16: 'icon.png' } } })
})
