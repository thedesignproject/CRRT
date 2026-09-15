import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const envDir = path.resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, envDir, ''), ...process.env }
  return {
    root: __dirname,
    envDir,
    plugins: [react(), tailwindcss()],
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
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
