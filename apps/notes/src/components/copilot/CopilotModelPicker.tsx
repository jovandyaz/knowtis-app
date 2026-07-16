import { useTranslation } from 'react-i18next';

import { useAISettings, useAvailableModels } from '@/hooks';
import { useAgentStore } from '@/stores/agent.store';

import { ModelSelect } from '@knowtis/design-system';
import { MODEL_TIERS } from '@knowtis/shared-types';

export function CopilotModelPicker() {
  const { t } = useTranslation('common');
  const { data: models, isPending, isError, refetch } = useAvailableModels();
  const { data: prefs } = useAISettings();
  const selected = useAgentStore((s) => s.selectedModel);
  const setSelected = useAgentStore((s) => s.setSelectedModel);

  const status = isError ? 'error' : isPending ? 'loading' : 'ready';

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
      tierOrder={MODEL_TIERS}
      status={status}
      triggerClassName="h-8"
      triggerVariant="ghost"
      onRetry={() => refetch()}
      tierLabel={(tier) => t(`aiAssistant.tier.${tier}` as never)}
      renderDescription={(m) => t((m.descriptionKey ?? '') as never)}
      triggerLabel={t('aiAssistant.defaultHint')}
      loadingLabel={t('aiAssistant.loadingModels')}
      errorLabel={t('aiAssistant.loadError')}
      emptyLabel={t('aiAssistant.noModels')}
      retryLabel={t('aiAssistant.retry')}
      billedBadgeLabel={t('aiAssistant.byok.billedBadge')}
      footer={
        accountDefaultLabel
          ? `${t('aiAssistant.defaultHint')}: ${accountDefaultLabel}`
          : undefined
      }
    />
  );
}
