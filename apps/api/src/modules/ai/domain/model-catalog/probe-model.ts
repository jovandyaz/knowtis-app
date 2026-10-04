import { providerOf, type IndexedModel } from '@knowtis/ai-gateway';
import type { AIProvider } from '@knowtis/shared-types';

import {
  PlatformResolutionsUnreadError,
  type PlatformModelsSource,
} from '../ports/platform-models.port';
import { resolveByokIntent } from './model-selectors';

/** The model that validates a user's own key: the provider's fast BYOK route, or null when none resolves. */
export function byokProbeModelId(
  provider: AIProvider,
  rows: readonly IndexedModel[],
  now: Date = new Date()
): string | null {
  return resolveByokIntent('fast', provider, rows, now)?.id ?? null;
}

/** The platform models a probe may use: none while the resolutions are only the seed floor, so the probe falls to the BYOK route. */
export async function probablePlatformModelIds(
  source: PlatformModelsSource
): Promise<readonly string[]> {
  try {
    return await source.getPlatformModelIds();
  } catch (error) {
    if (error instanceof PlatformResolutionsUnreadError) {
      return [];
    }
    throw error;
  }
}

/** The model that validates the platform's key: the first platform model on the provider, else the provider's fast BYOK route. */
export function systemProbeModelId(
  provider: AIProvider,
  platformModelIds: readonly string[],
  rows: readonly IndexedModel[],
  now: Date = new Date()
): string | null {
  return (
    platformModelIds.find((id) => providerOf(id) === provider) ??
    byokProbeModelId(provider, rows, now)
  );
}
