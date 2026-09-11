import { defineConfig, type ConfigEnv, type UserManifest } from 'wxt'
import { resolve } from 'node:path'

const icons = { 16: 'icon.png', 32: 'icon.png', 48: 'icon.png', 128: 'icon.png' }
type ServiceName = 'api' | 'dashboard' | 'supabase'
type ExtensionBuildEnvironment = Partial<Record<'WXT_API_BASE' | 'WXT_DASHBOARD_URL' | 'WXT_SUPABASE_URL', string>>

function serviceUrl(raw: string | undefined, variable: string, mode: string): URL {
  if (!raw?.trim()) throw new Error(`${variable} is required to build the CRRT extension`)
  let url: URL
  try { url = new URL(raw) }
  catch { throw new Error(`${variable} must be a valid absolute URL`) }
  if (url.username) throw new Error(`${variable} must not include credentials`)
  if (url.search) throw new Error(`${variable} must not include a query`)
  if (url.hash) throw new Error(`${variable} must not include a fragment`)
  if (url.hostname.includes('*')) throw new Error(`${variable} must not include a wildcard`)

  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (mode === 'production') {
    if (url.protocol !== 'https:') throw new Error(`${variable} must use HTTPS in production`)
    if (local) throw new Error(`${variable} must not use a local host in production`)
  } else if (url.protocol !== 'https:' && (url.protocol !== 'http:' || !local)) {
    throw new Error(`${variable} must use HTTPS or local HTTP`)
  }
  return url
}

function validateProductionContract(url: URL, service: ServiceName, variable: string, mode: string): void {
  if (mode !== 'production') return
  if (service === 'api' && (url.origin !== 'https://crrt.ai' || !/^\/api\/?$/.test(url.pathname))) {
    throw new Error(`${variable} must be the production CRRT API`)
  }
  if (service === 'dashboard' && (url.origin !== 'https://crrt.ai' || !/^\/dashboard\/?$/.test(url.pathname))) {
    throw new Error(`${variable} must be the production CRRT dashboard`)
  }
  if (service === 'supabase' && (!/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.pathname !== '/')) {
    throw new Error(`${variable} must be an exact Supabase project origin`)
  }
}

function configuredUrl(
  environment: ExtensionBuildEnvironment,
  variable: keyof ExtensionBuildEnvironment,
  service: ServiceName,
  mode: string,
) {
  const url = serviceUrl(environment[variable], variable, mode)
  validateProductionContract(url, service, variable, mode)
  return url
}

export function extensionManifest(
  { mode }: Pick<ConfigEnv, 'mode'>,
  environment: ExtensionBuildEnvironment = process.env,
): UserManifest {
  const api = configuredUrl(environment, 'WXT_API_BASE', 'api', mode)
  configuredUrl(environment, 'WXT_DASHBOARD_URL', 'dashboard', mode)
  const supabase = configuredUrl(environment, 'WXT_SUPABASE_URL', 'supabase', mode)
  return {
    name: 'CRRT',
    description: 'Drop visual feedback on any page and share it with your CRRT projects.',
    version: '0.1.0',
    permissions: ['activeTab', 'identity', 'scripting', 'storage'],
    host_permissions: [...new Set([`${api.origin}/*`, `${supabase.origin}/*`])],
    // This only lets the explicitly injected, isolated iframe load on a chosen HTTP(S) page.
    // It does not grant CRRT persistent access to those pages.
    web_accessible_resources: [{ resources: ['private.html'], matches: ['http://*/*', 'https://*/*'] }],
    icons,
    action: { default_title: 'CRRT', default_icon: icons },
  }
}

export default defineConfig({
  root: 'apps/extension',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ build: { assetsInlineLimit: Infinity } }),
  hooks: {
    'build:publicAssets': (wxt, files) => {
      files.push({ absoluteSrc: resolve(wxt.config.root, '../../branding/design-system-crrt/Frame 11.png'), relativeDest: 'icon.png' })
    },
  },
  manifest: (environment) => extensionManifest(environment),
})
