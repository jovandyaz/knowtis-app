import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { createRootRoute, Navigate, Outlet } from '@tanstack/react-router';

import { authApi, authStore, tokenStorage } from '@/auth';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AbilityProvider, ThemeProvider, YjsProvider } from '@/providers';
import { AuthProvider, useSessionManager } from '@jovandyaz/auth-react';

import { ApiClientError } from '@knowtis/api-client';
import { Toaster } from '@knowtis/design-system';

function handleAuthFailure(): void {
  const user = authStore.getState().user;
  // Only force redirect to login for registered users
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
  notFoundComponent: NotFoundRedirect,
});

function NotFoundRedirect() {
  return <Navigate to="/" />;
}

function SessionManager() {
  useSessionManager({ refreshMarginMs: 60_000 });
  return null;
}

function RootComponent() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider
          api={authApi}
          tokenStorage={tokenStorage}
          store={authStore}
        >
          <SessionManager />
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <AbilityProvider>
              <YjsProvider>
                <div className="flex min-h-screen bg-(--background)">
                  <div className="w-full">
                    <Outlet />
                  </div>
                </div>
              </YjsProvider>
            </AbilityProvider>
            <Toaster />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
