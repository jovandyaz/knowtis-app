import type { Response } from 'express';

export const REFRESH_TOKEN_COOKIE_NAME = 'rid';

const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function setRefreshTokenCookie(
  res: Response,
  refreshToken: string,
  isProduction: boolean
): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'strict',
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    path: '/api/v1/auth',
  });
}
