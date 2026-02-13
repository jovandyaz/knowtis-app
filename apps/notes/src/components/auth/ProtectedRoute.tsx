import type { ReactNode } from 'react';

import { Navigate, useLocation } from '@tanstack/react-router';

import { Loader2 } from 'lucide-react';

import { useAuthLoading, useIsAuthenticated } from '@knowtis/auth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-(--primary)" />
          <p className="text-sm text-(--muted-foreground)">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate to="/login" search={{ redirect: location.pathname }} replace />
    );
  }

  return <>{children}</>;
}
