// Jev preview: renders the component Jev picked, from scripts/jev/preview/selection.json.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  server: { port: 4340, strictPort: true, host: '127.0.0.1' },
})
