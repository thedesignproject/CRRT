import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  // Stories should opt into fixtures instead of inheriting local API credentials.
  envDir: false,
})
