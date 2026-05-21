import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const envDir = path.resolve(__dirname, '../..')

export default defineConfig(({ mode }) => {
  // Merge process.env (Vercel runtime) with .env files (local dev).
  const env = { ...loadEnv(mode, envDir, ''), ...process.env }
  return {
    root: __dirname,
    envDir,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL ?? ''),
      __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_KEY ?? ''),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
