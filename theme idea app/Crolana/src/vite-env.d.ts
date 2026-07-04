

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN: string
  readonly VITE_ENABLE_WALLETCONNECT: string
  readonly VITE_WALLETCONNECT_PROJECT_ID: string
  readonly VITE_API_URL: string
  readonly CAPACITOR_URL: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly SSR: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
