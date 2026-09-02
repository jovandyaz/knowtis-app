import type { TFunction } from 'i18next';

import type {
  ModelMenuEffort,
  ModelMenuModelRow,
  ModelMenuMoreModels,
  ModelMenuPrimaryRow,
} from '@knowtis/design-system';
import {
  MODEL_INTENTS,
  REASONING_EFFORTS,
  type ReasoningEffort,
  type SelectableModel,
} from '@knowtis/shared-types';

const EFFORT_LABEL_KEYS = {
  low: 'aiAssistant.menu.effortLow',
  medium: 'aiAssistant.menu.effortMedium',
  high: 'aiAssistant.menu.effortHigh',
  xhigh: 'aiAssistant.menu.effortXhigh',
  max: 'aiAssistant.menu.effortMax',
} as const satisfies Record<ReasoningEffort, string>;

function modelDescription(
  model: SelectableModel,
  t: TFunction<'common'>
): string | undefined {
  return model.descriptionKey
    ? t(model.descriptionKey as never)
    : model.description;
}

/** Models the caller can run on their own key — the Advanced picker's option set. */
export function advancedModelOptions(
  models: readonly SelectableModel[] | undefined
): SelectableModel[] {
  return (models ?? []).filter((m) => m.access === 'granted' && m.billedToUser);
}

/**
 * Returns the stored preference only while the Advanced picker offers it, else null.
 * An unresolved list keeps it an override, so the chips never claim an intent the server may not serve.
 */
export function advancedOverride(
  preferredModel: string | null | undefined,
  models: readonly SelectableModel[] | undefined
): string | null {
  if (!preferredModel) {
    return null;
  }
  if (!models) {
    return preferredModel;
  }
  return advancedModelOptions(models).some((m) => m.id === preferredModel)
    ? preferredModel
    : null;
}

/**
 * One row per served intent, in MODEL_INTENTS order, named after the model that
 * serves it. The job line is the intent's hint, not the model's copy: the row
 * stands for the job, and the backoffice may repoint it at another model.
 */
export function primaryRows(
  models: readonly SelectableModel[] | undefined,
  t: TFunction<'common'>
): ModelMenuPrimaryRow[] {
  const list = models ?? [];
  return MODEL_INTENTS.flatMap((intent) => {
    const model = list.find((m) => m.servesIntent === intent);
    if (!model) {
      return [];
    }
    return [
      {
        id: intent,
        label: model.label,
        description: t(`aiAssistant.intent.${intent}Hint` as never),
        locked: model.access === 'requires_account',
      },
    ];
  });
}

/** The "more models" catalogue: the open pool first, then the caller's BYOK models. */
export function moreModelGroups(
  models: readonly SelectableModel[] | undefined,
  t: TFunction<'common'>
): ModelMenuMoreModels['groups'] {
  const list = (models ?? []).filter((m) => !m.servesIntent);
  const toRow = (model: SelectableModel): ModelMenuModelRow => {
    const description = modelDescription(model, t);
    return {
      id: model.id,
      label: model.label,
      cost: '$'.repeat(model.costClass),
      ...(description !== undefined && { description }),
      ...(model.billedToUser && {
        billedBadge: t('aiAssistant.byok.billedBadge'),
      }),
    };
  };
  const open = list
    .filter((m) => m.access === 'granted' && !m.billedToUser)
    .map(toRow);
  const byok = list.filter((m) => m.billedToUser).map(toRow);
  const groups: Array<{ label: string; options: ModelMenuModelRow[] }> = [];
  if (open.length > 0) {
    groups.push({ label: t('aiAssistant.menu.groupOpen'), options: open });
  }
  if (byok.length > 0) {
    groups.push({ label: t('aiAssistant.menu.groupByok'), options: byok });
  }
  return groups;
}

/**
 * Auto plus the model's own levels; empty (no submenu) for non-reasoning models.
 * Upstream lists levels in no fixed order, so the ladder follows REASONING_EFFORTS.
 */
export function effortOptions(
  model: SelectableModel | undefined,
  t: TFunction<'common'>
): ModelMenuEffort['options'] {
  const levels = model?.reasoning?.levels;
  if (!levels || levels.length === 0) {
    return [];
  }
  const declared = new Set(levels);
  return [
    {
      id: 'auto',
      label: t('aiAssistant.menu.effortAuto'),
      description: t('aiAssistant.menu.effortAutoHint'),
    },
    ...REASONING_EFFORTS.filter((level) => declared.has(level)).map(
      (level) => ({
        id: level,
        label: t(EFFORT_LABEL_KEYS[level] as never),
      })
    ),
  ];
}
