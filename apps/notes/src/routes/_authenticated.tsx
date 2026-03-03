import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { authStore } from '@/auth';
import { BottomNav } from '@/components/layout/BottomNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { useAuthLoading, useAuthUser } from '@jovandyaz/auth-react';

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
  const user = useAuthUser();
  const isLoading = useAuthLoading();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (user?.locale && user.locale !== i18n.language) {
      i18n.changeLanguage(user.locale);
    }
  }, [user?.locale, i18n]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--background)">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-(--muted) border-t-(--primary)" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-(--background)">
      <Sidebar />
      <SettingsModal />
      <BottomNav />

      <main className="flex-1 flex flex-col min-w-0 transition-all duration-300 md:pl-56 pb-20 md:pb-0">
        <div className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
