import { providerOf, type IndexedModel } from '@knowtis/ai-gateway';
import type { AIProvider } from '@knowtis/shared-types';

import { PLATFORM_FLOOR_MODEL_IDS } from './floor-models';
import { resolveByokIntent } from './model-selectors';

/** The model that validates a user's own key: the provider's fast BYOK route, or null when none resolves. */
export function byokProbeModelId(
  provider: AIProvider,
  rows: readonly IndexedModel[],
  now: Date = new Date()
): string | null {
  return resolveByokIntent('fast', provider, rows, now)?.id ?? null;
}

/** The model that validates the platform's key: the provider's own floor model, else its fast BYOK route. */
export function systemProbeModelId(
  provider: AIProvider,
  rows: readonly IndexedModel[],
  now: Date = new Date()
): string | null {
  return (
    PLATFORM_FLOOR_MODEL_IDS.find((id) => providerOf(id) === provider) ??
    byokProbeModelId(provider, rows, now)
  );
}
