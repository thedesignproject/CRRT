import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(fileURLToPath(import.meta.url))
const repo = resolve(root, '../../..')
export default defineConfig({
  root,
  envDir: false,
  publicDir: resolve(repo, 'apps/landing/public'),
  plugins: [react(), {
    name: 'visual-only-adapters',
    enforce: 'pre',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'dashboard/crrt-isologo.png', source: readFileSync(resolve(repo, 'apps/dashboard/public/crrt-isologo.png')) })
    },
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return
      const target = resolve(dirname(importer.split('?')[0]), source).replace(/\.(tsx?|mjs)$/, '')
      if (['apps/dashboard/lib/supabase', 'apps/landing/lib/supabase'].some(p => target === resolve(repo, p))) return resolve(root, 'supabase.ts')
    },
    transform(code, id) {
      if (id === resolve(repo, 'apps/dashboard/globals.css')) return code.replace('@import \"tailwindcss\";', '@import \"tailwindcss\" source(\".\");')
      if (id === resolve(repo, 'apps/dashboard/lib/routes.ts')) return code.replaceAll('import.meta.env.BASE_URL', JSON.stringify('/dashboard/'))
      if (id === resolve(repo, 'apps/dashboard/lib/mocks.ts')) return code.replace('const mockMode = import.meta.env.VITE_USE_MOCKS', "const mockMode = new URLSearchParams(location.search).get('mock') ?? '1'")
    },
  }, tailwindcss()],
  resolve: { alias: {
    '@widget': resolve(repo, 'src'), '@branding': resolve(repo, 'branding'),
    'wxt/browser': resolve(root, 'browser.ts'),
    'html2canvas-pro': resolve(root, 'capture.ts'),
    'storybook/manager-api': resolve(root, 'storybook.ts'),
  } },
  define: {
    'process.env.STORYBOOK_CRRT_CONNECTION_ID': 'undefined',
    'process.env.STORYBOOK_CRRT_PROJECT_KEY': 'undefined',
    'process.env.STORYBOOK_CRRT_API_BASE': 'undefined',
    'process.env.STORYBOOK_CRRT_DASHBOARD_URL': 'undefined',
    'import.meta.env.VITE_API_BASE': JSON.stringify('/api'),
    'import.meta.env.WXT_API_BASE': JSON.stringify('/api'),
    'import.meta.env.WXT_DASHBOARD_URL': JSON.stringify('http://127.0.0.1:4380/dashboard/'),
  },
  server: { host: '127.0.0.1', port: 4380, strictPort: true, fs: { allow: [repo] } },
  build: { outDir: resolve(repo, 'artifacts/chromatic-simple/app'), emptyOutDir: true, target: 'esnext' },
  preview: { host: '127.0.0.1', port: 4380, strictPort: true },
})
