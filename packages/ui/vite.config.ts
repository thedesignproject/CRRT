import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// No "@" alias on purpose: apps/dashboard owns "@", and it imports this package's
// source directly, so every import in src/ stays relative.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
