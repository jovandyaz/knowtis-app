import { Inject, Injectable, Logger } from '@nestjs/common';

import { resolvePlatformIntent } from '../../domain/model-catalog/model-selectors';
import {
  intentOfSelectorKey,
  resolutionChange,
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

  /** Applies each selector's `resolutionChange` over the served index: pends a new candidate, or clears a `pending` entry once the candidate is the active model again. Resolves how many rows it changed. */
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
      if (change !== null) {
        await this.apply(change, now);
        changed += 1;
      }
    }
    return changed;
  }

  private async apply(change: ResolutionChange, at: Date): Promise<void> {
    if (change.kind === 'pend') {
      await this.resolutions.setPending(change.selectorKey, change.modelId, at);
      this.logger.log({
        event: 'ai.model_resolution.pending',
        selectorKey: change.selectorKey,
        modelId: change.modelId,
      });
      return;
    }
    await this.resolutions.clearPending(change.selectorKey, at);
    this.logger.log({
      event: 'ai.model_resolution.pending_cleared',
      selectorKey: change.selectorKey,
    });
  }
}
