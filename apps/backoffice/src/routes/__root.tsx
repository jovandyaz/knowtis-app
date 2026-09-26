import { createRootRoute, Outlet } from '@tanstack/react-router';

import { resolveAdminAccess } from '@/auth/admin-gate';
import { initAuthOnce } from '@/auth/setup';
import { AppShell } from '@/components/AppShell';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AppProviders } from '@/providers/AppProviders';
import { useAuthUser, useIsAuthenticated } from '@jovandyaz/auth-react';

import { ErrorState } from '@knowtis/design-system';

export const Route = createRootRoute({
  beforeLoad: () => initAuthOnce(),
  component: RootComponent,
  errorComponent: RootErrorBoundary,
  notFoundComponent: RootNotFound,
});

function RootErrorBoundary({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <ErrorState
        title="Something went wrong"
        message={error.message}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}

// An unmatched top-level path never enters the pathless _authenticated layout,
// so its admin gate and app shell are not applied unless this component does it.
function RootNotFound() {
  const isAuthenticated = useIsAuthenticated();
  const user = useAuthUser();

  if (resolveAdminAccess({ isAuthenticated, user }) !== 'allowed') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <NotFoundPage />
      </div>
    );
  }

  return (
    <AppShell>
      <NotFoundPage />
    </AppShell>
  );
}

function RootComponent() {
  return (
    <AppProviders>
      <div className="min-h-screen bg-(--background)">
        <Outlet />
      </div>
    </AppProviders>
  );
}
