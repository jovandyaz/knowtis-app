import type { ReactNode } from 'react';

import { Navigate, useSearch } from '@tanstack/react-router';

import { useAuthLoading, useIsAuthenticated } from '@jovandyaz/auth-react';
import { Loader2 } from 'lucide-react';

interface PublicRouteProps {
  children: ReactNode;
}

export function PublicRoute({ children }: PublicRouteProps) {
  const isAuthenticated = useIsAuthenticated();
  const isLoading = useAuthLoading();
  const search = useSearch({ strict: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const redirect = (search as any)?.redirect || '/';

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-(--primary)" />
      </div>
    );
  }

  if (isAuthenticated) {
    const target = redirect.includes('/login') ? '/' : redirect;
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
