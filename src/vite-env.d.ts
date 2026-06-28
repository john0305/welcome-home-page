/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_SUPABASE_PROJECT_ID: string
  readonly VITE_ETSY_REDIRECT_URI: string
  readonly VITE_GA_MEASUREMENT_ID: string
  readonly VITE_GA_PROPERTY_ID: string
  readonly VITE_APP_URL: string
  readonly VITE_PAYMENTS_CLIENT_TOKEN: string
  readonly VITE_SHOW_AGENCY_TIER: string
  readonly VITE_CHROMA_URL: string
  readonly VITE_MODEL_VERSION: string
  readonly VITE_TRYON_ENABLED: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
