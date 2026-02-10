import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { Outlet, createRootRoute } from '@tanstack/react-router';

import { ApiClientError } from '@knowtis/api-client';
import { useAuthStore } from '@knowtis/auth';
import { Toaster } from '@knowtis/design-system';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { Layout } from '@/components/layout/Layout';
import { ThemeProvider, YjsProvider } from '@/providers';

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
          <YjsProvider>
            <Layout>
              <Outlet />
            </Layout>
          </YjsProvider>
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
