import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { resolveAdminAccess } from '@/auth/admin-gate';
import { authStore } from '@/auth/setup';
import { AppShell } from '@/components/AppShell';
import { ROUTES } from '@/config/routes.config';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    const { isAuthenticated, user } = authStore.getState();
    const access = resolveAdminAccess({ isAuthenticated, user });
    if (access === 'unauthenticated') {
      throw redirect({ to: ROUTES.LOGIN });
    }
    if (access === 'forbidden') {
      throw redirect({ to: ROUTES.FORBIDDEN });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
