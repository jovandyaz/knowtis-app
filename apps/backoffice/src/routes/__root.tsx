import { createRootRoute, Outlet } from '@tanstack/react-router';

import { ErrorState } from '@knowtis/design-system';

export const Route = createRootRoute({
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
    <div className="min-h-screen bg-(--background)">
      <Outlet />
    </div>
  );
}
