import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';

import { authApi, authStore, tokenStorage } from '@/auth';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AnalyticsIdentitySync } from '@/lib/analytics/AnalyticsIdentitySync';
import { queryClient } from '@/lib/query-client';
import { AuthProvider, useSessionManager } from '@jovandyaz/auth-react';

import { classifyRefreshFailure } from '@knowtis/api-client';
import { YjsProvider } from '@knowtis/crdt';
import { Toaster, TooltipProvider } from '@knowtis/design-system';
import { useMediaQuery } from '@knowtis/shared-hooks';

import { AbilityProvider } from './ability-provider';
import { PostHogProvider } from './PostHogProvider';
import { ThemeProvider } from './ThemeProvider';

// 600px matches sonner's mobile breakpoint (full-width toasts below it). The
// app's bottom edge is congested by the nav + FAB stack, so mobile toasts move
// to the clear top-center; desktop keeps the bottom-right card.
const MOBILE_TOAST_QUERY = '(max-width: 600px)';

function AppToaster() {
  const isMobile = useMediaQuery(MOBILE_TOAST_QUERY);
  return <Toaster position={isMobile ? 'top-center' : 'bottom-right'} />;
}

function SessionManager() {
  useSessionManager({
    refreshMarginMs: 60_000,
    isTerminalRefreshFailure: (error) =>
      classifyRefreshFailure(error) === 'rejected',
  });
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
            <AnalyticsIdentitySync />
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <TooltipProvider delayDuration={300}>
                <AbilityProvider>
                  <YjsProvider>{children}</YjsProvider>
                </AbilityProvider>
                <AppToaster />
              </TooltipProvider>
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </PostHogProvider>
    </AppErrorBoundary>
  );
}
