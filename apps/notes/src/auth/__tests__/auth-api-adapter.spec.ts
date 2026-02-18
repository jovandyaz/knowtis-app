import type { TokenStorage } from '@jovandyaz/auth-react';
import type { AuthResponse, AuthTokens } from '@jovandyaz/auth/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAuthApiAdapter, type HttpClient } from '../auth-api-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockHttpClient(): HttpClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  setRefreshTokenCallback: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    post: vi.fn(),
    setRefreshTokenCallback: vi.fn(),
  };
}

function createMockTokenStorage(): TokenStorage {
  return {
    setAccessToken: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    setRefreshToken: vi.fn(),
    getRefreshToken: vi.fn().mockReturnValue('stored-refresh-token'),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
    hasTokens: vi.fn().mockReturnValue(false),
    subscribe: vi.fn().mockReturnValue(() => {}),
    initialize: vi.fn().mockReturnValue({ hasRefreshToken: false }),
  };
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

  beforeEach(() => {
    httpClient = createMockHttpClient();
    tokenStorage = createMockTokenStorage();
  });

  // ---- Side effect: refresh callback registration ----

  it('registers a refresh token callback on creation', () => {
    createAuthApiAdapter({ httpClient, tokenStorage });
    expect(httpClient.setRefreshTokenCallback).toHaveBeenCalledOnce();
    expect(httpClient.setRefreshTokenCallback).toHaveBeenCalledWith(
      expect.any(Function)
    );
  });

  // ---- login ----

  describe('login', () => {
    it('calls POST /auth/login with skipAuth and stores tokens', async () => {
      httpClient.post.mockResolvedValue(AUTH_RESPONSE);
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

      const result = await adapter.login({
        email: 'a@b.com',
        password: 'pass',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/login',
        { email: 'a@b.com', password: 'pass' },
        { skipAuth: true }
      );
      expect(tokenStorage.setTokens).toHaveBeenCalledWith('at', 'rt');
      expect(result).toBe(AUTH_RESPONSE);
    });
  });

  // ---- register ----

  describe('register', () => {
    it('calls POST /auth/register with skipAuth and stores tokens', async () => {
      httpClient.post.mockResolvedValue(AUTH_RESPONSE);
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

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
      expect(tokenStorage.setTokens).toHaveBeenCalledWith('at', 'rt');
      expect(result).toBe(AUTH_RESPONSE);
    });
  });

  // ---- logout ----

  describe('logout', () => {
    it('sends refresh token to /auth/logout then clears tokens', async () => {
      httpClient.post.mockResolvedValue(undefined);
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

      await adapter.logout();

      expect(httpClient.post).toHaveBeenCalledWith('/auth/logout', {
        refreshToken: 'stored-refresh-token',
      });
      expect(tokenStorage.clearTokens).toHaveBeenCalledOnce();
    });

    it('clears tokens even if the server call fails', async () => {
      httpClient.post.mockRejectedValue(new Error('network'));
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

      await adapter.logout();

      expect(tokenStorage.clearTokens).toHaveBeenCalledOnce();
    });

    it('skips server call when no refresh token exists', async () => {
      (
        tokenStorage.getRefreshToken as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

      await adapter.logout();

      expect(httpClient.post).not.toHaveBeenCalled();
      expect(tokenStorage.clearTokens).toHaveBeenCalledOnce();
    });
  });

  // ---- refreshToken ----

  describe('refreshToken', () => {
    it('calls POST /auth/refresh with skipAuth and stores tokens', async () => {
      httpClient.post.mockResolvedValue(AUTH_TOKENS);
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

      const result = await adapter.refreshToken();

      expect(httpClient.post).toHaveBeenCalledWith(
        '/auth/refresh',
        { refreshToken: 'stored-refresh-token' },
        { skipAuth: true }
      );
      expect(tokenStorage.setTokens).toHaveBeenCalledWith('new-at', 'new-rt');
      expect(result).toBe(AUTH_TOKENS);
    });

    it('throws when no refresh token is available', async () => {
      (
        tokenStorage.getRefreshToken as ReturnType<typeof vi.fn>
      ).mockReturnValue(null);
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

      await expect(adapter.refreshToken()).rejects.toThrow(
        'No refresh token available'
      );
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
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

      const result = await adapter.getProfile();

      expect(httpClient.get).toHaveBeenCalledWith('/auth/me');
      expect(result).toBe(profile);
    });
  });

  // ---- forgotPassword ----

  describe('forgotPassword', () => {
    it('calls POST /auth/forgot-password with skipAuth', async () => {
      httpClient.post.mockResolvedValue(undefined);
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

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
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

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
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

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
      const adapter = createAuthApiAdapter({ httpClient, tokenStorage });

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
      createAuthApiAdapter({ httpClient, tokenStorage });

      const callback = httpClient.setRefreshTokenCallback.mock.calls[0][0];
      const result = await callback();

      expect(result).toBe('new-at');
    });

    it('calls logout and returns null on refresh failure', async () => {
      httpClient.post.mockRejectedValue(new Error('expired'));
      createAuthApiAdapter({ httpClient, tokenStorage });

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
