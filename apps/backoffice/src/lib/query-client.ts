import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { authStore, performLogout } from '@/auth/setup';

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

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleAuthError,
  }),
  mutationCache: new MutationCache({
    onError: handleAuthError,
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
