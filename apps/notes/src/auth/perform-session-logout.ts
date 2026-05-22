import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';

interface PerformSessionLogoutDeps {
  authStore: AuthStoreInstance;
  tokenStorage: TokenStorage;
  redirect?: (() => void) | undefined;
}

/** Clear tokens + log out the store. Skip the redirect for anonymous users. */
export function performSessionLogout({
  authStore,
  tokenStorage,
  redirect,
}: PerformSessionLogoutDeps): void {
  const wasAnonymous = authStore.getState().user?.isAnonymous ?? false;
  tokenStorage.clearTokens();
  authStore.getState().logout();
  if (!wasAnonymous) {
    redirect?.();
  }
}
