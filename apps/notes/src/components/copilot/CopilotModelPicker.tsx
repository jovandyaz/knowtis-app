import { useTranslation } from 'react-i18next';

import {
  useAISettings,
  useAvailableModels,
  useUpdateAISettings,
} from '@/hooks';
import { useAgentStore } from '@/stores/agent.store';
import { useAuthUser } from '@jovandyaz/auth-react';

import { Button, ModelSelect, SegmentedControl } from '@knowtis/design-system';
import {
  DEFAULT_MODEL_INTENT,
  MODEL_TIERS,
  type ModelIntent,
} from '@knowtis/shared-types';

import {
  advancedModelOptions,
  advancedOverride,
  intentChipOptions,
} from './intent-picker-options';

export function CopilotModelPicker() {
  const { t } = useTranslation('common');
  const user = useAuthUser();
  // Anonymous users cannot persist preferences, so they run on the server default intent and get no picker.
  const showPicker = !user?.isAnonymous;
  const { data: models, isError, refetch } = useAvailableModels(showPicker);
  const { data: prefs } = useAISettings(showPicker);
  const { mutate: update } = useUpdateAISettings();
  const sessionModel = useAgentStore((s) => s.selectedModel);
  const setSessionModel = useAgentStore((s) => s.setSelectedModel);

  const advancedOptions = advancedModelOptions(models);
  const overrideModel =
    sessionModel ?? advancedOverride(prefs?.preferredModel, models);
  const intent = prefs?.preferredIntent ?? DEFAULT_MODEL_INTENT;

  const intentOptions = intentChipOptions(t);

  const selectIntent = (value: ModelIntent) => {
    setSessionModel(null);
    update({ preferredModel: null, preferredIntent: value });
  };

  const clearOverride = () => {
    setSessionModel(null);
    update({ preferredModel: null });
  };

  if (!showPicker) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <SegmentedControl
        aria-label={t('aiAssistant.intent.label')}
        options={intentOptions}
        value={overrideModel ? null : intent}
        onValueChange={selectIntent}
      />
      {advancedOptions.length > 0 || isError ? (
        <ModelSelect
          models={advancedOptions}
          value={overrideModel}
          onSelect={setSessionModel}
          tierOrder={MODEL_TIERS}
          status={isError ? 'error' : 'ready'}
          onRetry={() => void refetch()}
          errorLabel={t('aiAssistant.loadError')}
          retryLabel={t('aiAssistant.retry')}
          triggerClassName="h-8"
          triggerVariant="ghost"
          tierLabel={(tier) => t(`aiAssistant.tier.${tier}` as never)}
          renderDescription={(m) => t((m.descriptionKey ?? '') as never)}
          triggerLabel={t('aiAssistant.advanced.trigger')}
          billedBadgeLabel={t('aiAssistant.byok.billedBadge')}
          footer={
            overrideModel ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-left text-xs font-normal"
                onClick={clearOverride}
              >
                {t('aiAssistant.advanced.clearOverride')}
              </Button>
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}
