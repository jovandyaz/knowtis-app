import { QueryCache, QueryClient } from '@tanstack/react-query';

import { performLogout } from '@/auth/setup';

import { ApiClientError } from '@knowtis/api-client';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (ApiClientError.isApiClientError(error) && error.status === 401) {
        void performLogout();
      }
    },
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
