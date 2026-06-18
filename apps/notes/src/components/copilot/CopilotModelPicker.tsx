import { useTranslation } from 'react-i18next';

import { useAISettings, useAvailableModels } from '@/hooks';
import { useAgentStore } from '@/stores/agent.store';

import { ModelSelect } from '@knowtis/design-system';

export function CopilotModelPicker() {
  const { t } = useTranslation('common');
  const { data: models } = useAvailableModels();
  const { data: prefs } = useAISettings();
  const selected = useAgentStore((s) => s.selectedModel);
  const setSelected = useAgentStore((s) => s.setSelectedModel);

  const accountDefaultId =
    prefs?.preferredModel ?? models?.find((m) => m.isDefault)?.id ?? null;
  const accountDefaultLabel = models?.find(
    (m) => m.id === accountDefaultId
  )?.label;

  return (
    <ModelSelect
      models={models ?? []}
      value={selected ?? prefs?.preferredModel ?? null}
      onSelect={setSelected}
      tierLabel={(tier) => t(`aiAssistant.tier.${tier}` as never)}
      renderDescription={(m) => t((m.descriptionKey ?? '') as never)}
      triggerLabel={t('aiAssistant.defaultHint')}
      footer={
        accountDefaultLabel
          ? `${t('aiAssistant.defaultHint')}: ${accountDefaultLabel}`
          : undefined
      }
    />
  );
}
