import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { httpClient } from '@knowtis/api-client';

import { initAnonymousSession } from '../anonymous-session';
import { ANON_STORAGE_KEY, AUTH_STORAGE_KEY } from '../constants';
import { SessionExpiredError } from '../init-auth';

vi.mock('@knowtis/api-client', () => ({
  httpClient: { post: vi.fn() },
}));

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

interface MockState {
  isAuthenticated: boolean;
  user: { isAnonymous?: boolean } | null;
  setUser: ReturnType<typeof vi.fn>;
  setLoading: ReturnType<typeof vi.fn>;
}

function createMockAuthStore(initial: Partial<MockState> = {}): {
  store: AuthStoreInstance;
  state: MockState;
} {
  const state: MockState = {
    isAuthenticated: initial.isAuthenticated ?? false,
    user: initial.user ?? null,
    setUser: initial.setUser ?? vi.fn(),
    setLoading: initial.setLoading ?? vi.fn(),
  };
  const store = {
    getState: () => state,
    setState: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
  } as unknown as AuthStoreInstance;
  return { store, state };
}

describe('initAnonymousSession — demotion guard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('throws SessionExpiredError when the persisted auth store recorded a registered user but the in-memory store has been cleared', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        state: {
          user: { id: 'real-user', isAnonymous: false },
          isAuthenticated: false,
        },
        version: 0,
      })
    );

    const { store } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage();

    await expect(
      initAnonymousSession(tokenStorage, store)
    ).rejects.toBeInstanceOf(SessionExpiredError);

    expect(vi.mocked(httpClient.post)).not.toHaveBeenCalled();
  });

  it('returns early without creating a new session when the store re-reads as authenticated (race with concurrent refresh)', async () => {
    const { store } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });

    let readCount = 0;
    const originalGetState = store.getState;
    store.getState = () => {
      readCount += 1;
      if (readCount >= 2) {
        return {
          ...originalGetState(),
          isAuthenticated: true,
          user: { isAnonymous: false },
        } as ReturnType<AuthStoreInstance['getState']>;
      }
      return originalGetState();
    };

    const tokenStorage = createMockTokenStorage();
    await initAnonymousSession(tokenStorage, store);

    expect(vi.mocked(httpClient.post)).not.toHaveBeenCalled();
  });

  it('creates a new anonymous session when no previous registered user is recorded and no stored anonymous session exists', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({
      user: { id: 'new-anon', name: 'Anonymous', isAnonymous: true },
      accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.signature',
    });

    const { store, state } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage();

    await initAnonymousSession(tokenStorage, store);

    expect(vi.mocked(httpClient.post)).toHaveBeenCalledWith(
      '/auth/anonymous',
      {},
      { skipAuth: true }
    );
    expect(state.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-anon', isAnonymous: true })
    );
    expect(localStorage.getItem(ANON_STORAGE_KEY)).not.toBeNull();
  });

  it('restores a valid stored anonymous session without making a network request', async () => {
    const stored = {
      userId: 'existing-anon',
      accessToken: 'existing-token',
      expiresAt: Date.now() + 60_000,
    };
    localStorage.setItem(ANON_STORAGE_KEY, JSON.stringify(stored));

    const { store } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage();

    await initAnonymousSession(tokenStorage, store);

    expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('existing-token');
    expect(vi.mocked(httpClient.post)).not.toHaveBeenCalled();
  });
});
