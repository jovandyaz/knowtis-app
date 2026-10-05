import type {
  PlatformSelectorKey,
  RollbackResolutionInput,
} from '@knowtis/shared-types';

import type { ModelResolution } from '../model-catalog/platform-resolution';

export const MODEL_RESOLUTION_REPOSITORY = Symbol(
  'MODEL_RESOLUTION_REPOSITORY'
);

/** The pending model and gate status a compare-and-set write expects to find unchanged. */
export type PendingSlot = Pick<
  ModelResolution,
  'pendingModelId' | 'gateStatus'
>;

/** What an applied roll back did besides the swap. */
export interface AppliedRollback {
  /** Whether it cleared a `pending` entry on the model it restored. */
  readonly clearedPending: boolean;
}

export type GateVerdict =
  | { readonly passed: true; readonly runUrl: string }
  | {
      readonly passed: false;
      readonly runUrl: string;
      readonly detail: string;
    };

export interface ModelResolutionRepository {
  list(): Promise<ModelResolution[]>;
  /** Makes `modelId` the selector's pending model with gate status `pending`, clearing the previous gate detail and run URL, only while its pending model and gate status still equal `expected`. Resolves whether a row changed. */
  setPending(
    selectorKey: PlatformSelectorKey,
    modelId: string,
    expected: PendingSlot,
    at: Date
  ): Promise<boolean>;
  /** Clears the selector's pending model and its gate status, detail and run URL, only while `expectedPendingModelId` is still pending. Resolves whether a row changed. */
  clearPending(
    selectorKey: PlatformSelectorKey,
    expectedPendingModelId: string,
    at: Date
  ): Promise<boolean>;
  /** Applies a gate verdict to the pending model in one write; false when that model is no longer pending. */
  recordVerdict(
    selectorKey: PlatformSelectorKey,
    modelId: string,
    verdict: GateVerdict,
    at: Date
  ): Promise<boolean>;
  /** Swaps the selector's active and previous models, stamping `changedAt`, only while they still equal `expected`. In the same transaction it clears a `pending` entry on the restored model, as the sync clears a candidate equal to the active model; any other pending entry, and a `failed` one, stays. Resolves null when the row no longer holds `expected`. */
  rollback(
    selectorKey: PlatformSelectorKey,
    expected: RollbackResolutionInput,
    at: Date
  ): Promise<AppliedRollback | null>;
  /** Records the model an admin pin change stopped serving. */
  recordRelease(
    selectorKey: PlatformSelectorKey,
    modelId: string,
    at: Date
  ): Promise<void>;
}
