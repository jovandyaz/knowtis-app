import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { redirectToLoginWithReload } from '@/auth/redirect-to-login';
import { ROUTES } from '@/config/routes.config';
import { useSettingsStore } from '@/stores/settings.store';
import { useLogout } from '@jovandyaz/auth-react';
import { ChevronUp, LogIn, LogOut, Settings, UserPlus } from 'lucide-react';

import {
  Button,
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
    <div className="shrink-0 p-3 border-t border-border">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label={t('nav.accountLabel', { name: displayName })}
            className="h-auto min-h-11 w-full justify-start gap-3 px-2 py-1.5"
          >
            <div
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--secondary) text-(--secondary-foreground) text-xs font-medium"
            >
              {initials || '?'}
            </div>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-(--foreground)">
              {displayName}
            </span>
            <ChevronUp className="h-4 w-4 shrink-0 text-(--muted-foreground)" />
          </Button>
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
                  navigate({
                    to: ROUTES.LOGIN,
                    search: { redirect: undefined },
                  })
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
    </div>
  );
}
