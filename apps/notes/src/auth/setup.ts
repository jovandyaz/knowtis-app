import {
  createAuthStore,
  createCrossTabSync,
  createTokenStorage,
} from '@jovandyaz/auth-react';

import { aiClient, httpClient } from '@knowtis/api-client';

import { setTokenStorage as setCollaborationTokenStorage } from '../collaboration/token-provider';
import { initAnonymousSession } from './anonymous-session';
import { createAuthApiAdapter } from './auth-api-adapter';
import { performSessionLogout } from './perform-session-logout';

const AUTH_STORAGE_KEY = 'knowtis-auth';

export const tokenStorage = createTokenStorage();

export const authStore = createAuthStore({
  tokenStorage,
  storageKey: AUTH_STORAGE_KEY,
});

setCollaborationTokenStorage(tokenStorage);
aiClient.setTokenProvider(tokenStorage);

export const authApi = createAuthApiAdapter({
  httpClient,
  tokenStorage,
  authStore,
});

createCrossTabSync({
  storageKey: AUTH_STORAGE_KEY,
  onLogoutDetected: () => {
    performSessionLogout({
      authStore,
      tokenStorage,
      redirect: () => {
        window.location.href = '/login';
      },
    });
  },
});

export { performSessionLogout } from './perform-session-logout';

/** Restores authenticated session or creates an anonymous one. */
export async function initAuth(): Promise<void> {
  const { isAuthenticated, user } = authStore.getState();
  if (isAuthenticated && !user?.isAnonymous && !tokenStorage.hasTokens()) {
    try {
      await authApi.refreshToken();
    } catch (error) {
      console.error('[initAuth] Silent refresh failed, logging out', error);
      authStore.getState().logout();
    }
  }

  await initAnonymousSession(tokenStorage, authStore);
}

/** Resolves true only when the refresh succeeded AND tokenStorage has the new token. */
export async function refreshAccessToken(): Promise<boolean> {
  try {
    await authApi.refreshToken();
    return tokenStorage.hasTokens();
  } catch (error) {
    console.warn('[refreshAccessToken] refresh failed', error);
    return false;
  }
}
