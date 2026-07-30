import type { ReactNode } from 'react';

import { AppShellAccount } from '@/components/AppShellAccount';
import { AppShellNav } from '@/components/AppShellNav';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex w-full flex-col border-b border-(--border) p-4 md:w-56 md:border-b-0 md:border-r">
        <span className="mb-6 text-sm font-semibold">Knowtis Backoffice</span>
        <AppShellNav />
        <AppShellAccount />
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
