/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL: string
  readonly VITE_EXTENSION_STORE_URL: string
  readonly VITE_EXTENSION_ID?: string
  readonly NEXT_PUBLIC_EXTENSION_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
