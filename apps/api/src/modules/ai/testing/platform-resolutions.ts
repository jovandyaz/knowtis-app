import { vi } from 'vitest';

import type { ModelIntent } from '@knowtis/shared-types';

import {
  SEED_RESOLUTIONS,
  SELECTOR_KEY_BY_INTENT,
  type ModelResolution,
} from '../domain/model-catalog/platform-resolution';
import type { ModelResolutionRepository } from '../domain/ports/model-resolution.repository';

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

/** Every method a `vi.fn`; `list` resolves `SEED_RESOLUTIONS` unless given. */
export function createModelResolutionRepositoryStub(
  list: ModelResolutionRepository['list'] = () =>
    Promise.resolve([...SEED_RESOLUTIONS])
): ModelResolutionRepository {
  return {
    list: vi.fn(list),
    setPending: vi.fn(),
    clearPending: vi.fn(),
    recordRelease: vi.fn(),
  };
}
