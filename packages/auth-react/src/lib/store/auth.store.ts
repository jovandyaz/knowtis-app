import type { AuthResponse } from '@jovandyaz/auth/client';
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
          tokenStorage.setTokens(
            response.tokens.accessToken,
            response.tokens.refreshToken
          );

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
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }),
        onRehydrateStorage: () => (state) => {
          if (state?.isAuthenticated) {
            const { hasRefreshToken } = tokenStorage.initialize();

            if (!hasRefreshToken) {
              state.logout();
              return;
            }
          }
          state?.setLoading(false);
        },
      }
    )
  );
}

export type AuthStoreInstance = ReturnType<typeof createAuthStore>;
