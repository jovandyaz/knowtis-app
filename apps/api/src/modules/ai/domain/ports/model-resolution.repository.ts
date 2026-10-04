import type { PlatformSelectorKey } from '@knowtis/shared-types';

import type { ModelResolution } from '../model-catalog/platform-resolution';

export const MODEL_RESOLUTION_REPOSITORY = Symbol(
  'MODEL_RESOLUTION_REPOSITORY'
);

export interface ModelResolutionRepository {
  list(): Promise<ModelResolution[]>;
  /** Makes `modelId` the selector's pending model with gate status `pending`, clearing the previous gate detail and run URL. */
  setPending(
    selectorKey: PlatformSelectorKey,
    modelId: string,
    at: Date
  ): Promise<void>;
  /** Clears the selector's pending model and its gate status, detail and run URL. */
  clearPending(selectorKey: PlatformSelectorKey, at: Date): Promise<void>;
  /** Records the model an admin pin change stopped serving. */
  recordRelease(
    selectorKey: PlatformSelectorKey,
    modelId: string,
    at: Date
  ): Promise<void>;
}
