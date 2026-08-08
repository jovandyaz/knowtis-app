import { useTranslation } from 'react-i18next';

import {
  useAISettings,
  useAvailableModels,
  useUpdateAISettings,
} from '@/hooks';
import { useAgentStore } from '@/stores/agent.store';

import { Button, ModelSelect, SegmentedControl } from '@knowtis/design-system';
import {
  DEFAULT_MODEL_INTENT,
  MODEL_TIERS,
  type ModelIntent,
} from '@knowtis/shared-types';

import {
  advancedModelOptions,
  intentChipOptions,
} from './intent-picker-options';

export function IntentModelPicker() {
  const { t } = useTranslation('common');
  const { data: models } = useAvailableModels();
  const { data: prefs } = useAISettings();
  const { mutate: update } = useUpdateAISettings();
  const sessionModel = useAgentStore((s) => s.selectedModel);
  const setSessionModel = useAgentStore((s) => s.setSelectedModel);

  const overrideModel = sessionModel ?? prefs?.preferredModel ?? null;
  const intent = prefs?.preferredIntent ?? DEFAULT_MODEL_INTENT;

  const advancedOptions = advancedModelOptions(models);
  const intentOptions = intentChipOptions(t);

  const selectIntent = (value: ModelIntent) => {
    setSessionModel(null);
    update({ preferredModel: null, preferredIntent: value });
  };

  const clearOverride = () => {
    setSessionModel(null);
    update({ preferredModel: null });
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <SegmentedControl
        aria-label={t('aiAssistant.intent.label')}
        options={intentOptions}
        value={overrideModel ? null : intent}
        onValueChange={selectIntent}
      />
      {advancedOptions.length > 0 ? (
        <ModelSelect
          models={advancedOptions}
          value={overrideModel}
          onSelect={setSessionModel}
          tierOrder={MODEL_TIERS}
          status="ready"
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
