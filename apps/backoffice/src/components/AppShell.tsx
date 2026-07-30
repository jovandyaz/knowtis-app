import type { ReactNode } from 'react';

import { AppShellMobileNav } from '@/components/AppShellMobileNav';
import { AppShellSidebar } from '@/components/AppShellSidebar';

import { useMediaQuery } from '@knowtis/shared-hooks';

const DESKTOP_MEDIA_QUERY = '(min-width: 768px)';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {isDesktop ? <AppShellSidebar /> : <AppShellMobileNav />}
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
