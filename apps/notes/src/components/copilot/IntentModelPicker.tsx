import { useTranslation } from 'react-i18next';

import { Button, ModelSelect, SegmentedControl } from '@knowtis/design-system';
import {
  MODEL_TIERS,
  type ModelIntent,
  type SelectableModel,
} from '@knowtis/shared-types';

import {
  advancedModelOptions,
  intentChipOptions,
} from './intent-picker-options';

export interface IntentModelPickerProps {
  models: readonly SelectableModel[] | undefined;
  isError: boolean;
  onRetry: () => void;
  intent: ModelIntent;
  overrideModel: string | null;
  onSelectIntent: (value: ModelIntent) => void;
  onSelectModel: (id: string) => void;
  onClearOverride: () => void;
  triggerClassName?: string;
}

/**
 * Intent chips plus the Advanced override dropdown, driven entirely by props.
 * An override deselects every chip, since the chosen model outranks the intent.
 */
export function IntentModelPicker({
  models,
  isError,
  onRetry,
  intent,
  overrideModel,
  onSelectIntent,
  onSelectModel,
  onClearOverride,
  triggerClassName = '',
}: IntentModelPickerProps) {
  const { t } = useTranslation('common');
  const advancedOptions = advancedModelOptions(models);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <SegmentedControl
        aria-label={t('aiAssistant.intent.label')}
        options={intentChipOptions(t)}
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
          triggerClassName={triggerClassName}
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
                onClick={onClearOverride}
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
