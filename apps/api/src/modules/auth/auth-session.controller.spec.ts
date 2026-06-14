import { AuthErrors } from '@jovandyaz/auth/server';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { AuthSessionController } from './auth-session.controller';

function createController(refreshResult: unknown) {
  const refreshHandler = {
    execute: vi.fn().mockResolvedValue(refreshResult),
  };
  const config = {
    get: (key: string, fallback?: string) =>
      ({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://knowtis.app',
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

    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('sets a fresh refresh cookie on success', async () => {
    const { controller } = createController(
      ok({ accessToken: 'at', refreshToken: 'rt' })
    );
    const res = createRes();

    const result = await controller.refresh(req, {}, res);

    expect(result).toEqual({ accessToken: 'at' });
    expect(res.cookie).toHaveBeenCalled();
  });
});
