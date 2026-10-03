import type { AccessTier, ModelIntent, SelectableModel } from './ai.types';

/** Whether an intent can serve the caller; `substituted` means the model runs on a provider other than the caller's primary one. */
export type IntentAvailability =
  | {
      intent: ModelIntent;
      available: true;
      modelId: string;
      substituted: boolean;
    }
  | { intent: ModelIntent; available: false; reason: 'no_route' };

/** `GET /ai/models` body: only the models the caller's tier may run. */
export interface ModelCatalogResponse {
  tier: AccessTier;
  models: SelectableModel[];
  intents: IntentAvailability[];
}

export const MODEL_FALLBACK_REASONS = [
  'model_retired',
  'key_removed',
  'not_in_tier',
  'intent_unavailable',
] as const;
export type ModelFallbackReason = (typeof MODEL_FALLBACK_REASONS)[number];

const FALLBACK_REASONS: readonly string[] = MODEL_FALLBACK_REASONS;

/** Narrows a fallback reason read off the wire: a newer server may send one this build does not know. */
export function isModelFallbackReason(
  value: string | null | undefined
): value is ModelFallbackReason {
  return typeof value === 'string' && FALLBACK_REASONS.includes(value);
}

export const MODEL_UNAVAILABLE_REASONS = [
  ...MODEL_FALLBACK_REASONS,
  'no_route',
] as const;
export type ModelUnavailableReason = (typeof MODEL_UNAVAILABLE_REASONS)[number];

/** Which model a turn asked for and which one served it; `fallback` is set only when the server substituted it, and `from` is the model asked for, or the intent when `reason` is `intent_unavailable`. */
export interface ModelResolution {
  requested: string | null;
  resolved: string;
  fallback?: { reason: ModelFallbackReason; from: string; to: string };
}

export const AI_MODEL_UNAVAILABLE_CODE = 'AI_MODEL_UNAVAILABLE';

/** `agent:error` body for a turn whose model is outside the caller's tier and has no same-billing substitute. */
export interface ModelUnavailableError {
  code: typeof AI_MODEL_UNAVAILABLE_CODE;
  message: string;
  reason: ModelUnavailableReason;
  suggestedModel: string | null;
  turnId?: string;
}
