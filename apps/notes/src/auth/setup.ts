import { createAuthStore, createTokenStorage } from '@jovandyaz/auth-react';

import { httpClient } from '@knowtis/api-client';

import { createAuthApiAdapter } from './auth-api-adapter';

/**
 * App-level auth instances created once at module load.
 * Uses the OLD localStorage keys to preserve existing user sessions.
 */
export const tokenStorage = createTokenStorage({
  refreshTokenKey: 'knowtis_refresh_token',
});

export const authStore = createAuthStore({
  tokenStorage,
  storageKey: 'knowtis-auth',
});

export const authApi = createAuthApiAdapter({
  httpClient,
  tokenStorage,
});
