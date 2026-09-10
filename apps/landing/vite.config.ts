import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'node:fs'

export default defineConfig({
  root: __dirname,
  envDir: path.resolve(__dirname, '../..'),
  plugins: [react(), tailwindcss(), {
    name: 'crrt-static-tokens',
    transformIndexHtml() {
      return [{ tag: 'style', attrs: { 'data-source': 'crrt-tokens' },
        children: readFileSync(path.resolve(__dirname, '../../branding/crrt/tokens.css'), 'utf8'),
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
  server: {
    port: 5175,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
