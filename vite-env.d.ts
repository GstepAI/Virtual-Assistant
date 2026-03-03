/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AZURE_VOICELIVE_API_KEY: string;
  readonly VITE_AZURE_VOICELIVE_ENDPOINT: string;
  readonly VITE_AZURE_VOICELIVE_MODEL: string;
  readonly VITE_USE_CONTENT_API?: string;
  readonly VITE_MEDIA_BLOB_CONTAINER?: string;
  readonly VITE_ADMIN_DEV_KEY?: string;
  readonly VITE_SESSION_DATA_ENDPOINT?: string;
  readonly VITE_BUG_REPORT_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
