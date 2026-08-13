import { useTranslation } from 'react-i18next';

import {
  useAISettings,
  useAvailableModels,
  useUpdateAISettings,
} from '@/hooks';
import { useAuthUser } from '@jovandyaz/auth-react';

import { ModelSelect, SegmentedControl } from '@knowtis/design-system';
import {
  DEFAULT_MODEL_INTENT,
  isModelIntent,
  MODEL_TIERS,
} from '@knowtis/shared-types';

import {
  advancedModelOptions,
  advancedOverride,
  intentChipOptions,
  intentSection,
} from './intent-picker-options';

export function CopilotModelPicker() {
  const { t } = useTranslation('common');
  const user = useAuthUser();
  // Anonymous users cannot persist preferences, so they run on the server default intent and get no picker.
  const showPicker = user != null && !user.isAnonymous;
  const { data: models, isError, refetch } = useAvailableModels(showPicker);
  const { data: prefs } = useAISettings(showPicker);
  const { mutate: update } = useUpdateAISettings();

  const intent = prefs?.preferredIntent ?? DEFAULT_MODEL_INTENT;
  const override = advancedOverride(prefs?.preferredModel, models);
  const advancedOptions = advancedModelOptions(models);

  const select = (id: string) => {
    const isOfferedModel = advancedOptions.some((m) => m.id === id);
    if (isOfferedModel || !isModelIntent(id)) {
      update({ preferredModel: id });
      return;
    }
    update({ preferredModel: null, preferredIntent: id });
  };

  if (!showPicker) {
    return null;
  }

  if (advancedOptions.length === 0 && !isError) {
    return (
      <SegmentedControl
        aria-label={t('aiAssistant.intent.label')}
        options={intentChipOptions(t)}
        value={override ? null : intent}
        onValueChange={select}
      />
    );
  }

  return (
    <ModelSelect
      aria-label={t('aiAssistant.intent.label')}
      models={advancedOptions}
      value={override ?? intent}
      onSelect={select}
      leadingSection={intentSection(t)}
      tierOrder={MODEL_TIERS}
      status={isError ? 'error' : 'ready'}
      onRetry={() => void refetch()}
      errorLabel={t('aiAssistant.loadError')}
      retryLabel={t('aiAssistant.retry')}
      triggerClassName="h-8"
      triggerLabel={t(`aiAssistant.intent.${intent}` as never)}
      modelsLabel={t('aiAssistant.modelsGroup')}
      renderDescription={(m) =>
        m.descriptionKey ? t(m.descriptionKey as never) : (m.description ?? '')
      }
      billedBadgeLabel={t('aiAssistant.byok.billedBadge')}
    />
  );
}
