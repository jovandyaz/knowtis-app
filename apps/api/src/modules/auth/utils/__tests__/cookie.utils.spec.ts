import { describe, expect, it, vi } from 'vitest';

import {
  clearRefreshTokenCookie,
  REFRESH_TOKEN_COOKIE_NAME,
  setRefreshTokenCookie,
} from '../cookie.utils';

function createMockResponse() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as import('express').Response;
}

describe('cookie.utils', () => {
  describe('setRefreshTokenCookie', () => {
    it('should set cookie with httpOnly, secure, sameSite=strict, path=/api/v1/auth', () => {
      const res = createMockResponse();
      setRefreshTokenCookie(res, 'my-refresh-token', false);

      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        'my-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'strict',
          path: '/api/v1/auth',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        })
      );
    });

    it('should set secure=true in production', () => {
      const res = createMockResponse();
      setRefreshTokenCookie(res, 'token', true);

      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        'token',
        expect.objectContaining({ secure: true })
      );
    });
  });

  describe('clearRefreshTokenCookie', () => {
    it('should clear the cookie with matching path', () => {
      const res = createMockResponse();
      clearRefreshTokenCookie(res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        expect.objectContaining({
          httpOnly: true,
          path: '/api/v1/auth',
        })
      );
    });
  });
});
