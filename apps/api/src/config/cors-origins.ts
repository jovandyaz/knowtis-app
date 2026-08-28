import { RETRY_AFTER_HEADER } from '../core/http/retry-after.header';

const LOCAL_DEV_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:4400',
] as const;

export function buildAllowedOrigins(
  nodeEnv: string,
  frontendUrl: string,
  backofficeUrl?: string
): string[] {
  const appOrigins = backofficeUrl
    ? [frontendUrl, backofficeUrl]
    : [frontendUrl];
  if (nodeEnv === 'production') {
    return appOrigins;
  }
  return [
    ...appOrigins,
    ...LOCAL_DEV_ORIGINS.filter((origin) => !appOrigins.includes(origin)),
  ];
}

/**
 * CORS settings for the API. Retry-After is exposed because it is not a
 * CORS-safelisted response header, so without this the browser hides every
 * 429's retry hint — the throttler's included.
 */
export function buildCorsOptions(allowedOrigins: string[]) {
  return {
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: [RETRY_AFTER_HEADER],
  };
}
