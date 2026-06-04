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
    // Served as a sub-path of the landing site so both ship from one Vercel deploy.
    base: '/dashboard/',
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
      // Emit into the landing build output so one Vercel project serves both.
      // Only this sub-dir is cleared, leaving the landing build (run first) intact.
      outDir: path.resolve(__dirname, '../landing/dist/dashboard'),
      emptyOutDir: true,
    },
  }
})
