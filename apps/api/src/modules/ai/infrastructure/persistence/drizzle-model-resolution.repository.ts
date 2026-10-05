import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import type { PlatformSelectorKey } from '@knowtis/shared-types';

import {
  aiModelResolutions,
  DATABASE_CONNECTION,
  type AiModelResolutionRow,
  type Database,
} from '../../../../database';
import {
  FAILED_GATE_STATUS,
  PENDING_GATE_STATUS,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import type {
  GateVerdict,
  ModelResolutionRepository,
  PendingSlot,
} from '../../domain/ports/model-resolution.repository';

function toResolution(row: AiModelResolutionRow): ModelResolution {
  return {
    selectorKey: row.selectorKey,
    activeModelId: row.activeModelId,
    previousModelId: row.previousModelId,
    changedAt: row.changedAt,
    releasedModelId: row.releasedModelId,
    releasedAt: row.releasedAt,
    pendingModelId: row.pendingModelId,
    gateStatus: row.gateStatus,
    gateDetail: row.gateDetail,
    gateRunUrl: row.gateRunUrl,
  };
}

// IS NOT DISTINCT FROM: `= NULL` is never true, so an expected null needs IS NULL.
function sameAs(column: AnyPgColumn, value: string | null): SQL {
  return value === null ? isNull(column) : eq(column, value);
}

@Injectable()
export class DrizzleModelResolutionRepository implements ModelResolutionRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async list(): Promise<ModelResolution[]> {
    const rows = await this.db.select().from(aiModelResolutions);
    return rows.map(toResolution);
  }

  async setPending(
    selectorKey: PlatformSelectorKey,
    modelId: string,
    expected: PendingSlot,
    at: Date
  ): Promise<boolean> {
    const updated = await this.db
      .update(aiModelResolutions)
      .set({
        pendingModelId: modelId,
        gateStatus: PENDING_GATE_STATUS,
        gateDetail: null,
        gateRunUrl: null,
        updatedAt: at,
      })
      .where(
        and(
          eq(aiModelResolutions.selectorKey, selectorKey),
          sameAs(aiModelResolutions.pendingModelId, expected.pendingModelId),
          sameAs(aiModelResolutions.gateStatus, expected.gateStatus)
        )
      )
      .returning({ selectorKey: aiModelResolutions.selectorKey });
    return updated.length > 0;
  }

  async clearPending(
    selectorKey: PlatformSelectorKey,
    expectedPendingModelId: string,
    at: Date
  ): Promise<boolean> {
    const updated = await this.db
      .update(aiModelResolutions)
      .set({
        pendingModelId: null,
        gateStatus: null,
        gateDetail: null,
        gateRunUrl: null,
        updatedAt: at,
      })
      .where(
        and(
          eq(aiModelResolutions.selectorKey, selectorKey),
          eq(aiModelResolutions.pendingModelId, expectedPendingModelId),
          eq(aiModelResolutions.gateStatus, PENDING_GATE_STATUS)
        )
      )
      .returning({ selectorKey: aiModelResolutions.selectorKey });
    return updated.length > 0;
  }

  async recordVerdict(
    selectorKey: PlatformSelectorKey,
    modelId: string,
    verdict: GateVerdict,
    at: Date
  ): Promise<boolean> {
    const outcome = verdict.passed
      ? {
          previousModelId: sql`${aiModelResolutions.activeModelId}`,
          activeModelId: sql`${aiModelResolutions.pendingModelId}`,
          changedAt: at,
          pendingModelId: null,
          gateStatus: null,
          gateDetail: null,
        }
      : { gateStatus: FAILED_GATE_STATUS, gateDetail: verdict.detail };
    const updated = await this.db
      .update(aiModelResolutions)
      .set({ ...outcome, gateRunUrl: verdict.runUrl, updatedAt: at })
      .where(
        and(
          eq(aiModelResolutions.selectorKey, selectorKey),
          eq(aiModelResolutions.pendingModelId, modelId),
          eq(aiModelResolutions.gateStatus, PENDING_GATE_STATUS)
        )
      )
      .returning({ selectorKey: aiModelResolutions.selectorKey });
    return updated.length > 0;
  }

  // Postgres evaluates every SET expression against the old row, so the two
  // columns swap without a temporary.
  async rollback(
    selectorKey: PlatformSelectorKey,
    expectedActiveModelId: string,
    at: Date
  ): Promise<boolean> {
    const updated = await this.db
      .update(aiModelResolutions)
      .set({
        activeModelId: sql`${aiModelResolutions.previousModelId}`,
        previousModelId: sql`${aiModelResolutions.activeModelId}`,
        changedAt: at,
        updatedAt: at,
      })
      .where(
        and(
          eq(aiModelResolutions.selectorKey, selectorKey),
          eq(aiModelResolutions.activeModelId, expectedActiveModelId),
          isNotNull(aiModelResolutions.previousModelId)
        )
      )
      .returning({ selectorKey: aiModelResolutions.selectorKey });
    return updated.length > 0;
  }

  async recordRelease(
    selectorKey: PlatformSelectorKey,
    modelId: string,
    at: Date
  ): Promise<void> {
    await this.db
      .update(aiModelResolutions)
      .set({ releasedModelId: modelId, releasedAt: at, updatedAt: at })
      .where(eq(aiModelResolutions.selectorKey, selectorKey));
  }
}
