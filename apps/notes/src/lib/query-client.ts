import { QueryCache, QueryClient } from '@tanstack/react-query';

import { authStore, redirectToLoginWithReload } from '@/auth';

import { ApiClientError, isClientError } from '@knowtis/api-client';

const MAX_QUERY_RETRIES = 1;

function handleAuthFailure(): void {
  const user = authStore.getState().user;
  if (user && !user.isAnonymous) {
    authStore.getState().logout();
    redirectToLoginWithReload();
  }
}

const queryCache = new QueryCache({
  onError: (error) => {
    if (ApiClientError.isApiClientError(error) && error.status === 401) {
      handleAuthFailure();
    }
  },
});

export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: (failureCount, error) =>
        !isClientError(error) && failureCount < MAX_QUERY_RETRIES,
    },
  },
});
