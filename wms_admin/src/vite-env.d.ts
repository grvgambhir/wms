/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WMS_BACKEND_URL?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_REGION?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  readonly VITE_DEMO_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
