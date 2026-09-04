import type { AuthResponse } from '@jovandyaz/auth';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { TokenStorage } from '../storage/token-storage';
import type { AuthUserProfile } from '../types';
import type { AuthStore } from './auth.store.types';

export interface CreateAuthStoreOptions {
  storageKey?: string;
  tokenStorage: TokenStorage;
}

const DEFAULT_STORAGE_KEY = 'auth-store';

// Only what the shell reads before the profile refetch lands; the rest of the
// /auth/me payload stays in memory.
function toPersistedUser(user: AuthUserProfile | null) {
  if (user === null) {
    return null;
  }
  const { id, email, name, avatarUrl, isAnonymous, emailVerifiedAt, locale } =
    user;
  return { id, email, name, avatarUrl, isAnonymous, emailVerifiedAt, locale };
}

/**
 * Creates a Zustand auth store with persist middleware.
 */
export function createAuthStore(options: CreateAuthStoreOptions) {
  const { tokenStorage, storageKey = DEFAULT_STORAGE_KEY } = options;

  return create<AuthStore>()(
    persist(
      (set) => ({
        user: null,
        isLoading: true,
        isAuthenticated: false,

        setUser: (user: AuthUserProfile | null) =>
          set({
            user,
            isAuthenticated: user !== null,
            isLoading: false,
          }),

        handleAuthSuccess: (response: AuthResponse) => {
          tokenStorage.setAccessToken(response.tokens.accessToken);

          set({
            user: {
              id: response.user.id,
              email: response.user.email,
              name: response.user.name,
              avatarUrl: response.user.avatarUrl,
            },
            isAuthenticated: true,
            isLoading: false,
          });
        },

        logout: () => {
          tokenStorage.clearTokens();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        },

        setLoading: (isLoading: boolean) => set({ isLoading }),
      }),
      {
        name: storageKey,
        partialize: (state) => ({
          user: toPersistedUser(state.user),
          isAuthenticated: state.isAuthenticated,
        }),
        onRehydrateStorage: () => (state) => {
          if (state?.isAuthenticated) {
            return;
          }
          state?.setLoading(false);
        },
      }
    )
  );
}

export type AuthStoreInstance = ReturnType<typeof createAuthStore>;
