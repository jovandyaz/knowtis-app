import { useTranslation } from 'react-i18next';

import { useNavigate } from '@tanstack/react-router';

import { useAuthStore, useAuthUser, useLogout } from '@jovandyaz/auth-react';
import { ChevronUp, LogOut, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

import { useUpdateProfile } from '@knowtis/data-access-users';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from '@knowtis/design-system';
import type { SupportedLocale } from '@knowtis/shared-i18n';
import { SUPPORTED_LOCALES } from '@knowtis/shared-i18n';
import { getInitials } from '@knowtis/shared-util';

interface SidebarUserMenuProps {
  username: string;
}

export function SidebarUserMenu({ username }: SidebarUserMenuProps) {
  const navigate = useNavigate();
  const { mutate: logout } = useLogout();
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation('common');
  const user = useAuthUser();
  const store = useAuthStore();
  const setUser = store((state) => state.setUser);
  const updateProfile = useUpdateProfile();

  const handleLanguageChange = (locale: SupportedLocale) => {
    const previousLocale = i18n.language as SupportedLocale;
    const previousUser = user;

    i18n.changeLanguage(locale);
    if (user) {
      setUser({ ...user, locale });
    }

    updateProfile.mutate(
      { locale },
      {
        onError: () => {
          i18n.changeLanguage(previousLocale);
          if (previousUser) {
            setUser({ ...previousUser, locale: previousLocale });
          }
        },
      }
    );
  };

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
        <DropdownMenuItem onClick={() => navigate({ to: '/profile' })}>
          <User className="h-4 w-4" />
          {t('labels.profile')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSwitchItem
          checked={theme === 'dark'}
          onCheckedChange={(checked: boolean) =>
            setTheme(checked ? 'dark' : 'light')
          }
        >
          {t('theme.darkMode')}
        </DropdownMenuSwitchItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs text-muted-foreground px-2">
          {t('language.label')}
        </DropdownMenuLabel>
        {SUPPORTED_LOCALES.map((locale) => (
          <DropdownMenuSwitchItem
            key={locale}
            checked={
              i18n.language === locale ||
              i18n.language?.startsWith(`${locale}-`)
            }
            onCheckedChange={() => handleLanguageChange(locale)}
          >
            {t(`language.${locale}`)}
          </DropdownMenuSwitchItem>
        ))}

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
