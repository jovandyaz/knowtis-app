import type { IndexedModel, ModelIndexCatalog } from '@knowtis/ai-gateway';
import {
  BYOK_PROVIDERS,
  MODEL_INTENTS,
  type ByokProvider,
  type ModelIntent,
} from '@knowtis/shared-types';

import { resolveByokIntent, resolvePlatformIntent } from './model-selectors';
import { SELECTOR_KEY_BY_INTENT } from './platform-resolution';

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

function servesResolution(
  catalog: ModelIndexCatalog,
  resolution: IndexedModel | null
): boolean {
  return resolution !== null && isServed(catalog, resolution.id);
}

function platformRoutesIntent(
  catalog: ModelIndexCatalog,
  intent: ModelIntent,
  now: Date
): boolean {
  return servesResolution(
    catalog,
    resolvePlatformIntent(intent, catalog.all(), now)
  );
}

function byokRoutesIntent(
  catalog: ModelIndexCatalog,
  intent: ModelIntent,
  provider: ByokProvider,
  now: Date
): boolean {
  return servesResolution(
    catalog,
    resolveByokIntent(intent, provider, catalog.all(), now)
  );
}

/**
 * What this catalog leaves unserved: the selector key of each platform intent whose
 * selector resolves to no row it serves (supported, priced above zero both ways, with
 * an input window), then the `byokFloorKey` of each intent and provider whose BYOK
 * route does not. Empty means every intent keeps a priced platform model to resolve
 * to, and a holder of any one provider key keeps a route for every intent.
 */
export function unservedFloorModels(
  catalog: ModelIndexCatalog,
  now: Date = new Date()
): string[] {
  return [
    ...MODEL_INTENTS.filter(
      (intent) => !platformRoutesIntent(catalog, intent, now)
    ).map((intent) => SELECTOR_KEY_BY_INTENT[intent]),
    ...BYOK_FLOOR_ROUTES.filter(
      ({ intent, provider }) =>
        !byokRoutesIntent(catalog, intent, provider, now)
    ).map(({ intent, provider }) => byokFloorKey(intent, provider)),
  ];
}

/** Platform selector keys and BYOK route keys `current` serves that `next` would not, whether `next` degrades or drops them. */
export function floorModelsLost(
  current: ModelIndexCatalog,
  next: ModelIndexCatalog,
  now: Date = new Date()
): string[] {
  const unservedNow = new Set(unservedFloorModels(current, now));
  return unservedFloorModels(next, now).filter((key) => !unservedNow.has(key));
}
