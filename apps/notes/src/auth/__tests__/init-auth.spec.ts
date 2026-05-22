import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runInitAuth, SessionExpiredError } from '../init-auth';

function createMockTokenStorage(hasTokens = false): TokenStorage {
  return {
    setAccessToken: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    getExpiresAt: vi.fn().mockReturnValue(null),
    clearTokens: vi.fn(),
    hasTokens: vi.fn().mockReturnValue(hasTokens),
    subscribe: vi.fn().mockReturnValue(() => {}),
  };
}

interface MockAuthState {
  user: { isAnonymous?: boolean } | null;
  isAuthenticated: boolean;
  logout: ReturnType<typeof vi.fn>;
}

function createMockAuthStore(initial: Partial<MockAuthState> = {}): {
  store: AuthStoreInstance;
  state: MockAuthState;
} {
  const state: MockAuthState = {
    user: initial.user ?? null,
    isAuthenticated: initial.isAuthenticated ?? false,
    logout: initial.logout ?? vi.fn(),
  };
  const store = {
    getState: () => state,
    setState: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  } as unknown as AuthStoreInstance;
  return { store, state };
}

describe('runInitAuth', () => {
  let refreshToken: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
  let initAnonymousSession: ReturnType<
    typeof vi.fn<
      (
        tokenStorage: TokenStorage,
        authStore: AuthStoreInstance
      ) => Promise<void>
    >
  >;

  beforeEach(() => {
    refreshToken = vi.fn<() => Promise<unknown>>();
    initAnonymousSession = vi
      .fn<
        (
          tokenStorage: TokenStorage,
          authStore: AuthStoreInstance
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('throws SessionExpiredError when silent refresh fails for a previously authenticated non-anonymous user', async () => {
    const { store, state } = createMockAuthStore({
      isAuthenticated: true,
      user: { isAnonymous: false },
    });
    const tokenStorage = createMockTokenStorage(false);
    refreshToken.mockRejectedValue(new Error('refresh-token cookie expired'));

    await expect(
      runInitAuth({
        authStore: store,
        authApi: { refreshToken },
        tokenStorage,
        initAnonymousSession,
      })
    ).rejects.toBeInstanceOf(SessionExpiredError);

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(state.logout).toHaveBeenCalledTimes(1);
    expect(initAnonymousSession).not.toHaveBeenCalled();
  });

  it('does not throw and proceeds to initAnonymousSession when silent refresh succeeds', async () => {
    const { store, state } = createMockAuthStore({
      isAuthenticated: true,
      user: { isAnonymous: false },
    });
    const tokenStorage = createMockTokenStorage(false);
    refreshToken.mockResolvedValue({ accessToken: 'new-token' });

    await runInitAuth({
      authStore: store,
      authApi: { refreshToken },
      tokenStorage,
      initAnonymousSession,
    });

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(state.logout).not.toHaveBeenCalled();
    expect(initAnonymousSession).toHaveBeenCalledTimes(1);
    expect(initAnonymousSession).toHaveBeenCalledWith(tokenStorage, store);
  });

  it('skips silent refresh when user is anonymous and proceeds to initAnonymousSession', async () => {
    const { store, state } = createMockAuthStore({
      isAuthenticated: true,
      user: { isAnonymous: true },
    });
    const tokenStorage = createMockTokenStorage(false);

    await runInitAuth({
      authStore: store,
      authApi: { refreshToken },
      tokenStorage,
      initAnonymousSession,
    });

    expect(refreshToken).not.toHaveBeenCalled();
    expect(state.logout).not.toHaveBeenCalled();
    expect(initAnonymousSession).toHaveBeenCalledTimes(1);
  });

  it('skips silent refresh when not authenticated and proceeds to initAnonymousSession', async () => {
    const { store } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage(false);

    await runInitAuth({
      authStore: store,
      authApi: { refreshToken },
      tokenStorage,
      initAnonymousSession,
    });

    expect(refreshToken).not.toHaveBeenCalled();
    expect(initAnonymousSession).toHaveBeenCalledTimes(1);
  });

  it('skips silent refresh when tokens are already available in storage', async () => {
    const { store } = createMockAuthStore({
      isAuthenticated: true,
      user: { isAnonymous: false },
    });
    const tokenStorage = createMockTokenStorage(true);

    await runInitAuth({
      authStore: store,
      authApi: { refreshToken },
      tokenStorage,
      initAnonymousSession,
    });

    expect(refreshToken).not.toHaveBeenCalled();
    expect(initAnonymousSession).toHaveBeenCalledTimes(1);
  });

  it('exposes a SessionExpiredError class that callers can narrow with instanceof', () => {
    const error = new SessionExpiredError();
    expect(error).toBeInstanceOf(SessionExpiredError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SessionExpiredError');
  });
});
