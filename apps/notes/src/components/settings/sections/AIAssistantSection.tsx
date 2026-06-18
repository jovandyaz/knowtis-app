import { useTranslation } from 'react-i18next';

import {
  useAISettings,
  useAvailableModels,
  useUpdateAISettings,
} from '@/hooks';

import { ModelSelect } from '@knowtis/design-system';

import { SectionHeader } from '../SectionHeader';

export function AIAssistantSection() {
  const { t } = useTranslation('common');
  const { data: models } = useAvailableModels();
  const { data: prefs } = useAISettings();
  const { mutate: update } = useUpdateAISettings();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeader
          title={t('aiAssistant.copilotTitle')}
          description={t('aiAssistant.copilotDescription')}
        />
        <ModelSelect
          models={models ?? []}
          value={prefs?.preferredModel ?? null}
          onSelect={(id) => update({ preferredModel: id })}
          tierLabel={(tier) => t(`aiAssistant.tier.${tier}` as never)}
          renderDescription={(m) => t((m.descriptionKey ?? '') as never)}
          triggerLabel={t('aiAssistant.defaultHint')}
        />
      </section>

      <section className="space-y-1 opacity-60">
        <SectionHeader
          title={t('aiAssistant.editorTitle')}
          description={t('aiAssistant.editorComingSoon')}
        />
      </section>
    </div>
  );
}
