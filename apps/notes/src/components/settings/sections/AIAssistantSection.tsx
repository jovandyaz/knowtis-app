import { useTranslation } from 'react-i18next';

import {
  useAISettings,
  useAvailableModels,
  useUpdateAISettings,
} from '@/hooks';
import { useSettingsStore } from '@/stores/settings.store';

import { useFeatureFlag } from '@knowtis/data-access-feature-flags';
import { Button, ModelSelect, SegmentedControl } from '@knowtis/design-system';
import {
  DEFAULT_MODEL_INTENT,
  FEATURE_FLAG_KEYS,
  MODEL_TIERS,
  type ModelIntent,
} from '@knowtis/shared-types';

import {
  advancedModelOptions,
  advancedOverride,
  intentChipOptions,
} from '../../copilot/intent-picker-options';
import { SectionHeader } from '../SectionHeader';
import { AIKeysManager } from './AIKeysManager';

export function AIAssistantSection() {
  const { t } = useTranslation('common');
  const { data: models, isPending, isError, refetch } = useAvailableModels();
  const { data: prefs } = useAISettings();
  const { mutate: update } = useUpdateAISettings();
  const byokEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.AGENT_BYOK);
  const intentUxOn = useFeatureFlag(FEATURE_FLAG_KEYS.AI_INTENT_UX);
  const openSettings = useSettingsStore((s) => s.open);

  const status = isError ? 'error' : isPending ? 'loading' : 'ready';

  const options = (models ?? []).map((m) => ({
    ...m,
    locked: m.access === 'requires_byok',
  }));
  // Advertise unlocking only when the keys manager below actually renders.
  const showUnlockCta = options.some((m) => m.locked) && byokEnabled;

  const advancedOptions = advancedModelOptions(models);
  const accountOverride = advancedOverride(
    prefs?.preferredModel,
    advancedOptions
  );
  const intentOptions = intentChipOptions(t);

  const selectIntent = (value: ModelIntent) => {
    update({ preferredModel: null, preferredIntent: value });
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeader
          title={t(
            intentUxOn ? 'aiAssistant.intentTitle' : 'aiAssistant.copilotTitle'
          )}
          description={t(
            intentUxOn
              ? 'aiAssistant.intentDescription'
              : 'aiAssistant.copilotDescription'
          )}
        />
        {intentUxOn ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SegmentedControl
              aria-label={t('aiAssistant.intent.label')}
              options={intentOptions}
              value={
                accountOverride
                  ? null
                  : (prefs?.preferredIntent ?? DEFAULT_MODEL_INTENT)
              }
              onValueChange={selectIntent}
            />
            {advancedOptions.length > 0 || isError ? (
              <ModelSelect
                models={advancedOptions}
                value={accountOverride}
                onSelect={(id) => update({ preferredModel: id })}
                tierOrder={MODEL_TIERS}
                status={isError ? 'error' : 'ready'}
                onRetry={() => refetch()}
                errorLabel={t('aiAssistant.loadError')}
                retryLabel={t('aiAssistant.retry')}
                tierLabel={(tier) => t(`aiAssistant.tier.${tier}` as never)}
                renderDescription={(m) => t((m.descriptionKey ?? '') as never)}
                triggerLabel={t('aiAssistant.advanced.trigger')}
                billedBadgeLabel={t('aiAssistant.byok.billedBadge')}
                footer={
                  accountOverride ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-left text-xs font-normal"
                      onClick={() => update({ preferredModel: null })}
                    >
                      {t('aiAssistant.advanced.clearOverride')}
                    </Button>
                  ) : undefined
                }
              />
            ) : null}
          </div>
        ) : (
          <ModelSelect
            models={options}
            value={prefs?.preferredModel ?? null}
            onSelect={(id) => update({ preferredModel: id })}
            tierOrder={MODEL_TIERS}
            status={status}
            onRetry={() => refetch()}
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
              ) : undefined
            }
          />
        )}
      </section>

      <section className="space-y-1 opacity-60">
        <SectionHeader
          title={t('aiAssistant.editorTitle')}
          description={t('aiAssistant.editorComingSoon')}
        />
      </section>

      {byokEnabled ? <AIKeysManager /> : null}
    </div>
  );
}
