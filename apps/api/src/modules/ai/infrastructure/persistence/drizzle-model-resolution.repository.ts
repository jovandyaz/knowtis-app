import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { PlatformSelectorKey } from '@knowtis/shared-types';

import {
  aiModelResolutions,
  DATABASE_CONNECTION,
  type AiModelResolutionRow,
  type Database,
} from '../../../../database';
import {
  PENDING_GATE_STATUS,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import type { ModelResolutionRepository } from '../../domain/ports/model-resolution.repository';

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
  };
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
    at: Date
  ): Promise<void> {
    await this.db
      .update(aiModelResolutions)
      .set({
        pendingModelId: modelId,
        gateStatus: PENDING_GATE_STATUS,
        gateDetail: null,
        gateRunUrl: null,
        updatedAt: at,
      })
      .where(eq(aiModelResolutions.selectorKey, selectorKey));
  }

  async clearPending(
    selectorKey: PlatformSelectorKey,
    at: Date
  ): Promise<void> {
    await this.db
      .update(aiModelResolutions)
      .set({
        pendingModelId: null,
        gateStatus: null,
        gateDetail: null,
        gateRunUrl: null,
        updatedAt: at,
      })
      .where(eq(aiModelResolutions.selectorKey, selectorKey));
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
