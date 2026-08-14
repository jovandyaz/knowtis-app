import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';

export interface GuestSessionDeps {
  authStore: AuthStoreInstance;
  tokenStorage: TokenStorage;
  initAnonymousSession: (
    tokenStorage: TokenStorage,
    authStore: AuthStoreInstance
  ) => Promise<void>;
}

/**
 * Gives an account-less visitor an identity so a share link can grant them
 * write access. Resolves false when the visitor must stay read-only.
 */
export async function runEnsureGuestSession(
  deps: GuestSessionDeps
): Promise<boolean> {
  const { authStore, tokenStorage, initAnonymousSession } = deps;

  if (authStore.getState().isAuthenticated) {
    return true;
  }

  try {
    await initAnonymousSession(tokenStorage, authStore);
  } catch (error) {
    console.warn('[guestSession] Failed to create a guest session', error);
    return false;
  }

  return authStore.getState().isAuthenticated;
}
