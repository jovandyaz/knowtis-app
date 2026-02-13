import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { createRootRoute, Outlet } from '@tanstack/react-router';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { Layout } from '@/components/layout/Layout';
import { AbilityProvider, ThemeProvider, YjsProvider } from '@/providers';

import { ApiClientError } from '@knowtis/api-client';
import { useAuthStore } from '@knowtis/auth';
import { Toaster } from '@knowtis/design-system';

function handleAuthFailure(): void {
  useAuthStore.getState().logout();
  window.location.href = '/login';
}

const queryCache = new QueryCache({
  onError: (error) => {
    if (ApiClientError.isApiClientError(error) && error.status === 401) {
      handleAuthFailure();
    }
  },
});

const queryClient = new QueryClient({
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

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AbilityProvider>
            <YjsProvider>
              <Layout>
                <Outlet />
              </Layout>
            </YjsProvider>
          </AbilityProvider>
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
