/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_PROJECT_KEY?: string
  readonly VITE_PROJECT_ID?: string
  readonly VITE_CHROME_EXTENSION_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
