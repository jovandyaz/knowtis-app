import {
  createAuthStore,
  createCrossTabSync,
  createTokenStorage,
} from '@jovandyaz/auth-react';
import type { AuthUserProfile } from '@jovandyaz/auth-react';

import { httpClient } from '@knowtis/api-client';

import { createBackofficeAuthApi } from './auth-api-adapter';
import { AUTH_STORAGE_KEY } from './constants';

export const tokenStorage = createTokenStorage();

export const authStore = createAuthStore({
  tokenStorage,
  storageKey: AUTH_STORAGE_KEY,
});

httpClient.setTokenProvider(tokenStorage);

export const authApi = createBackofficeAuthApi({ httpClient, tokenStorage });

export function performLogout(): void {
  authStore.getState().logout();
  window.location.assign('/login');
}

createCrossTabSync({
  storageKey: AUTH_STORAGE_KEY,
  onLogoutDetected: performLogout,
});

httpClient.setRefreshTokenCallback(async () => {
  try {
    const tokens = await authApi.refreshToken();
    return tokens.accessToken;
  } catch (error) {
    console.warn('[backoffice-auth] token refresh failed, logging out', error);
    authStore.getState().logout();
    return null;
  }
});

export async function syncUserProfile(): Promise<AuthUserProfile> {
  const profile = await authApi.getProfile();
  authStore.getState().setUser(profile);
  return profile;
}

/**
 * Restores the session on app start: silent refresh, then profile (with role).
 * Clears auth state when the refresh cookie is absent/expired.
 */
export async function initAuth(): Promise<void> {
  try {
    await authApi.refreshToken();
    await syncUserProfile();
  } catch (error) {
    console.warn('[backoffice-auth] session restore failed', error);
    authStore.getState().logout();
  }
}

let initAuthPromise: Promise<void> | null = null;

export function initAuthOnce(): Promise<void> {
  initAuthPromise ??= initAuth();
  return initAuthPromise;
}
