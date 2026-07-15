import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { authStore, performLogout } from '@/auth/setup';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';

// Only end sessions that exist: a 401 from the login mutation itself must not
// trigger a logout redirect that reloads the page and wipes the form error.
function handleAuthError(error: Error): void {
  if (
    ApiClientError.isApiClientError(error) &&
    error.status === 401 &&
    authStore.getState().isAuthenticated
  ) {
    void performLogout();
  }
}

// A failed mutation (role change, flag toggle, ...) has no in-page error UI to
// fall back on, unlike queries — surface it via toast so the admin isn't left
// wondering why the switch snapped back.
function handleMutationError(error: Error): void {
  if (ApiClientError.isApiClientError(error) && error.status === 401) {
    handleAuthError(error);
    return;
  }
  const detail = ApiClientError.isApiClientError(error)
    ? `: ${error.message}`
    : '';
  toast.error(`Action failed${detail}`);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleAuthError,
  }),
  mutationCache: new MutationCache({
    onError: handleMutationError,
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: (failureCount, error) =>
        !(ApiClientError.isApiClientError(error) && error.status === 401) &&
        failureCount < 1,
    },
  },
});
