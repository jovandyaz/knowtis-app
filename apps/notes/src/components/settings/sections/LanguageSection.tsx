import { useTranslation } from 'react-i18next';

import { useAuthStore, useAuthUser } from '@jovandyaz/auth-react';

import { useUpdateProfile } from '@knowtis/data-access-users';
import { SegmentedControl } from '@knowtis/design-system';
import type { SupportedLocale } from '@knowtis/shared-util';
import { SUPPORTED_LOCALES } from '@knowtis/shared-util';

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

      <SegmentedControl
        aria-label={t('settings.sections.language')}
        options={SUPPORTED_LOCALES.map((locale) => ({
          value: locale,
          label: t(`language.${locale}`),
        }))}
        value={
          SUPPORTED_LOCALES.find(
            (locale) =>
              i18n.language === locale ||
              i18n.language?.startsWith(`${locale}-`)
          ) ?? null
        }
        onValueChange={handleLanguageChange}
      />
    </div>
  );
}
