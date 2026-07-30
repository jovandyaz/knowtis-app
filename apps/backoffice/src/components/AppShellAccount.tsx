import { performLogout } from '@/auth/setup';
import { useAuthUser } from '@jovandyaz/auth-react';

import { Button, ThemeToggle } from '@knowtis/design-system';

export function AppShellAccount() {
  const user = useAuthUser();

  return (
    <div className="flex flex-col gap-2 border-t border-(--border) pt-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-(--muted-foreground)">
          {user?.email}
        </span>
        <ThemeToggle />
      </div>
      <Button variant="outline" size="sm" onClick={() => void performLogout()}>
        Sign out
      </Button>
    </div>
  );
}
