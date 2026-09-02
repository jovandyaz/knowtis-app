import { useTranslation } from 'react-i18next';

import { ModelSelect, SegmentedControl } from '@knowtis/design-system';
import {
  MODEL_TIERS,
  isModelIntent,
  type ModelIntent,
  type SelectableModel,
} from '@knowtis/shared-types';

import { advancedModelOptions, primaryRows } from './intent-picker-options';

export interface IntentModelPickerProps {
  models: readonly SelectableModel[] | undefined;
  isError: boolean;
  onRetry: () => void;
  intent: ModelIntent;
  overrideModel: string | null;
  onSelectIntent: (value: ModelIntent) => void;
  onSelectModel: (id: string) => void;
}

/**
 * Settings' full picker: the intent chips next to the model dropdown, both
 * always usable. A stored model deselects every chip because it outranks the
 * intent; picking a chip is what clears it.
 */
export function IntentModelPicker({
  models,
  isError,
  onRetry,
  intent,
  overrideModel,
  onSelectIntent,
  onSelectModel,
}: IntentModelPickerProps) {
  const { t } = useTranslation('common');
  const advancedOptions = advancedModelOptions(models);
  // primaryRows types ids as opaque strings; the guard restores ModelIntent.
  const chipOptions = primaryRows(models, t).flatMap((r) =>
    isModelIntent(r.id)
      ? [{ value: r.id, label: r.label, title: r.description }]
      : []
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <SegmentedControl
        aria-label={t('aiAssistant.intent.label')}
        options={chipOptions}
        value={overrideModel ? null : intent}
        onValueChange={onSelectIntent}
      />
      {advancedOptions.length > 0 || isError ? (
        <ModelSelect
          models={advancedOptions}
          value={overrideModel}
          onSelect={onSelectModel}
          tierOrder={MODEL_TIERS}
          status={isError ? 'error' : 'ready'}
          onRetry={onRetry}
          errorLabel={t('aiAssistant.loadError')}
          retryLabel={t('aiAssistant.retry')}
          modelsLabel={t('aiAssistant.modelsGroup')}
          renderDescription={(m) =>
            m.descriptionKey
              ? t(m.descriptionKey as never)
              : (m.description ?? '')
          }
          triggerLabel={t('aiAssistant.advanced.trigger')}
          billedBadgeLabel={t('aiAssistant.byok.billedBadge')}
        />
      ) : null}
    </div>
  );
}
