import { useNavigate } from '@tanstack/react-router';

import { useLogout } from '@jovandyaz/auth-react';
import { LogOut, User } from 'lucide-react';
import { toast } from 'sonner';

import { Button, ThemeToggle } from '@knowtis/design-system';

/**
 * Sidebar user footer props interface
 * @property {string} username - The username to display
 */
interface SidebarUserFooterProps {
  username?: string;
}

export function SidebarUserFooter({
  username = 'Demo User',
}: SidebarUserFooterProps) {
  const navigate = useNavigate();
  const { mutate: logout } = useLogout();

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        toast.success('Signed out successfully');
        navigate({ to: '/login' });
      },
    });
  };

  return (
    <div className="p-4 border-t border-border/40 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 overflow-hidden cursor-default flex-1 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <User className="h-4 w-4" />
        </div>
        <div className="flex flex-col truncate">
          <span className="text-sm font-medium text-foreground truncate">
            {username}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title="Log out"
          className="h-9 w-9"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
