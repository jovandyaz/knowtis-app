import { Inject, Injectable, Logger } from '@nestjs/common';

import { resolvePlatformIntent } from '../../domain/model-catalog/model-selectors';
import {
  intentOfSelectorKey,
  resolutionChange,
  type ModelResolution,
  type ResolutionChange,
} from '../../domain/model-catalog/platform-resolution';
import { servedIndexRows } from '../../domain/model-catalog/served-index-rows';
import {
  MODEL_INDEX_REPOSITORY,
  type ModelIndexRepository,
} from '../../domain/ports/model-index.repository';
import {
  MODEL_RESOLUTION_REPOSITORY,
  type ModelResolutionRepository,
} from '../../domain/ports/model-resolution.repository';

function appliedEvent(change: ResolutionChange) {
  return change.kind === 'pend'
    ? {
        event: 'ai.model_resolution.pending',
        selectorKey: change.selectorKey,
        modelId: change.modelId,
      }
    : {
        event: 'ai.model_resolution.pending_cleared',
        selectorKey: change.selectorKey,
      };
}

/** Writes the platform selectors' candidates into the stored resolutions after a sync. */
@Injectable()
export class PlatformCandidatesWriter {
  private readonly logger = new Logger(PlatformCandidatesWriter.name);

  constructor(
    @Inject(MODEL_INDEX_REPOSITORY)
    private readonly index: ModelIndexRepository,
    @Inject(MODEL_RESOLUTION_REPOSITORY)
    private readonly resolutions: ModelResolutionRepository
  ) {}

  /** Applies each selector's `resolutionChange` over the served index: pends a new candidate, or clears a `pending` entry once the candidate is the active model again. Each write applies only while the row still holds the pending entry it read. Resolves how many rows it changed. */
  async write(now: Date): Promise<number> {
    const [listed, rows] = await Promise.all([
      this.index.listListed(),
      this.resolutions.list(),
    ]);
    const served = servedIndexRows(listed);
    let changed = 0;
    for (const row of rows) {
      const candidate = resolvePlatformIntent(
        intentOfSelectorKey(row.selectorKey),
        served,
        now
      );
      const change = resolutionChange(row, candidate?.id ?? null);
      if (change !== null && (await this.apply(change, row, now))) {
        changed += 1;
      }
    }
    return changed;
  }

  private async apply(
    change: ResolutionChange,
    read: ModelResolution,
    at: Date
  ): Promise<boolean> {
    const applied =
      change.kind === 'pend'
        ? await this.resolutions.setPending(
            change.selectorKey,
            change.modelId,
            {
              pendingModelId: read.pendingModelId,
              gateStatus: read.gateStatus,
            },
            at
          )
        : await this.resolutions.clearPending(
            change.selectorKey,
            change.pendingModelId,
            at
          );
    this.logger.log(
      applied
        ? appliedEvent(change)
        : {
            event: 'ai.model_resolution.pending_skipped',
            selectorKey: change.selectorKey,
            change: change.kind,
          }
    );
    return applied;
  }
}
