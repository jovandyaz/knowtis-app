import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { authStore } from '@/auth';
import { Sidebar } from '@/components/layout/Sidebar';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const { isAuthenticated } = authStore.getState();
    if (!isAuthenticated) {
      throw redirect({
        to: '/login',
        search:
          location.pathname !== '/'
            ? { redirect: location.pathname }
            : { redirect: undefined },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div className="flex min-h-screen bg-(--background)">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0 transition-all duration-300 md:pl-56">
        <div className="h-16 md:hidden" />

        <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
