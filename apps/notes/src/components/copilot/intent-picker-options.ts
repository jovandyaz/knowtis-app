import { providerOfModel } from '@/lib/ai/byok-providers';
import { PROVIDER_LABEL } from '@/lib/ai/provider-labels';
import type { TFunction } from 'i18next';

import type {
  ModelMenuEffort,
  ModelMenuModelRow,
  ModelMenuMoreModels,
  ModelMenuPrimaryRow,
} from '@knowtis/design-system';
import {
  BYOK_PROVIDERS,
  DEFAULT_MODEL_INTENT,
  MODEL_INTENTS,
  REASONING_EFFORTS,
  type ModelIntent,
  type ReasoningEffort,
  type SelectableModel,
} from '@knowtis/shared-types';

export interface ModelPreference {
  preferredModel?: string | null;
  preferredIntent?: ModelIntent | null;
}

/**
 * The model a turn resolves to: the stored override while the list still
 * offers it — an Advanced pick may also serve an intent — else the model
 * serving the preferred intent. A stale override falls back rather than
 * resolving to nothing, so every surface agrees.
 */
export function resolveSelectedModel(
  models: readonly SelectableModel[] | undefined,
  prefs: ModelPreference | undefined
): SelectableModel | undefined {
  const list = models ?? [];
  const preferred = prefs?.preferredModel ?? null;
  const override =
    preferred === null ? undefined : list.find((m) => m.id === preferred);
  if (override) {
    return override;
  }
  const intent = prefs?.preferredIntent ?? DEFAULT_MODEL_INTENT;
  return list.find((m) => m.servesIntent === intent);
}

const EFFORT_LABEL_KEYS = {
  low: 'aiAssistant.menu.effortLow',
  medium: 'aiAssistant.menu.effortMedium',
  high: 'aiAssistant.menu.effortHigh',
  xhigh: 'aiAssistant.menu.effortXhigh',
  max: 'aiAssistant.menu.effortMax',
} as const satisfies Record<ReasoningEffort, string>;

interface ModelCopy {
  readonly descriptionKey?: string;
  readonly description?: string;
}

function modelDescription(
  model: ModelCopy,
  t: TFunction<'common'>
): string | undefined {
  return model.descriptionKey
    ? t(model.descriptionKey as never)
    : model.description;
}

/** The settings Avanzado detail line: the provider whose key serves the model first, so one model on two keys reads as two routes. */
export function advancedOptionDescription(
  model: ModelCopy & { readonly id: string },
  t: TFunction<'common'>
): string {
  const detail = modelDescription(model, t) ?? '';
  const provider = providerOfModel(model.id);
  if (provider === null) {
    return detail;
  }
  const name = PROVIDER_LABEL[provider];
  return detail
    ? t('aiAssistant.advanced.routeDetail', { provider: name, detail })
    : name;
}

/** Models the caller can run on their own key — the Advanced picker's option set. */
export function advancedModelOptions(
  models: readonly SelectableModel[] | undefined
): SelectableModel[] {
  return (models ?? []).filter((m) => m.billedToUser);
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
 * One row per served intent, in MODEL_INTENTS order, named after the intent:
 * the backoffice may repoint an intent at another model, so the row stands for
 * the job and its detail line names the model serving it today.
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
        label: t(`aiAssistant.intent.${intent}` as never),
        description: t('aiAssistant.intent.rowDetail', {
          model: model.label,
          hint: t(`aiAssistant.intent.${intent}Hint` as never),
        }),
      },
    ];
  });
}

/** Avanzado: the caller's own-key models no intent row offers, one group per provider, so a model two of their keys serve shows once under each route. */
export function advancedGroups(
  models: readonly SelectableModel[] | undefined,
  t: TFunction<'common'>
): ModelMenuMoreModels['groups'] {
  const listed = (models ?? []).filter(
    (m) => m.billedToUser && !m.servesIntent
  );
  return BYOK_PROVIDERS.flatMap((provider) => {
    const options = listed
      .filter((m) => providerOfModel(m.id) === provider)
      .map((m) => advancedRow(m, t));
    return options.length > 0
      ? [{ label: PROVIDER_LABEL[provider], options }]
      : [];
  });
}

function advancedRow(
  model: SelectableModel,
  t: TFunction<'common'>
): ModelMenuModelRow {
  const description = modelDescription(model, t);
  return {
    id: model.id,
    label: model.label,
    cost: '$'.repeat(model.costClass),
    ...(description !== undefined && { description }),
    billedBadge: t('aiAssistant.byok.billedBadge'),
  };
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
