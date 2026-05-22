import type { AuthStoreInstance, TokenStorage } from '@jovandyaz/auth-react';

interface PerformSessionLogoutDeps {
  authStore: AuthStoreInstance;
  tokenStorage: TokenStorage;
  redirect?: (() => void) | undefined;
}

/**
 * Single source of truth for "session ended" cleanup: clears tokens, logs the
 * user out of the auth store, and optionally redirects. Anonymous users skip
 * the redirect (they have no login state to return to).
 *
 * Used by the cross-tab logout sync (hard navigation via `window.location`)
 * and the collaboration hook's session-expired path (SPA navigation via
 * `useNavigate`). Keep both consumers calling this helper so the logout
 * semantics stay consistent.
 */
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
