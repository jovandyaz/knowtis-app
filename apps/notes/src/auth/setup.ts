import {
  authQueryKeys,
  createAuthStore,
  createCrossTabSync,
  createTokenStorage,
} from '@jovandyaz/auth-react';

import {
  agentClient,
  aiClient,
  classifyRefreshFailure,
  httpClient,
  type RefreshOutcome,
} from '@knowtis/api-client';

import { setTokenStorage as setCollaborationTokenStorage } from '../collaboration/token-provider';
import { initAnonymousSession } from './anonymous-session';
import { createAuthApiAdapter } from './auth-api-adapter';
import { AUTH_STORAGE_KEY } from './constants';
import { syncVerifiedUserFromOtherTab } from './cross-tab-profile-sync';
import { runEnsureGuestSession } from './guest-session';
import { runInitAuth } from './init-auth';
import { performSessionLogout } from './perform-session-logout';
import { redirectToLoginWithReload } from './redirect-to-login';

export { SessionExpiredError } from './init-auth';

export const tokenStorage = createTokenStorage();

export const authStore = createAuthStore({
  tokenStorage,
  storageKey: AUTH_STORAGE_KEY,
});

setCollaborationTokenStorage(tokenStorage);
aiClient.setTokenProvider(tokenStorage);
agentClient.setTokenProvider(tokenStorage);

export const authApi = createAuthApiAdapter({
  httpClient,
  tokenStorage,
  authStore,
});

function handleSessionExpired(): void {
  performSessionLogout({
    authStore,
    tokenStorage,
    redirect: redirectToLoginWithReload,
  });
}

// `@/lib/query-client` imports this module through `@/auth`, so the query
// client is loaded lazily to avoid an import cycle.
function invalidateProfileQuery(): void {
  void import('@/lib/query-client').then(({ queryClient }) =>
    queryClient.invalidateQueries({ queryKey: authQueryKeys.profile() })
  );
}

createCrossTabSync({
  storageKey: AUTH_STORAGE_KEY,
  onLogoutDetected: handleSessionExpired,
  onVerifiedUserDetected: (verified) => {
    syncVerifiedUserFromOtherTab(verified, {
      user: authStore.getState().user,
      invalidateProfile: invalidateProfileQuery,
    });
  },
});

export { performSessionLogout } from './perform-session-logout';

/** Restores the session or creates an anonymous one. Throws SessionExpiredError
 *  only when the refresh credential is rejected; a server or network failure
 *  resolves with the stored session intact, for the first request to retry. */
export async function initAuth(): Promise<void> {
  await runInitAuth({
    authStore,
    authApi,
    tokenStorage,
    initAnonymousSession,
  });
}

/** Resolves false when the visitor must stay read-only. */
export async function ensureGuestSession(): Promise<boolean> {
  return runEnsureGuestSession({
    authStore,
    tokenStorage,
    initAnonymousSession,
  });
}

/**
 * Resolves `refreshed` only when the new token is observable afterwards.
 * Distinguishes a dead credential from an unreachable server so a socket can
 * reconnect through a blip instead of tearing the session down.
 */
export async function refreshAccessToken(): Promise<RefreshOutcome> {
  try {
    await authApi.refreshToken();
    return tokenStorage.hasTokens() ? 'refreshed' : 'rejected';
  } catch (error) {
    console.warn('[refreshAccessToken] refresh failed', error);
    return classifyRefreshFailure(error);
  }
}

aiClient.setAuthRefreshHandler(refreshAccessToken);
aiClient.setSessionExpiredHandler(handleSessionExpired);
agentClient.setAuthRefreshHandler(refreshAccessToken);
agentClient.setSessionExpiredHandler(handleSessionExpired);
