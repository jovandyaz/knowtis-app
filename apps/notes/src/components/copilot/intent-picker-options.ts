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

/** A stored preference counts as an override only while the Advanced picker actually offers it; a legacy pick the server ignores must not deselect the chips. */
export function advancedOverride(
  preferredModel: string | null | undefined,
  options: readonly SelectableModel[]
): string | null {
  return preferredModel && options.some((m) => m.id === preferredModel)
    ? preferredModel
    : null;
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
