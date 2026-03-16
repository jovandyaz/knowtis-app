import { createRootRoute, Navigate, Outlet } from '@tanstack/react-router';

import { AppProviders } from '@/providers';

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundRedirect,
});

function NotFoundRedirect() {
  return <Navigate to="/" />;
}

function RootComponent() {
  return (
    <AppProviders>
      <div className="flex min-h-screen bg-(--background)">
        <div className="w-full">
          <Outlet />
        </div>
      </div>
    </AppProviders>
  );
}
