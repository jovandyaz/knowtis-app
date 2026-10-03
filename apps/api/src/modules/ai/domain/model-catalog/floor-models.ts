import type { ModelCatalog } from '@knowtis/ai-gateway';
import { parseChain } from '@knowtis/shared-types';

import { AI_SETTING_DEFAULTS } from '../ai-settings';
import { CURATED_MODELS } from './selectable-models.catalog';

/** Models the platform serves on its own keys, once each: every curated model, the default, fast and deep model settings, and the default fallback chain. */
export const FLOOR_MODEL_IDS: readonly string[] = [
  ...new Set([
    ...CURATED_MODELS.map((model) => model.id),
    AI_SETTING_DEFAULTS.ai_default_model,
    AI_SETTING_DEFAULTS.ai_fast_model,
    AI_SETTING_DEFAULTS.ai_deep_model,
    ...parseChain(AI_SETTING_DEFAULTS.ai_fallback_chain),
  ]),
];

function isServed(catalog: ModelCatalog, modelId: string): boolean {
  const pricing = catalog.getPricing(modelId);
  return (
    catalog.isSupported(modelId) &&
    (pricing?.inputCostPerToken ?? 0) > 0 &&
    (pricing?.outputCostPerToken ?? 0) > 0 &&
    (catalog.getContextWindow(modelId)?.maxInputTokens ?? 0) > 0
  );
}

/**
 * Floor models this catalog does not support, price above zero on both input
 * and output, or give an input window. Empty means the platform's own spend is
 * never recorded as `costUsd=0`.
 */
export function unservedFloorModels(catalog: ModelCatalog): string[] {
  return FLOOR_MODEL_IDS.filter((id) => !isServed(catalog, id));
}

/** Floor models `current` serves that `next` would not, whether `next` degrades or drops them. */
export function floorModelsLost(
  current: ModelCatalog,
  next: ModelCatalog
): string[] {
  return FLOOR_MODEL_IDS.filter(
    (id) => isServed(current, id) && !isServed(next, id)
  );
}
