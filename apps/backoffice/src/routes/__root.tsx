import { createRootRoute, Outlet } from '@tanstack/react-router';

import { initAuthOnce } from '@/auth/setup';
import { AppProviders } from '@/providers/AppProviders';

import { ErrorState } from '@knowtis/design-system';

export const Route = createRootRoute({
  beforeLoad: () => initAuthOnce(),
  component: RootComponent,
  errorComponent: RootErrorBoundary,
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

function RootComponent() {
  return (
    <AppProviders>
      <div className="min-h-screen bg-(--background)">
        <Outlet />
      </div>
    </AppProviders>
  );
}
