/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DICOM_WEB_URL: string;
  readonly VITE_DICOM_WEB_NAME: string;
  readonly VITE_REMOTE_SERVER_URL: string;
  readonly VITE_DEFAULT_URLS: string;
  readonly VITE_DEFAULT_NAMES: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __VERSIONS__: Record<string, string>;
declare const __GIT_SHORT_SHA__: string;
