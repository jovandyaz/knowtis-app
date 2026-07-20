import type { TokenStorage } from '@jovandyaz/auth-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IHttpClient } from './http-client';
import { refreshSessionTokens } from './session-refresh';

function createHttpClient(accessToken = 'new-access') {
  return {
    post: vi.fn().mockResolvedValue({ accessToken, refreshToken: 'rt' }),
  } as unknown as IHttpClient;
}

function createTokenStorage() {
  return {
    setAccessToken: vi.fn(),
    getAccessToken: vi.fn(),
    clearTokens: vi.fn(),
    hasTokens: vi.fn(),
  } as unknown as TokenStorage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshSessionTokens', () => {
  it('serializes the refresh through the Web Locks API when available', async () => {
    const acquired: string[] = [];
    const locks = {
      request: vi.fn(async (name: string, cb: (lock: unknown) => unknown) => {
        acquired.push(name);
        return cb({ name });
      }),
    };
    vi.stubGlobal('navigator', { locks });
    const httpClient = createHttpClient();
    const tokenStorage = createTokenStorage();

    await refreshSessionTokens(httpClient, tokenStorage);

    expect(acquired).toEqual(['knowtis-auth-refresh']);
    expect(httpClient.post).toHaveBeenCalledWith(
      '/auth/refresh',
      {},
      {
        skipAuth: true,
      }
    );
    expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('new-access');
  });

  it('falls back to a direct refresh when Web Locks is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const httpClient = createHttpClient();
    const tokenStorage = createTokenStorage();

    const tokens = await refreshSessionTokens(httpClient, tokenStorage);

    expect(tokens.accessToken).toBe('new-access');
    expect(httpClient.post).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent callers in the same tab into a single request', async () => {
    vi.stubGlobal('navigator', {});
    const httpClient = createHttpClient();
    const tokenStorage = createTokenStorage();

    const [first, second] = await Promise.all([
      refreshSessionTokens(httpClient, tokenStorage),
      refreshSessionTokens(httpClient, tokenStorage),
    ]);

    expect(httpClient.post).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });
});
