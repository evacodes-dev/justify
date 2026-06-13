/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DYNAMIC_ENVIRONMENT_ID: string
  readonly VITE_API_BASE?: string
  readonly VITE_WORLD_APP_ID?: string
  readonly VITE_WORLD_RP_ID?: string
  readonly VITE_WORLD_ACTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
