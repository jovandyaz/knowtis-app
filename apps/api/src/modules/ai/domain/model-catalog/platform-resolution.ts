import {
  INTENT_FALLBACK_ORDER,
  MODEL_INTENTS,
  type ModelGateStatus,
  type ModelIntent,
  type PlatformSelectorKey,
} from '@knowtis/shared-types';

import { MS_PER_DAY } from '../value-objects/utc-day';

/** One platform intent's resolution state. */
export interface ModelResolution {
  readonly selectorKey: PlatformSelectorKey;
  readonly activeModelId: string;
  /** The active model before the last activation: the rollback pointer. */
  readonly previousModelId: string | null;
  readonly changedAt: Date | null;
  /** The model an admin pin change last stopped serving, and when. */
  readonly releasedModelId: string | null;
  readonly releasedAt: Date | null;
  readonly pendingModelId: string | null;
  readonly gateStatus: ModelGateStatus | null;
  readonly gateDetail: string | null;
  readonly gateRunUrl: string | null;
}

export const SELECTOR_KEY_BY_INTENT = {
  fast: 'platform.fast',
  balanced: 'platform.balanced',
  powerful: 'platform.powerful',
} as const satisfies Record<ModelIntent, PlatformSelectorKey>;

export const PENDING_GATE_STATUS = 'pending' as const satisfies ModelGateStatus;

/** The models migration 0060 seeds, and what the resolution cache serves until its first successful read. Each is what a dead prod pin of its intent fell back to before resolutions were stored, so a dead pin keeps its fallback. */
export const PLATFORM_SEED_MODELS = {
  fast: 'openrouter:minimax/minimax-m2.5',
  balanced: 'openrouter:deepseek/deepseek-v3.2',
  powerful: 'openrouter:moonshotai/kimi-k2.5',
} as const satisfies Record<ModelIntent, string>;

/** One seed row per intent, with no history, release or pending entry. */
export const SEED_RESOLUTIONS: readonly ModelResolution[] = MODEL_INTENTS.map(
  (intent) => ({
    selectorKey: SELECTOR_KEY_BY_INTENT[intent],
    activeModelId: PLATFORM_SEED_MODELS[intent],
    previousModelId: null,
    changedAt: null,
    releasedModelId: null,
    releasedAt: null,
    pendingModelId: null,
    gateStatus: null,
    gateDetail: null,
    gateRunUrl: null,
  })
);

const INTENT_BY_SELECTOR_KEY = {
  'platform.fast': 'fast',
  'platform.balanced': 'balanced',
  'platform.powerful': 'powerful',
} as const satisfies Record<PlatformSelectorKey, ModelIntent>;

/** What an intent serves with neither a supported pin nor an active resolution: no model, so the intent is unavailable. */
export const NO_SERVED_MODEL = '';

/** Days a model that stopped being served stays billed to the platform. */
export const RESOLUTION_GRACE_DAYS = 7;

export function intentOfSelectorKey(key: PlatformSelectorKey): ModelIntent {
  return INTENT_BY_SELECTOR_KEY[key];
}

export function activeModelOf(
  rows: readonly ModelResolution[],
  intent: ModelIntent
): string | null {
  const key = SELECTOR_KEY_BY_INTENT[intent];
  return rows.find((row) => row.selectorKey === key)?.activeModelId ?? null;
}

/** The active model of each intent in `MODEL_INTENTS` order; an intent with no row is skipped. */
export function activeModelIdsOf(rows: readonly ModelResolution[]): string[] {
  return MODEL_INTENTS.flatMap((intent) => {
    const modelId = activeModelOf(rows, intent);
    return modelId === null ? [] : [modelId];
  });
}

function withinGrace(at: Date | null, now: Date): boolean {
  return (
    at !== null &&
    now.getTime() - at.getTime() <= RESOLUTION_GRACE_DAYS * MS_PER_DAY
  );
}

/** Every active model, plus each previous or released model that left within `RESOLUTION_GRACE_DAYS` of `now` (inclusive). */
export function platformBilledModelIds(
  rows: readonly ModelResolution[],
  now: Date
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.activeModelId);
    if (row.previousModelId && withinGrace(row.changedAt, now)) {
      ids.add(row.previousModelId);
    }
    if (row.releasedModelId && withinGrace(row.releasedAt, now)) {
      ids.add(row.releasedModelId);
    }
  }
  return ids;
}

/** The served intents in `INTENT_FALLBACK_ORDER`, once each, without empty ones. */
export function derivedChain(
  intents: Readonly<Record<ModelIntent, string>>
): string[] {
  return [
    ...new Set(INTENT_FALLBACK_ORDER.map((intent) => intents[intent])),
  ].filter((modelId) => modelId !== NO_SERVED_MODEL);
}

export type ResolutionChange =
  | {
      readonly kind: 'pend';
      readonly selectorKey: PlatformSelectorKey;
      readonly modelId: string;
    }
  | {
      readonly kind: 'clear';
      readonly selectorKey: PlatformSelectorKey;
      readonly pendingModelId: string;
    };

/**
 * What a sync's selector candidate changes. No candidate: nothing. The active model:
 * clear a `pending` entry, but keep a `failed` one so a returning failed id is not
 * re-queued. Already the pending model (pending or failed): nothing. Anything else
 * becomes pending.
 */
export function resolutionChange(
  row: ModelResolution,
  candidateId: string | null
): ResolutionChange | null {
  if (candidateId === null) {
    return null;
  }
  if (candidateId === row.activeModelId) {
    return row.pendingModelId !== null && row.gateStatus === PENDING_GATE_STATUS
      ? {
          kind: 'clear',
          selectorKey: row.selectorKey,
          pendingModelId: row.pendingModelId,
        }
      : null;
  }
  if (candidateId === row.pendingModelId) {
    return null;
  }
  return { kind: 'pend', selectorKey: row.selectorKey, modelId: candidateId };
}
