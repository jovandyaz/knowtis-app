import { useTranslation } from 'react-i18next';

import {
  useAISettings,
  useAvailableModels,
  useProviderKeys,
  useUpdateAISettings,
} from '@/hooks';
import { useSettingsStore } from '@/stores/settings.store';
import { useAuthUser } from '@jovandyaz/auth-react';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { Button, ModelSelect, SegmentedControl } from '@knowtis/design-system';
import {
  DEFAULT_MODEL_INTENT,
  FEATURE_FLAG_KEYS,
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
  const {
    data: models,
    isPending,
    isError,
    refetch,
  } = useAvailableModels(showPicker);
  const { data: prefs } = useAISettings(showPicker);
  const { mutate: update } = useUpdateAISettings();
  const byokEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.AGENT_BYOK);
  const openSettings = useSettingsStore((s) => s.open);
  const { data: keys, isPending: keysPending } = useProviderKeys(
    showPicker && byokEnabled
  );
  // A stored key can unlock nothing routable, so "no model billed to you" is
  // not the same question as "do you hold a key".
  const offerBridge =
    byokEnabled && !isPending && !keysPending && keys?.length === 0;

  const intent = prefs?.preferredIntent ?? DEFAULT_MODEL_INTENT;
  const override = advancedOverride(prefs?.preferredModel, models);
  const advancedOptions = advancedModelOptions(models);
  // An unresolved list keeps a stored model an override, so the chips would render with
  // nothing active. That caller's control is the dropdown — show it loading instead.
  const resolvingOverride = isPending && override !== null;

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

  if (advancedOptions.length === 0 && !isError && !resolvingOverride) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <SegmentedControl
          aria-label={t('aiAssistant.intent.label')}
          options={intentChipOptions(t)}
          value={override ? null : intent}
          onValueChange={select}
        />
        {offerBridge ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-(--muted-foreground)"
            title={t('aiAssistant.byok.bridgeHint')}
            onClick={() => openSettings('aiAssistant')}
          >
            {t('aiAssistant.byok.bridge')}
          </Button>
        ) : null}
      </div>
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
      status={isError ? 'error' : isPending ? 'loading' : 'ready'}
      onRetry={() => void refetch()}
      loadingLabel={t('aiAssistant.loading')}
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
