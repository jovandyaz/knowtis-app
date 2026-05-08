import {
  createAuthStore,
  createCrossTabSync,
  createTokenStorage,
} from '@jovandyaz/auth-react';

import { aiClient, httpClient } from '@knowtis/api-client';

import { setTokenStorage as setCollaborationTokenStorage } from '../collaboration/token-provider';
import { initAnonymousSession } from './anonymous-session';
import { createAuthApiAdapter } from './auth-api-adapter';

const AUTH_STORAGE_KEY = 'knowtis-auth';

/** App-level auth instances created once at module load. */
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

/** Cross-tab logout sync — detects logout in other tabs. */
createCrossTabSync({
  storageKey: AUTH_STORAGE_KEY,
  onLogoutDetected: () => {
    const wasAnonymous = authStore.getState().user?.isAnonymous;
    tokenStorage.clearTokens();
    authStore.getState().logout();

    if (!wasAnonymous) {
      window.location.href = '/login';
    }
  },
});

/**
 * Initialize auth — restores authenticated session or creates anonymous session.
 */
export async function initAuth(): Promise<void> {
  const { isAuthenticated, user } = authStore.getState();
  if (isAuthenticated && !user?.isAnonymous && !tokenStorage.hasTokens()) {
    try {
      await authApi.refreshToken();
    } catch (error) {
      console.error('[initAuth] Silent refresh failed, logging out', error);
      // logout() is synchronous — it mutates the store immediately, so
      // initAnonymousSession reads the cleared state below.
      authStore.getState().logout();
    }
  }

  await initAnonymousSession(tokenStorage, authStore);
}

/**
 * Returns true if the auth refresh succeeded and the new access token is
 * synchronously observable via `tokenStorage.getAccessToken()`. Returns false
 * on any failure — callers (e.g. the collaboration hook's `onAuthRefresh`)
 * should treat false as terminal.
 */
export async function refreshAccessToken(): Promise<boolean> {
  try {
    await authApi.refreshToken();
    return tokenStorage.hasTokens();
  } catch (error) {
    console.warn('[refreshAccessToken] refresh failed', error);
    return false;
  }
}
