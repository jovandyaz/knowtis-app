import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runEnsureGuestSession } from '../guest-session';
import { SessionExpiredError } from '../init-auth';

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

function createMockAuthStore(isAuthenticated: boolean): {
  store: AuthStoreInstance;
  state: { isAuthenticated: boolean };
} {
  const state = { isAuthenticated };
  const store = {
    getState: () => state,
    setState: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  } as unknown as AuthStoreInstance;
  return { store, state };
}

describe('runEnsureGuestSession', () => {
  let tokenStorage: TokenStorage;

  beforeEach(() => {
    tokenStorage = createMockTokenStorage();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('keeps an existing session instead of minting a guest one', async () => {
    const { store } = createMockAuthStore(true);
    const initAnonymousSession = vi.fn();

    await expect(
      runEnsureGuestSession({
        authStore: store,
        tokenStorage,
        initAnonymousSession,
      })
    ).resolves.toBe(true);
    expect(initAnonymousSession).not.toHaveBeenCalled();
  });

  it('mints a guest session for an account-less visitor', async () => {
    const { store, state } = createMockAuthStore(false);
    const initAnonymousSession = vi.fn().mockImplementation(() => {
      state.isAuthenticated = true;
      return Promise.resolve();
    });

    await expect(
      runEnsureGuestSession({
        authStore: store,
        tokenStorage,
        initAnonymousSession,
      })
    ).resolves.toBe(true);
    expect(initAnonymousSession).toHaveBeenCalledWith(tokenStorage, store);
  });

  it('stays read-only when a lapsed registered session refuses to downgrade', async () => {
    const { store } = createMockAuthStore(false);

    await expect(
      runEnsureGuestSession({
        authStore: store,
        tokenStorage,
        initAnonymousSession: vi
          .fn()
          .mockRejectedValue(new SessionExpiredError()),
      })
    ).resolves.toBe(false);
  });

  it('stays read-only when session creation resolves without authenticating', async () => {
    const { store } = createMockAuthStore(false);

    await expect(
      runEnsureGuestSession({
        authStore: store,
        tokenStorage,
        initAnonymousSession: vi.fn().mockResolvedValue(undefined),
      })
    ).resolves.toBe(false);
  });
});
