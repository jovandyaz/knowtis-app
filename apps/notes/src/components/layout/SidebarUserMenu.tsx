import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { useSettingsStore } from '@/stores/settings.store';
import { useLogout } from '@jovandyaz/auth-react';
import { ChevronUp, LogOut, Settings } from 'lucide-react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@knowtis/design-system';
import { getInitials } from '@knowtis/shared-util';

interface SidebarUserMenuProps {
  username: string;
}

export function SidebarUserMenu({ username }: SidebarUserMenuProps) {
  const navigate = useNavigate();
  const { mutate: logout } = useLogout();
  const { t } = useTranslation('common');
  const openSettings = useSettingsStore((state) => state.open);

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: () => {
        toast.success(t('nav.signedOutSuccess'));
        navigate({ to: '/login', search: { redirect: undefined } });
      },
    });
  };

  const initials = getInitials(username);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-3 border-t border-(--border)/40 p-4 outline-none transition-colors hover:bg-(--muted)/50 focus-visible:bg-(--muted)/50"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--secondary) text-(--secondary-foreground) text-xs font-medium">
            {initials || '?'}
          </div>
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-(--foreground)">
            {username}
          </span>
          <ChevronUp className="h-4 w-4 shrink-0 text-(--muted-foreground)" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
      >
        <DropdownMenuItem onClick={() => openSettings()}>
          <Settings className="h-4 w-4" />
          {t('settings.title')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleLogout}
          className="text-(--destructive) focus:text-(--destructive)"
        >
          <LogOut className="h-4 w-4" />
          {t('nav.logOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
