import { describe, expect, it, vi } from 'vitest';

import type { CookieConfig } from '../cookie.utils';
import {
  clearRefreshTokenCookie,
  deriveCookieDomain,
  REFRESH_TOKEN_COOKIE_NAME,
  setRefreshTokenCookie,
} from '../cookie.utils';

function createMockResponse() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as import('express').Response;
}

const devConfig: CookieConfig = { secure: false };
const prodConfig: CookieConfig = { secure: true, domain: '.example.com' };

describe('deriveCookieDomain', () => {
  it('should extract root domain from standard URL', () => {
    expect(deriveCookieDomain('https://app.knowtis.com')).toBe('.knowtis.com');
  });

  it('should extract root domain from subdomain URL', () => {
    expect(deriveCookieDomain('https://notes.app.knowtis.com')).toBe(
      '.knowtis.com'
    );
  });

  it('should return undefined for localhost', () => {
    expect(deriveCookieDomain('http://localhost:4200')).toBeUndefined();
  });

  it('should return undefined for invalid URL', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(deriveCookieDomain('not-a-url')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should return undefined for empty string', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(deriveCookieDomain('')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('cookie.utils', () => {
  describe('setRefreshTokenCookie', () => {
    it('should set cookie with httpOnly, sameSite=lax, path=/api/v1/auth', () => {
      const res = createMockResponse();
      setRefreshTokenCookie(res, 'my-refresh-token', devConfig);

      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        'my-refresh-token',
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/api/v1/auth',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        })
      );
    });

    it('should not include domain when not configured', () => {
      const res = createMockResponse();
      setRefreshTokenCookie(res, 'token', devConfig);

      const options = (res.cookie as ReturnType<typeof vi.fn>).mock.calls[0][2];
      expect(options).not.toHaveProperty('domain');
    });

    it('should set secure=true and domain when configured', () => {
      const res = createMockResponse();
      setRefreshTokenCookie(res, 'token', prodConfig);

      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        'token',
        expect.objectContaining({
          secure: true,
          domain: '.example.com',
        })
      );
    });
  });

  describe('clearRefreshTokenCookie', () => {
    it('should clear the cookie with options matching setRefreshTokenCookie (dev)', () => {
      const res = createMockResponse();
      clearRefreshTokenCookie(res, devConfig);

      const options = (res.clearCookie as ReturnType<typeof vi.fn>).mock
        .calls[0][1];
      expect(options).toMatchObject({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/api/v1/auth',
      });
      expect(options).not.toHaveProperty('domain');
    });

    it('should clear the cookie with options matching setRefreshTokenCookie (prod)', () => {
      const res = createMockResponse();
      clearRefreshTokenCookie(res, prodConfig);

      expect(res.clearCookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/api/v1/auth',
          domain: '.example.com',
        })
      );
    });
  });
});
