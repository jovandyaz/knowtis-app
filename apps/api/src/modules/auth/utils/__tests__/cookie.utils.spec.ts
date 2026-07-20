import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { buildAllowedOrigins } from '../../../../config/cors-origins';
import type { CookieConfig } from '../cookie.utils';
import {
  clearLegacyHostOnlyCookie,
  clearRefreshTokenCookie,
  deriveCookieDomain,
  REFRESH_COOKIE_NAMES,
  resolveRefreshCookieName,
  setRefreshTokenCookie,
} from '../cookie.utils';

function createMockResponse() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as import('express').Response;
}

const devConfig: CookieConfig = {
  secure: false,
  name: REFRESH_COOKIE_NAMES.app,
};
const prodConfig: CookieConfig = {
  secure: true,
  domain: '.example.com',
  name: REFRESH_COOKIE_NAMES.app,
};

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
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    expect(deriveCookieDomain('not-a-url')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should return undefined for empty string', () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    expect(deriveCookieDomain('')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('resolveRefreshCookieName', () => {
  const BACKOFFICE_URL = 'https://backoffice.knowtis.app';
  const NOTES_ORIGIN = 'https://app.knowtis.app';

  it('should give the notes app and the backoffice different cookie names', () => {
    expect(resolveRefreshCookieName(NOTES_ORIGIN, BACKOFFICE_URL)).not.toBe(
      resolveRefreshCookieName(BACKOFFICE_URL, BACKOFFICE_URL)
    );
  });

  it('should return the backoffice cookie for the backoffice origin', () => {
    expect(resolveRefreshCookieName(BACKOFFICE_URL, BACKOFFICE_URL)).toBe(
      REFRESH_COOKIE_NAMES.backoffice
    );
  });

  it('should return the default cookie for the notes app origin', () => {
    expect(resolveRefreshCookieName(NOTES_ORIGIN, BACKOFFICE_URL)).toBe(
      REFRESH_COOKIE_NAMES.app
    );
  });

  it('should return the default cookie when no origin header is present', () => {
    expect(resolveRefreshCookieName(undefined, BACKOFFICE_URL)).toBe(
      REFRESH_COOKIE_NAMES.app
    );
  });

  it('should return the default cookie when no backoffice URL is configured', () => {
    expect(resolveRefreshCookieName(BACKOFFICE_URL, undefined)).toBe(
      REFRESH_COOKIE_NAMES.app
    );
  });

  it('should match the backoffice origin regardless of path or trailing slash', () => {
    expect(resolveRefreshCookieName(BACKOFFICE_URL, `${BACKOFFICE_URL}/`)).toBe(
      REFRESH_COOKIE_NAMES.backoffice
    );
  });

  it('should not match a look-alike host that merely embeds the backoffice domain', () => {
    expect(
      resolveRefreshCookieName(
        'https://backoffice.knowtis.app.attacker.test',
        BACKOFFICE_URL
      )
    ).toBe(REFRESH_COOKIE_NAMES.app);
  });

  it('should return the default cookie for a malformed origin', () => {
    expect(resolveRefreshCookieName('not-a-url', BACKOFFICE_URL)).toBe(
      REFRESH_COOKIE_NAMES.app
    );
  });

  // Guard for the next frontend: every production CORS origin must map to its
  // own refresh cookie, or two frontends silently share one rotating session.
  // If this fails, add a name to REFRESH_COOKIE_NAMES before enabling CORS.
  it('should give every allowed production origin a distinct cookie name', () => {
    const origins = buildAllowedOrigins(
      'production',
      NOTES_ORIGIN,
      BACKOFFICE_URL
    );
    const names = origins.map((origin) =>
      resolveRefreshCookieName(origin, BACKOFFICE_URL)
    );

    expect(new Set(names).size).toBe(origins.length);
  });
});

describe('cookie.utils', () => {
  describe('setRefreshTokenCookie', () => {
    it('should write the cookie name carried by the config', () => {
      const res = createMockResponse();
      setRefreshTokenCookie(res, 'token', {
        ...prodConfig,
        name: REFRESH_COOKIE_NAMES.backoffice,
      });

      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE_NAMES.backoffice,
        'token',
        expect.anything()
      );
    });

    it('should set cookie with httpOnly, sameSite=lax, path=/api/v1/auth', () => {
      const res = createMockResponse();
      setRefreshTokenCookie(res, 'my-refresh-token', devConfig);

      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE_NAMES.app,
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
        REFRESH_COOKIE_NAMES.app,
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
        REFRESH_COOKIE_NAMES.app,
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

  describe('clearLegacyHostOnlyCookie', () => {
    it('should clear host-only cookie without domain attribute when config has domain', () => {
      const res = createMockResponse();
      clearLegacyHostOnlyCookie(res, prodConfig);

      expect(res.clearCookie).toHaveBeenCalledWith(
        REFRESH_COOKIE_NAMES.app,
        expect.objectContaining({
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/api/v1/auth',
        })
      );
      const options = (res.clearCookie as ReturnType<typeof vi.fn>).mock
        .calls[0][1];
      expect(options).not.toHaveProperty('domain');
    });

    it('should not clear anything when config has no domain (dev)', () => {
      const res = createMockResponse();
      clearLegacyHostOnlyCookie(res, devConfig);

      expect(res.clearCookie).not.toHaveBeenCalled();
    });
  });
});
