import type { AuthResponse, AuthTokens } from '@jovandyaz/auth';
import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IHttpClient } from '@knowtis/api-client';

import { createAuthApiAdapter } from '../auth-api-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createAuthApiAdapter', () => {
  let httpClient: ReturnType<typeof createMockHttpClient>;
  let tokenStorage: ReturnType<typeof createMockTokenStorage>;
  let authStore: ReturnType<typeof createMockAuthStore>;

  beforeEach(() => {
    httpClient = createMockHttpClient();
    tokenStorage = createMockTokenStorage();
    authStore = createMockAuthStore();
  });

  // ---- Side effect: refresh callback registration ----

  it('registers a refresh token callback on creation', () => {
    createAuthApiAdapter({ httpClient, tokenStorage, authStore });
    expect(httpClient.setRefreshTokenCallback).toHaveBeenCalledOnce();
    expect(httpClient.setRefreshTokenCallback).toHaveBeenCalledWith(
      expect.any(Function)
    );
  });

  // ---- login ----

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
  });

  // ---- register ----

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
  });

  // ---- logout ----

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

  // ---- refreshToken ----

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

  // ---- getProfile ----

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

  // ---- forgotPassword ----

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

  // ---- resetPassword ----

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

  // ---- verifyEmail ----

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

  // ---- resendVerification ----

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

  // ---- Refresh callback behavior ----

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

    it('calls logout and returns null on refresh failure', async () => {
      httpClient.post.mockRejectedValue(new Error('expired'));
      authStore.getState().user = { isAnonymous: false } as ReturnType<
        AuthStoreInstance['getState']
      >['user'];
      createAuthApiAdapter({ httpClient, tokenStorage, authStore });

      const callback = httpClient.setRefreshTokenCallback.mock.calls[0][0];
      const result = await callback();

      expect(result).toBeNull();
      // logout is fire-and-forget (void), wait a tick for it to complete
      await vi.waitFor(() => {
        expect(tokenStorage.clearTokens).toHaveBeenCalled();
      });
    });
  });
});
