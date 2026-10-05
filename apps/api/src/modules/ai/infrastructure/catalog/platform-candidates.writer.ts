import { Inject, Injectable, Logger } from '@nestjs/common';

import { resolvePlatformIntent } from '../../domain/model-catalog/model-selectors';
import type { WatchFinding } from '../../domain/model-catalog/model-watch';
import {
  intentOfSelectorKey,
  PENDING_GATE_STATUS,
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
import { CatalogAlertsWriter } from './catalog-alerts.writer';

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

function selectorEmpty(row: ModelResolution): WatchFinding {
  return {
    subject: row.selectorKey,
    kind: 'selector_empty',
    detail: `no model in the index matches this selector, so it keeps serving ${row.activeModelId}`,
  };
}

function resolutionPending(
  change: Extract<ResolutionChange, { kind: 'pend' }>
): WatchFinding {
  return {
    subject: change.modelId,
    kind: 'resolution_pending',
    detail: `awaits the eval gate as the ${change.selectorKey} candidate`,
  };
}

// A replaced failed candidate closed its alert when its verdict landed.
function stoppedAwaitingGate(
  change: ResolutionChange,
  read: ModelResolution
): string | null {
  if (change.kind === 'clear') {
    return change.pendingModelId;
  }
  return read.gateStatus === PENDING_GATE_STATUS ? read.pendingModelId : null;
}

/** Writes the platform selectors' candidates into the stored resolutions after a sync. */
@Injectable()
export class PlatformCandidatesWriter {
  private readonly logger = new Logger(PlatformCandidatesWriter.name);

  constructor(
    @Inject(MODEL_INDEX_REPOSITORY)
    private readonly index: ModelIndexRepository,
    @Inject(MODEL_RESOLUTION_REPOSITORY)
    private readonly resolutions: ModelResolutionRepository,
    private readonly alerts: CatalogAlertsWriter
  ) {}

  /** Applies each selector's `resolutionChange` over the served index: pends a new candidate, or clears a `pending` entry once the candidate is the active model again. Each write applies only while the row still holds the pending entry it read. Raises `selector_empty` for a selector with no candidate and `resolution_pending` for each pend it applied, and resolves `resolution_pending` on the gate-pending model an applied change replaced or cleared. Resolves how many rows it changed. */
  async write(now: Date): Promise<number> {
    const [listed, rows] = await Promise.all([
      this.index.listListed(),
      this.resolutions.list(),
    ]);
    const served = servedIndexRows(listed);
    const findings: WatchFinding[] = [];
    let changed = 0;
    for (const row of rows) {
      const candidate = resolvePlatformIntent(
        intentOfSelectorKey(row.selectorKey),
        served,
        now
      );
      if (candidate === null) {
        findings.push(selectorEmpty(row));
      }
      const change = resolutionChange(row, candidate?.id ?? null);
      if (change !== null && (await this.apply(change, row, now))) {
        changed += 1;
        if (change.kind === 'pend') {
          findings.push(resolutionPending(change));
        }
        const settled = stoppedAwaitingGate(change, row);
        if (settled !== null) {
          await this.alerts.resolvePending(settled);
        }
      }
    }
    await this.alerts.raise(findings);
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
