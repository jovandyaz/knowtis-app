import type { AuthResponse, AuthTokens } from '@jovandyaz/auth';
import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IHttpClient } from '@knowtis/api-client';

import { createAuthApiAdapter } from '../auth-api-adapter';

function createMockHttpClient() {
  const mock = {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setTokenProvider: vi.fn(),
    setRefreshTokenCallback: vi.fn(),
  };
  return mock as IHttpClient & typeof mock;
}

function createMockTokenStorage(): TokenStorage {
  return {
    setAccessToken: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    getExpiresAt: vi.fn().mockReturnValue(null),
    clearTokens: vi.fn(),
    hasTokens: vi.fn().mockReturnValue(false),
    subscribe: vi.fn().mockReturnValue(() => {}),
  };
}

function createMockAuthStore(): AuthStoreInstance {
  const state = {
    user: null as { isAnonymous?: boolean } | null,
    isAuthenticated: false,
    isLoading: false,
    setUser: vi.fn(),
    handleAuthSuccess: vi.fn(),
    logout: vi.fn(),
    setLoading: vi.fn(),
  };
  const store = (() => state) as unknown as AuthStoreInstance;
  store.getState = () => state as ReturnType<AuthStoreInstance['getState']>;
  store.setState = vi.fn() as AuthStoreInstance['setState'];
  store.subscribe = vi
    .fn()
    .mockReturnValue(() => {}) as AuthStoreInstance['subscribe'];
  return store;
}

const AUTH_RESPONSE: AuthResponse = {
  user: { id: '1', email: 'a@b.com', name: 'Test', avatarUrl: null },
  tokens: { accessToken: 'at', refreshToken: 'rt' },
};

const AUTH_TOKENS: AuthTokens = {
  accessToken: 'new-at',
  refreshToken: 'new-rt',
};

describe('createAuthApiAdapter', () => {
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let tokenStorage: ReturnType<typeof createMockTokenStorage>;
  let authStore: ReturnType<typeof createMockAuthStore>;

  beforeEach(() => {
    httpClient = createMockHttpClient();
    tokenStorage = createMockTokenStorage();
    authStore = createMockAuthStore();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('registers a refresh token callback on creation', () => {
    createAuthApiAdapter({ httpClient, tokenStorage, authStore });
    expect(httpClient.setRefreshTokenCallback).toHaveBeenCalledOnce();
    expect(httpClient.setRefreshTokenCallback).toHaveBeenCalledWith(
      expect.any(Function)
    );
  });

  describe('login', () => {
    it('calls POST /auth/login with skipAuth and stores access token only', async () => {
      httpClient.post.mockResolvedValue(AUTH_RESPONSE);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      const result = await adapter.login({
        email: 'a@b.com',
        password: 'pass',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/login',
        { email: 'a@b.com', password: 'pass' },
        { skipAuth: true }
      );
      expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('at');
      expect(result).toBe(AUTH_RESPONSE);
    });

    it('forwards anonymousUserId + anonymousToken when a stored anonymous session exists, then clears it', async () => {
      localStorage.setItem(
        'knowtis-anon',
        JSON.stringify({
          userId: 'anon-1',
          accessToken: 'anon-jwt',
          expiresAt: Date.now() + 60_000,
        })
      );
      httpClient.post.mockResolvedValue(AUTH_RESPONSE);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      await adapter.login({ email: 'a@b.com', password: 'pass' });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/login',
        expect.objectContaining({
          email: 'a@b.com',
          password: 'pass',
          anonymousUserId: 'anon-1',
          anonymousToken: 'anon-jwt',
        }),
        { skipAuth: true }
      );
      expect(localStorage.getItem('knowtis-anon')).toBeNull();
    });
  });

  describe('register', () => {
    it('calls POST /auth/register with skipAuth and stores access token only', async () => {
      httpClient.post.mockResolvedValue(AUTH_RESPONSE);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      const result = await adapter.register({
        email: 'a@b.com',
        name: 'Test',
        password: 'pass',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/register',
        { email: 'a@b.com', name: 'Test', password: 'pass' },
        { skipAuth: true }
      );
      expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('at');
      expect(result).toBe(AUTH_RESPONSE);
    });

    it('forwards anonymousUserId + anonymousToken when a stored anonymous session exists, then clears it', async () => {
      localStorage.setItem(
        'knowtis-anon',
        JSON.stringify({
          userId: 'anon-1',
          accessToken: 'anon-jwt',
          expiresAt: Date.now() + 60_000,
        })
      );
      httpClient.post.mockResolvedValue(AUTH_RESPONSE);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      await adapter.register({
        email: 'a@b.com',
        name: 'Test',
        password: 'pass',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/register',
        expect.objectContaining({
          email: 'a@b.com',
          name: 'Test',
          password: 'pass',
          anonymousUserId: 'anon-1',
          anonymousToken: 'anon-jwt',
        }),
        { skipAuth: true }
      );
      expect(localStorage.getItem('knowtis-anon')).toBeNull();
    });
  });

  describe('logout', () => {
    it('sends empty body to /auth/logout then clears tokens', async () => {
      httpClient.post.mockResolvedValue(undefined);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      await adapter.logout();

      expect(httpClient.post).toHaveBeenCalledWith('/auth/logout', {});
      expect(tokenStorage.clearTokens).toHaveBeenCalledOnce();
    });

    it('clears tokens even if the server call fails', async () => {
      httpClient.post.mockRejectedValue(new Error('network'));
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      await adapter.logout();

      expect(tokenStorage.clearTokens).toHaveBeenCalledOnce();
    });
  });

  describe('refreshToken', () => {
    it('calls POST /auth/refresh with empty body and stores access token only', async () => {
      httpClient.post.mockResolvedValue(AUTH_TOKENS);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      const result = await adapter.refreshToken();

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/refresh',
        {},
        { skipAuth: true }
      );
      expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('new-at');
      expect(result).toBe(AUTH_TOKENS);
    });
  });

  describe('getProfile', () => {
    it('calls GET /auth/me (authenticated)', async () => {
      const profile = {
        id: '1',
        email: 'a@b.com',
        name: 'Test',
        avatarUrl: null,
      };
      httpClient.get.mockResolvedValue(profile);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      const result = await adapter.getProfile();

      expect(httpClient.get).toHaveBeenCalledWith('/auth/me');
      expect(result).toBe(profile);
    });
  });

  describe('forgotPassword', () => {
    it('calls POST /auth/forgot-password with skipAuth', async () => {
      httpClient.post.mockResolvedValue(undefined);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      await adapter.forgotPassword('a@b.com');

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/forgot-password',
        { email: 'a@b.com' },
        { skipAuth: true }
      );
    });
  });

  describe('resetPassword', () => {
    it('calls POST /auth/reset-password with skipAuth', async () => {
      httpClient.post.mockResolvedValue(undefined);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      await adapter.resetPassword('tok', 'newpass');

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/reset-password',
        { token: 'tok', newPassword: 'newpass' },
        { skipAuth: true }
      );
    });
  });

  describe('verifyEmail', () => {
    it('calls POST /auth/verify-email with skipAuth', async () => {
      httpClient.post.mockResolvedValue(undefined);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      await adapter.verifyEmail('tok');

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/verify-email',
        { token: 'tok' },
        { skipAuth: true }
      );
    });
  });

  describe('resendVerification', () => {
    it('calls POST /auth/resend-verification (authenticated)', async () => {
      httpClient.post.mockResolvedValue(undefined);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      await adapter.resendVerification();

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/resend-verification',
        {}
      );
    });
  });

  describe('refresh token callback', () => {
    it('returns new access token on successful refresh', async () => {
      httpClient.post.mockResolvedValue(AUTH_TOKENS);
      authStore.getState().user = { isAnonymous: false } as ReturnType<
        AuthStoreInstance['getState']
      >['user'];
      createAuthApiAdapter({ httpClient, tokenStorage, authStore });

      const callback = httpClient.setRefreshTokenCallback.mock.calls[0][0];
      const result = await callback();

      expect(result).toBe('new-at');
    });

    it('clears store, redirects to login and returns null on refresh failure for non-anonymous user', async () => {
      const onSessionLost = vi.fn();
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      httpClient.post.mockRejectedValue(new Error('expired'));
      authStore.getState().user = { isAnonymous: false } as ReturnType<
        AuthStoreInstance['getState']
      >['user'];
      createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
        onSessionLost,
      });

      const callback = httpClient.setRefreshTokenCallback.mock.calls[0][0];
      const result = await callback();

      expect(result).toBeNull();
      await vi.waitFor(() => {
        expect(tokenStorage.clearTokens).toHaveBeenCalled();
      });
      expect(authStore.getState().logout).toHaveBeenCalledTimes(1);
      expect(onSessionLost).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshToken idempotency', () => {
    it('coalesces concurrent refresh calls into a single POST /auth/refresh', async () => {
      let resolvePost: (value: AuthTokens) => void = () => {};
      httpClient.post.mockImplementation(
        () =>
          new Promise<AuthTokens>((resolve) => {
            resolvePost = resolve;
          })
      );
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      const callA = adapter.refreshToken();
      const callB = adapter.refreshToken();
      const callC = adapter.refreshToken();

      expect(httpClient.post).toHaveBeenCalledTimes(1);

      resolvePost(AUTH_TOKENS);
      const [resA, resB, resC] = await Promise.all([callA, callB, callC]);

      expect(resA).toBe(AUTH_TOKENS);
      expect(resB).toBe(AUTH_TOKENS);
      expect(resC).toBe(AUTH_TOKENS);
      expect(tokenStorage.setAccessToken).toHaveBeenCalledTimes(1);
    });

    it('allows a new refresh after the previous one settles', async () => {
      httpClient.post.mockResolvedValueOnce(AUTH_TOKENS);
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      await adapter.refreshToken();

      httpClient.post.mockResolvedValueOnce({
        accessToken: 'second-at',
        refreshToken: 'second-rt',
      });
      const second = await adapter.refreshToken();

      expect(httpClient.post).toHaveBeenCalledTimes(2);
      expect(second.accessToken).toBe('second-at');
    });

    it('clears the in-flight promise on failure so retries are possible', async () => {
      httpClient.post.mockRejectedValueOnce(new Error('boom'));
      const adapter = createAuthApiAdapter({
        httpClient,
        tokenStorage,
        authStore,
      });

      await expect(adapter.refreshToken()).rejects.toThrow('boom');

      httpClient.post.mockResolvedValueOnce(AUTH_TOKENS);
      const retry = await adapter.refreshToken();

      expect(retry).toBe(AUTH_TOKENS);
      expect(httpClient.post).toHaveBeenCalledTimes(2);
    });
  });
});
