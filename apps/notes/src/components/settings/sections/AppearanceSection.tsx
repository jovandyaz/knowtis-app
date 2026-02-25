import { useTranslation } from 'react-i18next';

import { useTheme } from 'next-themes';

import { Switch } from '@knowtis/design-system';

import { SectionHeader } from '../SectionHeader';

export function AppearanceSection() {
  const { t } = useTranslation('common');
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t('settings.sections.appearance')}
        description={t('settings.descriptions.appearance')}
      />

      <div className="flex items-center justify-between rounded-lg border border-(--border) p-4">
        <span className="text-sm text-(--foreground)">
          {t('theme.darkMode')}
        </span>
        <Switch
          checked={resolvedTheme === 'dark'}
          onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        />
      </div>
    </div>
  );
}
