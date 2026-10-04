import type {
  ModelGateStatus,
  ModelIntent,
  PlatformSelectorKey,
} from '@knowtis/shared-types';

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
}

export const SELECTOR_KEY_BY_INTENT = {
  fast: 'platform.fast',
  balanced: 'platform.balanced',
  powerful: 'platform.powerful',
} as const satisfies Record<ModelIntent, PlatformSelectorKey>;

export const PENDING_GATE_STATUS = 'pending' as const satisfies ModelGateStatus;

/** The models migration 0060 seeds, and what the resolution cache serves until its first successful read: the code defaults `AI_SETTING_DEFAULTS` held before PR 3. */
export const PLATFORM_SEED_MODELS = {
  fast: 'openrouter:minimax/minimax-m2.5',
  balanced: 'openrouter:deepseek/deepseek-v3.2',
  powerful: 'openrouter:moonshotai/kimi-k2.5',
} as const satisfies Record<ModelIntent, string>;

/** One seed row per intent, with no history, release or pending entry. */
export const SEED_RESOLUTIONS: readonly ModelResolution[] = (
  Object.keys(SELECTOR_KEY_BY_INTENT) as ModelIntent[]
).map((intent) => ({
  selectorKey: SELECTOR_KEY_BY_INTENT[intent],
  activeModelId: PLATFORM_SEED_MODELS[intent],
  previousModelId: null,
  changedAt: null,
  releasedModelId: null,
  releasedAt: null,
  pendingModelId: null,
  gateStatus: null,
}));
