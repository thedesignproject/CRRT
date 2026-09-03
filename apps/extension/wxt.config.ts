import { defineConfig } from 'wxt'
import { resolve } from 'node:path'

const icons = { 16: 'icon.png', 32: 'icon.png', 48: 'icon.png', 128: 'icon.png' }

export default defineConfig({
  root: 'apps/extension',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ build: { assetsInlineLimit: Infinity } }),
  hooks: {
    'build:publicAssets': (wxt, files) => {
      files.push({ absoluteSrc: resolve(wxt.config.root, '../../branding/design-system-crrt/Frame 11.png'), relativeDest: 'icon.png' })
    },
  },
  manifest: {
    name: 'CRRT',
    description: 'Drop private visual comments on any page.',
    version: '0.1.0',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    web_accessible_resources: [{ resources: ['private.html'], matches: ['http://*/*', 'https://*/*'] }],
    icons,
    action: { default_title: 'CRRT', default_icon: icons },
  },
})
