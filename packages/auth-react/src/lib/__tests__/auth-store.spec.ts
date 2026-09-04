import { USER_ROLE, type AuthResponse } from '@jovandyaz/auth';

import { createTokenStorage } from '../storage/token-storage';
import { createAuthStore } from '../store/auth.store';
import type { AuthUserProfile } from '../types';

describe('createAuthStore', () => {
  function setup() {
    const tokenStorage = createTokenStorage();
    const storageKey = `test-auth-${Date.now()}`;
    const store = createAuthStore({ tokenStorage, storageKey });
    return { store, tokenStorage, storageKey };
  }

  function readPersistedUser(storageKey: string): unknown {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) {
      throw new Error(`nothing persisted under ${storageKey}`);
    }
    return JSON.parse(raw).state.user;
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
  });

  describe('persistence', () => {
    const profile: AuthUserProfile = {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
      isAnonymous: false,
      emailVerifiedAt: '2026-01-01T00:00:00.000Z',
      locale: 'es',
      role: USER_ROLE.ADMIN,
    };
    const serverPayload = {
      ...profile,
      familyId: 'family-1',
    } as AuthUserProfile;

    it('persists only the fields the shell reads on cold start', () => {
      const { store, storageKey } = setup();

      store.getState().setUser(serverPayload);

      expect(readPersistedUser(storageKey)).toStrictEqual({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        isAnonymous: false,
        emailVerifiedAt: '2026-01-01T00:00:00.000Z',
        locale: 'es',
      });
    });

    it('does not persist role or fields outside the profile contract', () => {
      const { store, storageKey } = setup();

      store.getState().setUser(serverPayload);

      const persisted = readPersistedUser(storageKey);
      expect(persisted).not.toHaveProperty('role');
      expect(persisted).not.toHaveProperty('familyId');
    });

    it('keeps the full profile in memory', () => {
      const { store } = setup();

      store.getState().setUser(serverPayload);

      expect(store.getState().user).toStrictEqual(serverPayload);
    });

    it('persists a null user after logout', () => {
      const { store, storageKey } = setup();

      store.getState().setUser(serverPayload);
      store.getState().logout();

      expect(readPersistedUser(storageKey)).toBeNull();
    });

    it('rehydrates the narrowed user as authenticated', () => {
      const { store, storageKey } = setup();
      store.getState().setUser(serverPayload);

      const rehydrated = createAuthStore({
        tokenStorage: createTokenStorage(),
        storageKey,
      });

      const state = rehydrated.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(true);
      expect(state.user).toStrictEqual({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
        isAnonymous: false,
        emailVerifiedAt: '2026-01-01T00:00:00.000Z',
        locale: 'es',
      });
    });
  });

  it('should set loading state', () => {
    const { store } = setup();

    store.getState().setLoading(false);
    expect(store.getState().isLoading).toBe(false);

    store.getState().setLoading(true);
    expect(store.getState().isLoading).toBe(true);
  });
});
