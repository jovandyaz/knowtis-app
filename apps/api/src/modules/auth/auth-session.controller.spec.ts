import { AuthErrors } from '@jovandyaz/auth/server';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { AuthSessionController } from './auth-session.controller';
import { REFRESH_COOKIE_NAMES } from './utils/cookie.utils';

const BACKOFFICE_ORIGIN = 'https://backoffice.knowtis.app';
const NOTES_ORIGIN = 'https://app.knowtis.app';

function createController(refreshResult: unknown) {
  const refreshHandler = {
    execute: vi.fn().mockResolvedValue(refreshResult),
  };
  const config = {
    get: (key: string, fallback?: string) =>
      ({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://knowtis.app',
        BACKOFFICE_URL: BACKOFFICE_ORIGIN,
      })[key] ?? fallback,
  } as unknown as ConfigService;

  const controller = new AuthSessionController(
    {} as never,
    {} as never,
    refreshHandler as never,
    {} as never,
    {} as never,
    {} as never,
    config
  );

  return { controller, refreshHandler };
}

function createRes() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
}

const req = { cookies: { rid: 'stale-token' } } as unknown as Request;

describe('AuthSessionController.refresh', () => {
  it('clears the legacy host-only cookie even when refresh fails with reuse', async () => {
    const { controller } = createController(
      err(AuthErrors.tokenReuseDetected('user-1'))
    );
    const res = createRes();

    await expect(controller.refresh(req, {}, res)).rejects.toThrow();

    expect(res.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAMES.app,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
      })
    );
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('sets a fresh refresh cookie on success', async () => {
    const { controller } = createController(
      ok({ accessToken: 'at', refreshToken: 'rt' })
    );
    const res = createRes();

    const result = await controller.refresh(req, {}, res);

    expect(result).toEqual({ accessToken: 'at' });
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAMES.app,
      'rt',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
      })
    );
  });
});

describe('AuthSessionController refresh cookie isolation', () => {
  const bothCookies = {
    cookies: {
      [REFRESH_COOKIE_NAMES.app]: 'notes-token',
      [REFRESH_COOKIE_NAMES.backoffice]: 'backoffice-token',
    },
  } as unknown as Request;

  it('consumes the backoffice token when refreshing from the backoffice origin', async () => {
    const { controller, refreshHandler } = createController(
      ok({ accessToken: 'at', refreshToken: 'rt' })
    );

    await controller.refresh(bothCookies, {}, createRes(), BACKOFFICE_ORIGIN);

    expect(refreshHandler.execute).toHaveBeenCalledWith('backoffice-token');
  });

  it('consumes the notes token when refreshing from the notes origin', async () => {
    const { controller, refreshHandler } = createController(
      ok({ accessToken: 'at', refreshToken: 'rt' })
    );

    await controller.refresh(bothCookies, {}, createRes(), NOTES_ORIGIN);

    expect(refreshHandler.execute).toHaveBeenCalledWith('notes-token');
  });

  it('rotates only the backoffice cookie when the backoffice refreshes', async () => {
    const { controller } = createController(
      ok({ accessToken: 'at', refreshToken: 'rotated' })
    );
    const res = createRes();

    await controller.refresh(bothCookies, {}, res, BACKOFFICE_ORIGIN);

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAMES.backoffice,
      'rotated',
      expect.anything()
    );
    expect(res.cookie).not.toHaveBeenCalledWith(
      REFRESH_COOKIE_NAMES.app,
      expect.anything(),
      expect.anything()
    );
  });

  it('clears only the backoffice cookie when the backoffice logs out', async () => {
    const { controller } = createController(ok(undefined));
    const logoutHandler = { execute: vi.fn().mockResolvedValue(ok(undefined)) };
    Object.assign(controller, { logoutHandler });
    const res = createRes();

    await controller.logout(bothCookies, {}, res, BACKOFFICE_ORIGIN);

    const clearedNames = (
      res.clearCookie as ReturnType<typeof vi.fn>
    ).mock.calls.map((call) => call[0]);
    expect(clearedNames).toContain(REFRESH_COOKIE_NAMES.backoffice);
    expect(clearedNames).not.toContain(REFRESH_COOKIE_NAMES.app);
  });
});
