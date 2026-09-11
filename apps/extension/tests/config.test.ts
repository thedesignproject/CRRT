import { afterEach, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
vi.mock('wxt', () => ({ defineConfig: (config: unknown) => config }))
import config, { extensionManifest } from '../wxt.config'

const production = {
  WXT_API_BASE: 'https://crrt.ai/api',
  WXT_DASHBOARD_URL: 'https://crrt.ai/dashboard/',
  WXT_SUPABASE_URL: 'https://project-ref.supabase.co',
}

afterEach(() => vi.unstubAllEnvs())

it('builds the extension with its canonical icon and declared permissions', () => {
  expect((config.vite as () => unknown)()).toEqual({ build: { assetsInlineLimit: Infinity } })
  const files: { absoluteSrc: string; relativeDest: string }[] = []
  const hooks = config.hooks as { 'build:publicAssets': (wxt: unknown, assets: typeof files) => void }
  hooks['build:publicAssets']({ config: { root: resolve('apps/extension') } }, files)
  expect(files[0].relativeDest).toBe('icon.png')
  expect(readFileSync(files[0].absoluteSrc)).toEqual(readFileSync('branding/design-system-crrt/Frame 11.png'))
  const manifest = extensionManifest({ mode: 'production' }, production)
  for (const [name, value] of Object.entries(production)) vi.stubEnv(name, value)
  expect((config.manifest as (environment: { mode: string }) => unknown)({ mode: 'production' })).toEqual(manifest)
  expect(manifest).toMatchObject({
    permissions: ['activeTab', 'identity', 'scripting', 'storage'],
    host_permissions: ['https://crrt.ai/*', 'https://project-ref.supabase.co/*'],
    action: { default_icon: { 16: 'icon.png' } },
  })
  expect(manifest.host_permissions).not.toContain('http://*/*')
  expect(manifest.host_permissions).not.toContain('https://*/*')
  expect(manifest.web_accessible_resources).toEqual([
    { resources: ['private.html'], matches: ['http://*/*', 'https://*/*'] },
  ])
  expect(existsSync('apps/extension/entrypoints/autoload.content.ts')).toBe(false)
})

it('allows only explicit local HTTP service origins during development', () => {
  const manifest = extensionManifest({ mode: 'development' }, {
    WXT_API_BASE: 'http://localhost:3000/api',
    WXT_DASHBOARD_URL: 'http://127.0.0.1:5173/dashboard/',
    WXT_SUPABASE_URL: 'http://127.0.0.1:54321/',
  })
  expect(manifest.host_permissions).toEqual(['http://localhost:3000/*', 'http://127.0.0.1:54321/*'])

  expect(extensionManifest({ mode: 'development' }, {
    WXT_API_BASE: 'https://staging.crrt.ai/api',
    WXT_DASHBOARD_URL: 'https://staging.crrt.ai/dashboard',
    WXT_SUPABASE_URL: 'https://staging.supabase.co',
  }).host_permissions).toEqual(['https://staging.crrt.ai/*', 'https://staging.supabase.co/*'])
})

it.each([
  ['missing URL', { ...production, WXT_API_BASE: '' }, 'WXT_API_BASE is required'],
  ['invalid URL', { ...production, WXT_API_BASE: 'not a URL' }, 'valid absolute URL'],
  ['username', { ...production, WXT_API_BASE: 'https://user@crrt.ai/api' }, 'must not include credentials'],
  ['password', { ...production, WXT_API_BASE: 'https://user:secret@crrt.ai/api' }, 'must not include credentials'],
  ['query', { ...production, WXT_API_BASE: 'https://crrt.ai/api?key=value' }, 'must not include a query'],
  ['fragment', { ...production, WXT_API_BASE: 'https://crrt.ai/api#fragment' }, 'must not include a fragment'],
  ['wildcard', { ...production, WXT_SUPABASE_URL: 'https://*.supabase.co' }, 'must not include a wildcard'],
  ['production HTTP', { ...production, WXT_API_BASE: 'http://crrt.ai/api' }, 'must use HTTPS in production'],
  ['production localhost', { ...production, WXT_API_BASE: 'https://localhost/api' }, 'must not use a local host'],
  ['wrong API host', { ...production, WXT_API_BASE: 'https://api.crrt.ai/api' }, 'production CRRT API'],
  ['wrong API path', { ...production, WXT_API_BASE: 'https://crrt.ai/v1' }, 'production CRRT API'],
  ['wrong dashboard host', { ...production, WXT_DASHBOARD_URL: 'https://dashboard.crrt.ai/dashboard' }, 'production CRRT dashboard'],
  ['wrong dashboard path', { ...production, WXT_DASHBOARD_URL: 'https://crrt.ai/login' }, 'production CRRT dashboard'],
  ['wrong Supabase host', { ...production, WXT_SUPABASE_URL: 'https://database.example.com' }, 'exact Supabase project origin'],
  ['wrong Supabase path', { ...production, WXT_SUPABASE_URL: 'https://project-ref.supabase.co/rest' }, 'exact Supabase project origin'],
])('fails a production build with %s', (_name, environment, message) => {
  expect(() => extensionManifest({ mode: 'production' }, environment)).toThrow(message)
})

it.each([
  ['public HTTP', { ...production, WXT_API_BASE: 'http://example.com/api' }],
  ['unsupported protocol', { ...production, WXT_API_BASE: 'ftp://localhost/api' }],
])('rejects %s outside production too', (_name, environment) => {
  expect(() => extensionManifest({ mode: 'development' }, environment)).toThrow('HTTPS or local HTTP')
})

it('deduplicates service host access and enforces one production CRRT origin', () => {
  expect(extensionManifest({ mode: 'development' }, {
    WXT_API_BASE: 'https://same.example/api',
    WXT_DASHBOARD_URL: 'https://same.example/dashboard',
    WXT_SUPABASE_URL: 'https://same.example/',
  }).host_permissions).toEqual(['https://same.example/*'])
})
