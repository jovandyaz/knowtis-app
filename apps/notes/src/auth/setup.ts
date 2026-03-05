import {
  createAuthStore,
  createCrossTabSync,
  createTokenStorage,
} from '@jovandyaz/auth-react';

import { aiClient, collaborationClient, httpClient } from '@knowtis/api-client';

import { initAnonymousSession } from './anonymous-session';
import { createAuthApiAdapter } from './auth-api-adapter';

const AUTH_STORAGE_KEY = 'knowtis-auth';

/** App-level auth instances created once at module load. */
export const tokenStorage = createTokenStorage();

export const authStore = createAuthStore({
  tokenStorage,
  storageKey: AUTH_STORAGE_KEY,
});

collaborationClient.setTokenProvider(tokenStorage);
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
    // Anonymous users: no redirect — initAnonymousSession will create
    // a new session on the next navigation/route load.
  },
});

/**
 * Initialize auth — creates anonymous session if no auth exists.
 * Called during app/route initialization.
 */
export async function initAuth(): Promise<void> {
  await initAnonymousSession(tokenStorage, authStore);
}
