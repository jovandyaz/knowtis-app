export const PRODUCTION_HOSTNAME = 'knowtis.app';
export const FIRST_PARTY_ORIGIN = `https://${PRODUCTION_HOSTNAME}`;
export const ANALYTICS_ENVIRONMENT = 'production';
/** Build stamp when Vercel does not inject a commit SHA (local and test builds). */
export const UNKNOWN_APP_VERSION = '0.1.0';
export const APP_VERSION: string =
  import.meta.env.VITE_APP_VERSION || UNKNOWN_APP_VERSION;
