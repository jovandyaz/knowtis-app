import { createAuthStore, createTokenStorage } from '@jovandyaz/auth-react';

import { aiClient, collaborationClient, httpClient } from '@knowtis/api-client';

import { createAuthApiAdapter } from './auth-api-adapter';

/** App-level auth instances created once at module load. */
export const tokenStorage = createTokenStorage();

export const authStore = createAuthStore({
  tokenStorage,
  storageKey: 'knowtis-auth',
});

collaborationClient.setTokenProvider(tokenStorage);
aiClient.setTokenProvider(tokenStorage);

export const authApi = createAuthApiAdapter({
  httpClient,
  tokenStorage,
});
