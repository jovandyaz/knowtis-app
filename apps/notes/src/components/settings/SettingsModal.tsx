import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import { useSettingsStore } from '@/stores/settings.store';
import type { SettingsSection } from '@/stores/settings.store';
import { Settings } from 'lucide-react';

import { Dialog, DialogContent } from '@knowtis/design-system';

import { SectionHeader } from './SectionHeader';
import { AccountSection } from './sections/AccountSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { LanguageSection } from './sections/LanguageSection';
import { ProfileSection } from './sections/ProfileSection';
import { SettingsNav } from './SettingsNav';

function PlaceholderSection({ section }: { section: SettingsSection }) {
  const { t } = useTranslation('common');
  return (
    <div className="space-y-6">
      <SectionHeader
        title={t(`settings.sections.${section}`)}
        description={t(`settings.descriptions.${section}`)}
      />
      <div className="flex items-center justify-center rounded-lg border border-(--border) border-dashed p-12">
        <p className="text-sm text-(--muted-foreground)">
          {t('states.comingSoon')}
        </p>
      </div>
    </div>
  );
}

const SECTION_COMPONENTS: Record<SettingsSection, ComponentType> = {
  profile: ProfileSection,
  appearance: AppearanceSection,
  language: LanguageSection,
  editor: () => <PlaceholderSection section="editor" />,
  notifications: () => <PlaceholderSection section="notifications" />,
  integrations: IntegrationsSection,
  account: AccountSection,
};

export function SettingsModal() {
  const { isOpen, activeSection, close, open } = useSettingsStore();
  const { t } = useTranslation('common');

  const SectionComponent = SECTION_COMPONENTS[activeSection];

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:h-[80vh] sm:max-w-3xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-(--border) px-6 py-4">
          <Settings className="h-4 w-4 text-(--muted-foreground)" />
          <h2 className="text-sm font-semibold text-(--foreground)">
            {t('settings.title')}
          </h2>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <SettingsNav activeSection={activeSection} onSectionChange={open} />
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 overscroll-y-contain">
            <SectionComponent />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
