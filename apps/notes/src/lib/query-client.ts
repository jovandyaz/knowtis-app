import { QueryCache, QueryClient } from '@tanstack/react-query';

import { authStore } from '@/auth';

import { ApiClientError } from '@knowtis/api-client';

function handleAuthFailure(): void {
  const user = authStore.getState().user;
  if (user && !user.isAnonymous) {
    authStore.getState().logout();
    window.location.href = '/login';
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
      retry: (failureCount, error) => {
        if (ApiClientError.isApiClientError(error) && error.status === 401) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});
