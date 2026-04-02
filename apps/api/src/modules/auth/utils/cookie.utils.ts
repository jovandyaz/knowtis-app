import type { Response } from 'express';

export const REFRESH_TOKEN_COOKIE_NAME = 'rid';

const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CookieConfig {
  secure: boolean;
  domain?: string | undefined;
}

export function deriveCookieDomain(frontendUrl: string): string | undefined {
  try {
    const hostname = new URL(frontendUrl).hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return `.${parts.slice(-2).join('.')}`;
    }
  } catch (error) {
    console.warn(`deriveCookieDomain: invalid URL "${frontendUrl}"`, error);
  }
  return undefined;
}

export function setRefreshTokenCookie(
  res: Response,
  refreshToken: string,
  config: CookieConfig
): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: config.secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    ...(config.domain && { domain: config.domain }),
  });
}

export function clearRefreshTokenCookie(
  res: Response,
  config: CookieConfig
): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    secure: config.secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    ...(config.domain && { domain: config.domain }),
  });
}
