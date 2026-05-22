import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';

/** Thrown when a non-anonymous user's silent refresh fails at boot. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired — silent refresh failed for authenticated user');
    this.name = 'SessionExpiredError';
  }
}

export interface InitAuthDeps {
  authStore: AuthStoreInstance;
  authApi: { refreshToken: () => Promise<unknown> };
  tokenStorage: TokenStorage;
  initAnonymousSession: (
    tokenStorage: TokenStorage,
    authStore: AuthStoreInstance
  ) => Promise<void>;
}

export async function runInitAuth(deps: InitAuthDeps): Promise<void> {
  const { authStore, authApi, tokenStorage, initAnonymousSession } = deps;
  const { isAuthenticated, user } = authStore.getState();

  if (isAuthenticated && !user?.isAnonymous && !tokenStorage.hasTokens()) {
    try {
      await authApi.refreshToken();
    } catch (error) {
      console.error('[initAuth] Silent refresh failed, logging out', error);
      authStore.getState().logout();
      throw new SessionExpiredError();
    }
  }

  await initAnonymousSession(tokenStorage, authStore);
}
