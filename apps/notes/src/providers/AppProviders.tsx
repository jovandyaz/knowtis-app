import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';

import { authApi, authStore, tokenStorage } from '@/auth';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { queryClient } from '@/lib/query-client';
import { AuthProvider, useSessionManager } from '@jovandyaz/auth-react';

import { Toaster, TooltipProvider } from '@knowtis/design-system';

import { AbilityProvider } from './ability-provider';
import { PostHogProvider } from './PostHogProvider';
import { ThemeProvider } from './ThemeProvider';
import { YjsProvider } from './YjsProvider';

function SessionManager() {
  useSessionManager({ refreshMarginMs: 60_000 });
  return null;
}

function AuthCacheSync() {
  useEffect(() => {
    return authStore.subscribe((state, prevState) => {
      if (prevState.isAuthenticated && !state.isAuthenticated) {
        queryClient.cancelQueries();
        queryClient.clear();
      }
    });
  }, []);
  return null;
}

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <AppErrorBoundary>
      <PostHogProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider
            api={authApi}
            tokenStorage={tokenStorage}
            store={authStore}
          >
            <SessionManager />
            <AuthCacheSync />
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <TooltipProvider delayDuration={300}>
                <AbilityProvider>
                  <YjsProvider>{children}</YjsProvider>
                </AbilityProvider>
                <Toaster />
              </TooltipProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </PostHogProvider>
    </AppErrorBoundary>
  );
}
