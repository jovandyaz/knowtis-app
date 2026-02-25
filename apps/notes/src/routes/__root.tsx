import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { createRootRoute, Navigate, Outlet } from '@tanstack/react-router';

import { authApi, authStore, tokenStorage } from '@/auth';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AbilityProvider, ThemeProvider, YjsProvider } from '@/providers';
import { AuthProvider } from '@jovandyaz/auth-react';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import { Toaster } from '@knowtis/design-system';

function handleAuthFailure(): void {
  authStore.getState().logout();
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
  notFoundComponent: NotFoundRedirect,
});

function NotFoundRedirect() {
  const { isAuthenticated } = authStore.getState();
  const { t } = useTranslation('errors');

  useEffect(() => {
    if (isAuthenticated) {
      toast.error(t('notFound'));
    }
  }, [isAuthenticated, t]);

  if (isAuthenticated) {
    return <Navigate to="/" />;
  }
  return <Navigate to="/login" search={{ redirect: undefined }} />;
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
