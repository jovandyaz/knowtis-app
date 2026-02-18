import type { AuthResponse } from '@jovandyaz/auth/client';

import { createTokenStorage } from '../storage/token-storage';
import { createAuthStore } from '../store/auth.store';

describe('createAuthStore', () => {
  function setup() {
    const tokenStorage = createTokenStorage({
      refreshTokenKey: 'test_store_refresh',
    });
    const store = createAuthStore({
      tokenStorage,
      storageKey: `test-auth-${Date.now()}`,
    });
    return { store, tokenStorage };
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it('should have correct initial state', () => {
    const { store } = setup();
    const state = store.getState();

    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    // isLoading starts as true but onRehydrateStorage sets it to false
    // synchronously when there's no persisted state
    expect(state.isLoading).toBe(false);
  });

  it('should set user', () => {
    const { store } = setup();

    store.getState().setUser({
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      avatarUrl: null,
    });

    const state = store.getState();
    expect(state.user?.email).toBe('test@example.com');
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('should clear user when setUser(null)', () => {
    const { store } = setup();

    store.getState().setUser({
      id: '1',
      email: 'test@example.com',
      name: 'Test',
      avatarUrl: null,
    });
    store.getState().setUser(null);

    const state = store.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should handle auth success', () => {
    const { store, tokenStorage } = setup();

    const response: AuthResponse = {
      user: {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      },
      tokens: {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      },
    };

    store.getState().handleAuthSuccess(response);

    const state = store.getState();
    expect(state.user?.id).toBe('1');
    expect(state.user?.email).toBe('test@example.com');
    expect(state.user?.name).toBe('Test User');
    expect(state.user?.avatarUrl).toBe('https://example.com/avatar.png');
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);

    expect(tokenStorage.getAccessToken()).toBe('access-token-123');
    expect(tokenStorage.getRefreshToken()).toBe('refresh-token-456');
  });

  it('should logout and clear tokens', () => {
    const { store, tokenStorage } = setup();

    const response: AuthResponse = {
      user: {
        id: '1',
        email: 'test@example.com',
        name: 'Test',
        avatarUrl: null,
      },
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    };

    store.getState().handleAuthSuccess(response);
    store.getState().logout();

    const state = store.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);

    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('should set loading state', () => {
    const { store } = setup();

    store.getState().setLoading(false);
    expect(store.getState().isLoading).toBe(false);

    store.getState().setLoading(true);
    expect(store.getState().isLoading).toBe(true);
  });
});
