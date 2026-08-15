import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';

import { classifyRefreshFailure } from '@knowtis/api-client';

/** Thrown when a non-anonymous user's refresh credential is rejected at boot. */
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
      if (classifyRefreshFailure(error) === 'rejected') {
        console.error(
          '[initAuth] Refresh credential rejected, logging out',
          error
        );
        authStore.getState().logout();
        throw new SessionExpiredError();
      }
      // Falling through would hand a registered user to the anonymous flow,
      // whose demotion guard throws the very error this branch is avoiding.
      console.warn(
        '[initAuth] Silent refresh unavailable, keeping the session',
        error
      );
      return;
    }
  }

  await initAnonymousSession(tokenStorage, authStore);
}
