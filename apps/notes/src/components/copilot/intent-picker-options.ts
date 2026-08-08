import type { TFunction } from 'i18next';

import {
  MODEL_INTENTS,
  type ModelIntent,
  type SelectableModel,
} from '@knowtis/shared-types';

/** Models the caller can run on their own key — the Advanced picker's option set. */
export function advancedModelOptions(
  models: readonly SelectableModel[] | undefined
): SelectableModel[] {
  return (models ?? []).filter((m) => m.access === 'granted' && m.billedToUser);
}

export function intentChipOptions(t: TFunction<'common'>): Array<{
  value: ModelIntent;
  label: string;
  title: string;
}> {
  return MODEL_INTENTS.map((value) => ({
    value,
    label: t(`aiAssistant.intent.${value}` as never),
    title: t(`aiAssistant.intent.${value}Hint` as never),
  }));
}
