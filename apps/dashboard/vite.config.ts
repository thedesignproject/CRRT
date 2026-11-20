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
    cacheDir: path.resolve(envDir, 'node_modules/.vite-dashboard'),
    // Served as a sub-path of the landing site so both ship from one Vercel deploy.
    base: '/dashboard/',
    envDir,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // The design system ships as source (packages/ui, see its README).
        '@crrt/ui': path.resolve(__dirname, '../../packages/ui/src'),
      },
      // packages/ui may have its own node_modules locally; keep one React and one icon set.
      dedupe: ['react', 'react-dom', 'lucide-react', 'clsx', 'tailwind-merge'],
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
