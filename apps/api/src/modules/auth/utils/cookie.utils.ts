import { Logger } from '@nestjs/common';
import type { Response } from 'express';

const logger = new Logger('CookieUtils');

export const REFRESH_COOKIE_NAMES = {
  app: 'rid',
  backoffice: 'rid_bo',
} as const;

export type RefreshCookieName =
  (typeof REFRESH_COOKIE_NAMES)[keyof typeof REFRESH_COOKIE_NAMES];

const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CookieConfig {
  secure: boolean;
  domain?: string | undefined;
  name: RefreshCookieName;
}

function isSameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Returns the refresh-cookie name for the calling frontend. The notes app and
 * the backoffice talk to one API origin, so a single cookie name would make
 * them share and rotate one refresh token — each app's refresh would then hand
 * back the other's identity, and an admin token would leak into the notes app.
 */
export function resolveRefreshCookieName(
  origin: string | undefined,
  backofficeUrl: string | undefined
): RefreshCookieName {
  if (!origin || !backofficeUrl || !isSameOrigin(origin, backofficeUrl)) {
    return REFRESH_COOKIE_NAMES.app;
  }
  return REFRESH_COOKIE_NAMES.backoffice;
}

export function deriveCookieDomain(frontendUrl: string): string | undefined {
  try {
    const hostname = new URL(frontendUrl).hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return `.${parts.slice(-2).join('.')}`;
    }
  } catch (error) {
    logger.warn(
      `deriveCookieDomain: invalid URL "${frontendUrl}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
  return undefined;
}

function baseCookieOptions(config: CookieConfig) {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
  } as const;
}

export function setRefreshTokenCookie(
  res: Response,
  refreshToken: string,
  config: CookieConfig
): void {
  res.cookie(config.name, refreshToken, {
    ...baseCookieOptions(config),
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    ...(config.domain && { domain: config.domain }),
  });
}

export function clearRefreshTokenCookie(
  res: Response,
  config: CookieConfig
): void {
  res.clearCookie(config.name, {
    ...baseCookieOptions(config),
    ...(config.domain && { domain: config.domain }),
  });
}

export function clearLegacyHostOnlyCookie(
  res: Response,
  config: CookieConfig
): void {
  if (!config.domain) {
    return;
  }

  res.clearCookie(config.name, baseCookieOptions(config));
}
