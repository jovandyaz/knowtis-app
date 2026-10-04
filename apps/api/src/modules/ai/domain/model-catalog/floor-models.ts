import type { ModelIndexCatalog } from '@knowtis/ai-gateway';
import {
  BYOK_PROVIDERS,
  MODEL_INTENTS,
  parseChain,
  type ByokProvider,
  type ModelIntent,
} from '@knowtis/shared-types';

import { AI_SETTING_DEFAULTS } from '../ai-settings';
import { resolveByokIntent } from './model-selectors';

/** The platform's code-owned models: the default, fast and deep settings and the default fallback chain, once each. */
export const PLATFORM_FLOOR_MODEL_IDS: readonly string[] = [
  ...new Set([
    AI_SETTING_DEFAULTS.ai_default_model,
    AI_SETTING_DEFAULTS.ai_fast_model,
    AI_SETTING_DEFAULTS.ai_deep_model,
    ...parseChain(AI_SETTING_DEFAULTS.ai_fallback_chain),
  ]),
];

/** `byok.<intent>@<provider>`: a caller holding only this provider's key has a served route for this intent. */
export function byokFloorKey(
  intent: ModelIntent,
  provider: ByokProvider
): string {
  return `byok.${intent}@${provider}`;
}

const BYOK_FLOOR_ROUTES = BYOK_PROVIDERS.flatMap((provider) =>
  MODEL_INTENTS.map((intent) => ({ intent, provider }))
);

function isServed(catalog: ModelIndexCatalog, modelId: string): boolean {
  const pricing = catalog.getPricing(modelId);
  return (
    catalog.isSupported(modelId) &&
    (pricing?.inputCostPerToken ?? 0) > 0 &&
    (pricing?.outputCostPerToken ?? 0) > 0 &&
    (catalog.getContextWindow(modelId)?.maxInputTokens ?? 0) > 0
  );
}

function routesIntent(
  catalog: ModelIndexCatalog,
  intent: ModelIntent,
  provider: ByokProvider,
  now: Date
): boolean {
  const route = resolveByokIntent(intent, provider, catalog.all(), now);
  return route !== null && isServed(catalog, route.id);
}

/**
 * What this catalog leaves unserved, platform models first: each platform floor
 * model it does not support, price above zero on both input and output, or give
 * an input window, then the `byokFloorKey` of each intent and provider whose
 * BYOK route at `now` resolves to no row it serves that way. Empty means the
 * platform's own spend is never recorded as `costUsd=0` and a holder of any one
 * provider key keeps a route for every intent.
 */
export function unservedFloorModels(
  catalog: ModelIndexCatalog,
  now: Date = new Date()
): string[] {
  return [
    ...PLATFORM_FLOOR_MODEL_IDS.filter((id) => !isServed(catalog, id)),
    ...BYOK_FLOOR_ROUTES.filter(
      ({ intent, provider }) => !routesIntent(catalog, intent, provider, now)
    ).map(({ intent, provider }) => byokFloorKey(intent, provider)),
  ];
}

/** Floor models and BYOK route keys `current` serves that `next` would not, whether `next` degrades or drops them. */
export function floorModelsLost(
  current: ModelIndexCatalog,
  next: ModelIndexCatalog,
  now: Date = new Date()
): string[] {
  const unservedNow = new Set(unservedFloorModels(current, now));
  return unservedFloorModels(next, now).filter((key) => !unservedNow.has(key));
}
