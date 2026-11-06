import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'node:fs'

const envDir = path.resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, envDir, ''), ...process.env }
  return {
    root: __dirname,
    cacheDir: path.resolve(envDir, 'node_modules/.vite-landing'),
    envDir,
    plugins: [react(), tailwindcss(), {
      name: 'crrt-static-tokens',
      transformIndexHtml() {
        return [{ tag: 'style', attrs: { 'data-source': 'crrt-tokens' },
          // The landing self-hosts these fonts; retain the canonical tokens
          // without their optional Google Fonts fallback for other consumers.
          children: readFileSync(path.resolve(__dirname, '../../branding/crrt/tokens.css'), 'utf8')
            .replace(/@import\s+url\([^)]*\)\s*;/g, ''),
          injectTo: 'head-prepend' as const }]
      },
    }],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@widget': path.resolve(__dirname, '../../src'),
        '@branding': path.resolve(__dirname, '../../branding'),
      },
    },
    define: {
      'globalThis.__CRRT_SUPABASE_URL__': JSON.stringify(env.SUPABASE_URL ?? ''),
      'globalThis.__CRRT_SUPABASE_ANON_KEY__': JSON.stringify(env.SUPABASE_KEY ?? ''),
    },
    server: {
      port: 5175,
      strictPort: false,
    },
    build: {
      manifest: true,
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
