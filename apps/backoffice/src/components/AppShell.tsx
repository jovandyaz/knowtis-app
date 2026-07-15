import type { ReactNode } from 'react';

import { Link } from '@tanstack/react-router';

import { performLogout } from '@/auth/setup';
import { useAuthUser } from '@jovandyaz/auth-react';

import { Button } from '@knowtis/design-system';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const user = useAuthUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex w-full flex-col border-b border-(--border) p-4 md:w-56 md:border-b-0 md:border-r">
        <span className="mb-6 text-sm font-semibold">Knowtis Backoffice</span>
        <nav className="flex flex-1 flex-col gap-1">
          <Link
            to="/"
            className="rounded px-3 py-2 text-sm hover:bg-(--muted) [&.active]:bg-(--muted)"
          >
            Dashboard
          </Link>
        </nav>
        <div className="flex flex-col gap-2 border-t border-(--border) pt-4">
          <span className="truncate text-xs text-(--muted-foreground)">
            {user?.email}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void performLogout()}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
