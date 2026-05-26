import {
  createAuthStore,
  createCrossTabSync,
  createTokenStorage,
} from '@jovandyaz/auth-react';

import { aiClient, httpClient } from '@knowtis/api-client';

import { setTokenStorage as setCollaborationTokenStorage } from '../collaboration/token-provider';
import { initAnonymousSession } from './anonymous-session';
import { createAuthApiAdapter } from './auth-api-adapter';
import { AUTH_STORAGE_KEY } from './constants';
import { runInitAuth } from './init-auth';
import { performSessionLogout } from './perform-session-logout';

export { SessionExpiredError } from './init-auth';

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

/** Restores session or creates an anonymous one. Throws SessionExpiredError
 *  when a non-anonymous user's silent refresh fails. */
export async function initAuth(): Promise<void> {
  await runInitAuth({
    authStore,
    authApi,
    tokenStorage,
    initAnonymousSession,
  });
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
