import { createElement } from 'react';

import { act, renderHook } from '@testing-library/react';

import { useSessionManager } from '../hooks/use-session-manager';
import { AuthProvider } from '../provider/auth-provider';
import { createTokenStorage } from '../storage/token-storage';
import { createAuthStore } from '../store/auth.store';
import type { AuthApiAdapter, AuthUserProfile } from '../types';

function createJwt(expSeconds: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({ sub: '1', exp: expSeconds }));
  return `${header}.${body}.fake-signature`;
}

function createMockApi(
  overrides: Partial<AuthApiAdapter> = {}
): AuthApiAdapter {
  return {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshToken: vi.fn().mockResolvedValue({ accessToken: 'new-token' }),
    getProfile: vi.fn().mockResolvedValue({} as AuthUserProfile),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
    verifyEmailCode: vi.fn(),
    resendVerification: vi.fn(),
    ...overrides,
  };
}

function setup(apiOverrides: Partial<AuthApiAdapter> = {}) {
  const tokenStorage = createTokenStorage();
  const store = createAuthStore({
    tokenStorage,
    storageKey: `test-session-${Date.now()}`,
  });
  const api = createMockApi(apiOverrides);

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(AuthProvider, { api, tokenStorage, store, children });

  return { tokenStorage, store, api, wrapper };
}

describe('useSessionManager', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('bootstrap validation', () => {
    it('should set isLoading=false when not authenticated', () => {
      const { store, wrapper } = setup();

      renderHook(() => useSessionManager(), { wrapper });

      expect(store.getState().isLoading).toBe(false);
    });

    it('should set isLoading=false when already has token', () => {
      const { store, tokenStorage, wrapper } = setup();

      tokenStorage.setAccessToken('existing-token');
      store.getState().setUser({
        id: '1',
        email: 'test@test.com',
        name: 'Test',
        avatarUrl: null,
      });

      renderHook(() => useSessionManager(), { wrapper });

      expect(store.getState().isLoading).toBe(false);
    });

    it('should attempt refresh when authenticated but no in-memory token', async () => {
      const refreshToken = vi.fn().mockResolvedValue({
        accessToken: createJwt(Math.floor(Date.now() / 1000) + 900),
      });
      const { store, wrapper } = setup({ refreshToken });

      store.setState({
        isAuthenticated: true,
        isLoading: true,
        user: { id: '1', email: 'a@b.com', name: 'Test', avatarUrl: null },
      });

      await act(async () => {
        renderHook(() => useSessionManager(), { wrapper });
      });

      expect(refreshToken).toHaveBeenCalledTimes(1);
      expect(store.getState().isLoading).toBe(false);
    });

    it('should logout when refresh fails on bootstrap', async () => {
      const refreshToken = vi.fn().mockRejectedValue(new Error('expired'));
      const { store, wrapper } = setup({ refreshToken });

      store.setState({
        isAuthenticated: true,
        isLoading: true,
        user: { id: '1', email: 'a@b.com', name: 'Test', avatarUrl: null },
      });

      await act(async () => {
        renderHook(() => useSessionManager(), { wrapper });
      });

      expect(store.getState().isAuthenticated).toBe(false);
      expect(store.getState().user).toBeNull();
    });

    it('keeps the session when the failure is classified as non-terminal', async () => {
      const failure = new Error('service unavailable');
      const refreshToken = vi.fn().mockRejectedValue(failure);
      const { store, wrapper } = setup({ refreshToken });

      store.setState({
        isAuthenticated: true,
        isLoading: true,
        user: { id: '1', email: 'a@b.com', name: 'Test', avatarUrl: null },
      });

      const isTerminalRefreshFailure = vi.fn().mockReturnValue(false);
      await act(async () => {
        renderHook(() => useSessionManager({ isTerminalRefreshFailure }), {
          wrapper,
        });
      });

      expect(isTerminalRefreshFailure).toHaveBeenCalledWith(failure);
      expect(store.getState().isAuthenticated).toBe(true);
      expect(store.getState().user).not.toBeNull();
      expect(store.getState().isLoading).toBe(false);
    });
  });

  describe('proactive refresh timer', () => {
    it('should schedule refresh before token expiry', async () => {
      const now = Date.now();
      const expiresInMs = 900_000; // 15 minutes
      const token = createJwt(Math.floor((now + expiresInMs) / 1000));

      const refreshToken = vi.fn().mockResolvedValue({ accessToken: token });
      const { tokenStorage, store, wrapper } = setup({ refreshToken });

      tokenStorage.setAccessToken(token);
      store.getState().setUser({
        id: '1',
        email: 'a@b.com',
        name: 'Test',
        avatarUrl: null,
      });

      renderHook(() => useSessionManager({ refreshMarginMs: 60_000 }), {
        wrapper,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(expiresInMs - 60_000 + 100);
      });

      expect(refreshToken).toHaveBeenCalled();
    });
  });

  describe('visibility change handler', () => {
    it('should refresh when tab becomes visible and token is missing', async () => {
      const refreshToken = vi.fn().mockResolvedValue({
        accessToken: createJwt(Math.floor(Date.now() / 1000) + 900),
      });
      const { store, tokenStorage, wrapper } = setup({ refreshToken });

      tokenStorage.setAccessToken(
        createJwt(Math.floor(Date.now() / 1000) + 900)
      );
      store.getState().setUser({
        id: '1',
        email: 'a@b.com',
        name: 'Test',
        avatarUrl: null,
      });

      renderHook(() => useSessionManager(), { wrapper });

      tokenStorage.clearTokens();
      store.setState({ isAuthenticated: true });
      refreshToken.mockClear();

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(refreshToken).toHaveBeenCalledTimes(1);
    });

    it('should not refresh when not authenticated', () => {
      const refreshToken = vi.fn();
      const { wrapper } = setup({ refreshToken });

      renderHook(() => useSessionManager(), { wrapper });
      refreshToken.mockClear();

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(refreshToken).not.toHaveBeenCalled();
    });
  });

  describe('anonymous sessions', () => {
    const anonymousUser = {
      id: 'anon-1',
      email: '',
      name: 'Anonymous',
      avatarUrl: null,
      isAnonymous: true,
    };

    it('does not refresh on bootstrap and leaves the session in place', async () => {
      const refreshToken = vi.fn();
      const { store, wrapper } = setup({ refreshToken });

      store.setState({
        isAuthenticated: true,
        isLoading: true,
        user: anonymousUser,
      });

      await act(async () => {
        renderHook(() => useSessionManager(), { wrapper });
      });

      expect(refreshToken).not.toHaveBeenCalled();
      expect(store.getState().isLoading).toBe(false);
      expect(store.getState().isAuthenticated).toBe(true);
    });

    it('lets the access token expire instead of refreshing before exp or on visibility', async () => {
      const expiresInMs = 900_000;
      const token = createJwt(Math.floor((Date.now() + expiresInMs) / 1000));
      const refreshToken = vi.fn();
      const { tokenStorage, store, wrapper } = setup({ refreshToken });

      tokenStorage.setAccessToken(token);
      store.getState().setUser(anonymousUser);

      renderHook(() => useSessionManager({ refreshMarginMs: 60_000 }), {
        wrapper,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(expiresInMs + 100);
      });

      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(refreshToken).not.toHaveBeenCalled();
      expect(store.getState().isAuthenticated).toBe(true);
    });
  });
});
