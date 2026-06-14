import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, httpClient } from '@knowtis/api-client';

import { initAnonymousSession } from '../anonymous-session';
import { ANON_STORAGE_KEY, AUTH_STORAGE_KEY } from '../constants';
import { SessionExpiredError } from '../init-auth';

vi.mock('@knowtis/api-client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, httpClient: { post: vi.fn() } };
});

function stubNavigatorLocks(
  request: (name: string, callback: () => Promise<unknown>) => Promise<unknown>
): () => void {
  Object.defineProperty(navigator, 'locks', {
    value: { request },
    configurable: true,
  });
  return () => {
    delete (navigator as { locks?: unknown }).locks;
  };
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

  it('never persists the access token to localStorage', async () => {
    vi.mocked(httpClient.post).mockResolvedValue({
      user: { id: 'new-anon', name: 'Anonymous', isAnonymous: true },
      accessToken: 'super-secret-jwt',
    });

    const { store } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage();

    await initAnonymousSession(tokenStorage, store);

    const stored = localStorage.getItem(ANON_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(stored).not.toContain('super-secret-jwt');
    expect(JSON.parse(stored as string)).toEqual({
      userId: 'new-anon',
      expiresAt: expect.any(Number),
    });
    expect(tokenStorage.setAccessToken).toHaveBeenCalledWith(
      'super-secret-jwt'
    );
  });

  it('restores a stored anonymous session via the refresh cookie', async () => {
    localStorage.setItem(
      ANON_STORAGE_KEY,
      JSON.stringify({
        userId: 'existing-anon',
        expiresAt: Date.now() + 60_000,
      })
    );
    vi.mocked(httpClient.post).mockResolvedValue({
      accessToken: 'refreshed-at',
    });

    const { store, state } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage();

    await initAnonymousSession(tokenStorage, store);

    expect(vi.mocked(httpClient.post)).toHaveBeenCalledWith(
      '/auth/refresh',
      {},
      { skipAuth: true }
    );
    expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('refreshed-at');
    expect(state.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'existing-anon', isAnonymous: true })
    );
    expect(localStorage.getItem(ANON_STORAGE_KEY)).not.toContain('accessToken');
  });

  it('migrates a legacy stored token by exchanging it for a cookie session and strips it from storage', async () => {
    localStorage.setItem(
      ANON_STORAGE_KEY,
      JSON.stringify({
        userId: 'legacy-anon',
        accessToken: 'legacy-jwt',
        expiresAt: Date.now() + 60_000,
      })
    );
    vi.mocked(httpClient.post).mockResolvedValue({
      user: { id: 'legacy-anon', name: 'Anonymous', isAnonymous: true },
      accessToken: 'fresh-at',
    });

    const { store } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage();

    await initAnonymousSession(tokenStorage, store);

    expect(vi.mocked(httpClient.post)).toHaveBeenCalledWith(
      '/auth/anonymous',
      { anonymousToken: 'legacy-jwt' },
      { skipAuth: true }
    );
    expect(tokenStorage.setAccessToken).toHaveBeenCalledWith('fresh-at');
    const stored = localStorage.getItem(ANON_STORAGE_KEY);
    expect(stored).not.toContain('legacy-jwt');
    expect(JSON.parse(stored as string)).toEqual({
      userId: 'legacy-anon',
      expiresAt: expect.any(Number),
    });
  });

  it('creates a new anonymous session when the refresh restore is rejected as unauthorized', async () => {
    localStorage.setItem(
      ANON_STORAGE_KEY,
      JSON.stringify({
        userId: 'existing-anon',
        expiresAt: Date.now() + 60_000,
      })
    );
    vi.mocked(httpClient.post).mockImplementation(async (url: string) => {
      if (url === '/auth/refresh') {
        throw new ApiClientError('Unauthorized', 401, 'UNAUTHORIZED');
      }
      return {
        user: { id: 'replacement-anon', name: 'Anonymous', isAnonymous: true },
        accessToken: 'new-at',
      };
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
      expect.objectContaining({ id: 'replacement-anon', isAnonymous: true })
    );
  });

  it('coalesces two concurrent restores into a single refresh request', async () => {
    localStorage.setItem(
      ANON_STORAGE_KEY,
      JSON.stringify({
        userId: 'existing-anon',
        expiresAt: Date.now() + 60_000,
      })
    );
    let resolvePost: (value: unknown) => void = () => undefined;
    vi.mocked(httpClient.post).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        })
    );

    const { store } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage();

    const first = initAnonymousSession(tokenStorage, store);
    const second = initAnonymousSession(tokenStorage, store);
    resolvePost({ accessToken: 'refreshed-at' });
    await Promise.all([first, second]);

    expect(vi.mocked(httpClient.post)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(httpClient.post)).toHaveBeenCalledWith(
      '/auth/refresh',
      {},
      { skipAuth: true }
    );
  });

  it('coalesces concurrent boot restores behind the knowtis-auth-refresh web lock', async () => {
    const events: string[] = [];
    let queue: Promise<unknown> = Promise.resolve();
    const request = vi.fn(
      (_name: string, callback: () => Promise<unknown>): Promise<unknown> => {
        const run = queue.then(() => callback());
        queue = run.then(
          () => undefined,
          () => undefined
        );
        return run;
      }
    );
    const restoreLocks = stubNavigatorLocks(request);

    try {
      localStorage.setItem(
        ANON_STORAGE_KEY,
        JSON.stringify({
          userId: 'existing-anon',
          expiresAt: Date.now() + 60_000,
        })
      );
      vi.mocked(httpClient.post).mockImplementation(async () => {
        events.push('start');
        await new Promise((resolve) => setTimeout(resolve, 0));
        events.push('end');
        return { accessToken: 'refreshed-at' };
      });

      const { store } = createMockAuthStore({
        isAuthenticated: false,
        user: null,
      });
      const tokenStorage = createMockTokenStorage();

      await Promise.all([
        initAnonymousSession(tokenStorage, store),
        initAnonymousSession(tokenStorage, store),
      ]);

      expect(request).toHaveBeenCalledWith(
        'knowtis-auth-refresh',
        expect.any(Function)
      );
      expect(vi.mocked(httpClient.post)).toHaveBeenCalledTimes(1);
      expect(events).toEqual(['start', 'end']);
    } finally {
      restoreLocks();
    }
  });

  it('falls back to restoring without a lock when the Web Locks API is unavailable', async () => {
    expect((navigator as { locks?: unknown }).locks).toBeUndefined();
    localStorage.setItem(
      ANON_STORAGE_KEY,
      JSON.stringify({
        userId: 'existing-anon',
        expiresAt: Date.now() + 60_000,
      })
    );
    vi.mocked(httpClient.post).mockResolvedValue({
      accessToken: 'refreshed-at',
    });

    const { store, state } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage();

    await initAnonymousSession(tokenStorage, store);

    expect(state.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'existing-anon', isAnonymous: true })
    );
  });

  it('keeps the marker and stays unauthenticated when the refresh fails at network level', async () => {
    localStorage.setItem(
      ANON_STORAGE_KEY,
      JSON.stringify({
        userId: 'existing-anon',
        expiresAt: Date.now() + 60_000,
      })
    );
    vi.mocked(httpClient.post).mockRejectedValue(
      new ApiClientError('Failed to fetch', 0, 'NETWORK_ERROR')
    );

    const { store, state } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage();

    await initAnonymousSession(tokenStorage, store);

    expect(localStorage.getItem(ANON_STORAGE_KEY)).not.toBeNull();
    expect(vi.mocked(httpClient.post)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(httpClient.post)).not.toHaveBeenCalledWith(
      '/auth/anonymous',
      expect.anything(),
      expect.anything()
    );
    expect(state.setUser).not.toHaveBeenCalled();
    expect(state.setLoading).toHaveBeenCalledWith(false);
  });

  it('keeps the legacy token marker when the migration fails at network level', async () => {
    const legacyMarker = JSON.stringify({
      userId: 'legacy-anon',
      accessToken: 'legacy-jwt',
      expiresAt: Date.now() + 60_000,
    });
    localStorage.setItem(ANON_STORAGE_KEY, legacyMarker);
    vi.mocked(httpClient.post).mockRejectedValue(
      new ApiClientError('Failed to fetch', 0, 'NETWORK_ERROR')
    );

    const { store, state } = createMockAuthStore({
      isAuthenticated: false,
      user: null,
    });
    const tokenStorage = createMockTokenStorage();

    await initAnonymousSession(tokenStorage, store);

    expect(localStorage.getItem(ANON_STORAGE_KEY)).toBe(legacyMarker);
    expect(vi.mocked(httpClient.post)).toHaveBeenCalledTimes(1);
    expect(state.setLoading).toHaveBeenCalledWith(false);
  });

  it('removes an expired marker and creates a fresh session', async () => {
    localStorage.setItem(
      ANON_STORAGE_KEY,
      JSON.stringify({ userId: 'old-anon', expiresAt: Date.now() - 1_000 })
    );
    vi.mocked(httpClient.post).mockResolvedValue({
      user: { id: 'new-anon', name: 'Anonymous', isAnonymous: true },
      accessToken: 'new-at',
    });

    const { store } = createMockAuthStore({
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
    expect(vi.mocked(httpClient.post)).not.toHaveBeenCalledWith(
      '/auth/refresh',
      expect.anything(),
      expect.anything()
    );
  });
});
