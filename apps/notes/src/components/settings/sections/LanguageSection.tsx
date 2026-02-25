import { useTranslation } from 'react-i18next';

import { useAuthStore, useAuthUser } from '@jovandyaz/auth-react';

import { useUpdateProfile } from '@knowtis/data-access-users';
import { cn } from '@knowtis/design-system';
import type { SupportedLocale } from '@knowtis/shared-i18n';
import { SUPPORTED_LOCALES } from '@knowtis/shared-i18n';

import { SectionHeader } from '../SectionHeader';

export function LanguageSection() {
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

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t('settings.sections.language')}
        description={t('settings.descriptions.language')}
      />

      <div className="flex gap-3">
        {SUPPORTED_LOCALES.map((locale) => {
          const isActive =
            i18n.language === locale || i18n.language?.startsWith(`${locale}-`);
          return (
            <button
              key={locale}
              type="button"
              onClick={() => handleLanguageChange(locale)}
              className={cn(
                'flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-(--foreground) bg-(--foreground) text-(--background)'
                  : 'border-(--border) text-(--muted-foreground) hover:border-(--foreground)/50 hover:text-(--foreground)'
              )}
            >
              {t(`language.${locale}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
