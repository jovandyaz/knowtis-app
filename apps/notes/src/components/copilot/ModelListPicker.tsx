import { useTranslation } from 'react-i18next';

import { useAISettings, useAvailableModels } from '@/hooks';
import { useAgentStore } from '@/stores/agent.store';
import { useSettingsStore } from '@/stores/settings.store';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { Button, ModelSelect } from '@knowtis/design-system';
import { FEATURE_FLAG_KEYS, MODEL_TIERS } from '@knowtis/shared-types';

export function ModelListPicker() {
  const { t } = useTranslation('common');
  const { data: models, isPending, isError, refetch } = useAvailableModels();
  const { data: prefs } = useAISettings();
  const selected = useAgentStore((s) => s.selectedModel);
  const setSelected = useAgentStore((s) => s.setSelectedModel);
  const openSettings = useSettingsStore((s) => s.open);
  const byokEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.AGENT_BYOK);

  const status = isError ? 'error' : isPending ? 'loading' : 'ready';

  const options = (models ?? []).map((m) => ({
    ...m,
    locked: m.access === 'requires_byok',
  }));
  // Advertise unlocking only when settings can actually manage keys.
  const showUnlockCta = options.some((m) => m.locked) && byokEnabled;

  const accountDefaultId =
    prefs?.preferredModel ?? models?.find((m) => m.isDefault)?.id ?? null;
  const accountDefaultLabel = models?.find(
    (m) => m.id === accountDefaultId
  )?.label;

  return (
    <ModelSelect
      models={options}
      value={selected ?? prefs?.preferredModel ?? null}
      onSelect={setSelected}
      tierOrder={MODEL_TIERS}
      status={status}
      triggerClassName="h-8"
      triggerVariant="ghost"
      onRetry={() => void refetch()}
      tierLabel={(tier) => t(`aiAssistant.tier.${tier}` as never)}
      renderDescription={(m) => t((m.descriptionKey ?? '') as never)}
      triggerLabel={t('aiAssistant.defaultHint')}
      loadingLabel={t('aiAssistant.loadingModels')}
      errorLabel={t('aiAssistant.loadError')}
      emptyLabel={t('aiAssistant.noModels')}
      retryLabel={t('aiAssistant.retry')}
      billedBadgeLabel={t('aiAssistant.byok.billedBadge')}
      lockedBadgeLabel={t('aiAssistant.byok.lockedBadge')}
      footer={
        showUnlockCta ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto whitespace-normal p-0 text-left text-xs font-normal"
            onClick={() => openSettings('aiAssistant')}
          >
            {t('aiAssistant.byok.unlockCta')}
          </Button>
        ) : accountDefaultLabel ? (
          `${t('aiAssistant.defaultHint')}: ${accountDefaultLabel}`
        ) : undefined
      }
    />
  );
}
