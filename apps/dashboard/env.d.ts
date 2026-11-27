/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_REVIEWER_TOKEN?: string
  readonly VITE_USE_MOCKS?: string
  /** "1" turns on direct Send to Agent delivery. Needs the dispatch API. */
  readonly VITE_DIRECT_SEND?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

