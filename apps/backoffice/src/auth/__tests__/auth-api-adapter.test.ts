import { describe, expect, it, vi } from 'vitest';

import type { IHttpClient } from '@knowtis/api-client';

import { createBackofficeAuthApi } from '../auth-api-adapter';

function mockHttpClient(overrides: Partial<IHttpClient> = {}): IHttpClient {
  return {
    setTokenProvider: vi.fn(),
    setRefreshTokenCallback: vi.fn(),
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as IHttpClient;
}

const tokenStorage = {
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(),
  getExpiresAt: vi.fn(),
  clearTokens: vi.fn(),
  hasTokens: vi.fn(),
  subscribe: vi.fn(),
};

describe('createBackofficeAuthApi', () => {
  it('getProfile unwraps the user and preserves role', async () => {
    const get = vi.fn().mockResolvedValue({
      user: {
        id: 'u1',
        email: 'a@b.c',
        name: 'Admin',
        avatarUrl: null,
        role: 'admin',
      },
    });
    const api = createBackofficeAuthApi({
      httpClient: mockHttpClient({ get }),
      tokenStorage,
    });

    const profile = await api.getProfile();

    expect(get).toHaveBeenCalledWith('/auth/me');
    expect(profile.role).toBe('admin');
  });

  it('refreshToken stores the rotated access token', async () => {
    const post = vi
      .fn()
      .mockResolvedValue({ accessToken: 'new-token', expiresIn: 900 });
    const api = createBackofficeAuthApi({
      httpClient: mockHttpClient({ post }),
      tokenStorage,
    });

    await api.refreshToken();

    expect(post).toHaveBeenCalledWith('/auth/refresh', {}, { skipAuth: true });
    expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('new-token');
  });

  it('register is not supported in the backoffice', async () => {
    const api = createBackofficeAuthApi({
      httpClient: mockHttpClient(),
      tokenStorage,
    });

    await expect(
      api.register({ email: 'a@b.c', password: 'x', name: 'x' })
    ).rejects.toThrow('not supported');
  });
});
