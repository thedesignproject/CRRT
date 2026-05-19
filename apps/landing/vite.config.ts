import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  root: __dirname,
  envDir: path.resolve(__dirname, '../..'),
  plugins: [react(), tailwindcss()],
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
