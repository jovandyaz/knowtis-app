import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';

import { authApi, authStore, tokenStorage } from '@/auth/setup';
import { queryClient } from '@/lib/query-client';
import { AuthProvider, useSessionManager } from '@jovandyaz/auth-react';

import { classifyRefreshFailure } from '@knowtis/api-client';
import { Toaster, TooltipProvider } from '@knowtis/design-system';

import { ThemeProvider } from './ThemeProvider';

function SessionManager() {
  useSessionManager({
    refreshMarginMs: 60_000,
    isTerminalRefreshFailure: (error) =>
      classifyRefreshFailure(error) === 'rejected',
  });
  return null;
}

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={authApi} tokenStorage={tokenStorage} store={authStore}>
        <SessionManager />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
