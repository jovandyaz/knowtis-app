import { performLogout } from '@/auth/setup';
import { useAuthUser } from '@jovandyaz/auth-react';

import { Button, cn, ThemeToggle } from '@knowtis/design-system';

interface AppShellAccountProps {
  className?: string;
}

export function AppShellAccount({ className }: AppShellAccountProps) {
  const user = useAuthUser();

  return (
    <div className={cn('flex flex-col gap-2', className)}>
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
