/// <reference types="vite/client" />
import 'wxt/browser'

declare global { interface ImportMetaEnv {
  readonly WXT_SUPABASE_URL: string
  readonly WXT_SUPABASE_ANON_KEY: string
  readonly WXT_API_BASE: string
  readonly WXT_DASHBOARD_URL: string
} }

declare module 'wxt/browser' {
  interface WxtRuntime { getURL(path: '/private.html'): string }
}
