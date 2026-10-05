import { vi } from 'vitest';

import type { ModelIntent } from '@knowtis/shared-types';

import {
  activeModelIdsOf,
  activeModelOf,
  platformBilledModelIds,
  SEED_RESOLUTIONS,
  SELECTOR_KEY_BY_INTENT,
  type ModelResolution,
} from '../domain/model-catalog/platform-resolution';
import type { ModelResolutionRepository } from '../domain/ports/model-resolution.repository';
import type { PlatformResolutionCache } from '../infrastructure/catalog/platform-resolution.cache';

/** The seed row of `intent` with `overrides` applied. */
export function seededResolution(
  intent: ModelIntent,
  overrides: Partial<ModelResolution> = {}
): ModelResolution {
  const seed = SEED_RESOLUTIONS.find(
    (row) => row.selectorKey === SELECTOR_KEY_BY_INTENT[intent]
  );
  if (!seed) {
    throw new Error(`No seed resolution for ${intent}`);
  }
  return { ...seed, ...overrides };
}

/** Every method a `vi.fn`; `list` resolves `SEED_RESOLUTIONS` unless given, and every compare-and-set write wins. */
export function createModelResolutionRepositoryStub(
  list: ModelResolutionRepository['list'] = () =>
    Promise.resolve([...SEED_RESOLUTIONS])
): ModelResolutionRepository {
  return {
    list: vi.fn(list),
    setPending: vi
      .fn<ModelResolutionRepository['setPending']>()
      .mockResolvedValue(true),
    clearPending: vi
      .fn<ModelResolutionRepository['clearPending']>()
      .mockResolvedValue(true),
    recordVerdict: vi
      .fn<ModelResolutionRepository['recordVerdict']>()
      .mockResolvedValue(true),
    recordRelease: vi.fn(),
  };
}

/** A synchronous stand-in serving `rows`, typed against the real cache. */
export function createResolutionsStub(
  rows: readonly ModelResolution[] = SEED_RESOLUTIONS,
  { readStore = true }: { readonly readStore?: boolean } = {}
): PlatformResolutionCache {
  const stub: Pick<
    PlatformResolutionCache,
    | 'activeModelId'
    | 'activeModelIds'
    | 'platformBilledModelIds'
    | 'hasReadStore'
    | 'refresh'
  > = {
    activeModelId: (intent) => activeModelOf(rows, intent),
    activeModelIds: () => activeModelIdsOf(rows),
    platformBilledModelIds: (now) => platformBilledModelIds(rows, now),
    hasReadStore: () => readStore,
    refresh: async () => undefined,
  };
  return stub as PlatformResolutionCache;
}
