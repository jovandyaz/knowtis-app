import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { resolveAdminAccess } from '@/auth/admin-gate';
import { authStore } from '@/auth/setup';
import { AppShell } from '@/components/AppShell';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    const { isAuthenticated, user } = authStore.getState();
    const access = resolveAdminAccess({ isAuthenticated, user });
    if (access === 'unauthenticated') {
      throw redirect({ to: '/login' });
    }
    if (access === 'forbidden') {
      throw redirect({ to: '/forbidden' });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
