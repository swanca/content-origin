/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_GSC_VERIFICATION?: string;
  readonly PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
