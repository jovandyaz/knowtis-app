import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { redirectToLoginWithReload } from '@/auth/redirect-to-login';
import { ROUTES } from '@/config';
import { useSettingsStore } from '@/stores/settings.store';
import { useLogout } from '@jovandyaz/auth-react';
import { ChevronUp, LogIn, LogOut, Settings, UserPlus } from 'lucide-react';

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
  isAnonymous?: boolean;
}

export function SidebarUserMenu({
  username,
  isAnonymous = false,
}: SidebarUserMenuProps) {
  const navigate = useNavigate();
  const { mutate: logout } = useLogout();
  const { t } = useTranslation('common');
  const openSettings = useSettingsStore((state) => state.open);

  const handleLogout = () => {
    logout(undefined, {
      onSuccess: redirectToLoginWithReload,
    });
  };

  const displayName = isAnonymous ? t('anonymous.guest') : username;
  const initials = getInitials(displayName);

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
            {displayName}
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
        {isAnonymous ? (
          <>
            <DropdownMenuItem
              onClick={() => navigate({ to: ROUTES.REGISTER })}
              className="text-(--primary) focus:text-(--primary)"
            >
              <UserPlus className="h-4 w-4" />
              {t('nav.createAccount')}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() =>
                navigate({ to: ROUTES.LOGIN, search: { redirect: undefined } })
              }
            >
              <LogIn className="h-4 w-4" />
              {t('nav.signIn')}
            </DropdownMenuItem>
          </>
        ) : (
          <>
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
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
