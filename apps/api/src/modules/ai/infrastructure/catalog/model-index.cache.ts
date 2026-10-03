import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import {
  MODEL_INDEX_SNAPSHOT,
  ModelIndexCatalog,
  type IndexedModel,
  type ModelCatalog,
  type ModelContextWindow,
  type ModelPricing,
} from '@knowtis/ai-gateway';

import { reasonOf } from '../../../../core/errors/reason-of';
import { servedIndexRows } from '../../domain/model-catalog/served-index-rows';
import {
  MODEL_INDEX_REPOSITORY,
  type ModelIndexRepository,
} from '../../domain/ports/model-index.repository';

const MODEL_INDEX_REFRESH_MS = 60_000;

/** The synced model index, re-read every `MODEL_INDEX_REFRESH_MS`, with the vendored snapshot as each provider's floor. */
@Injectable()
export class ModelIndexCache implements ModelCatalog, OnModuleInit {
  private readonly logger = new Logger(ModelIndexCache.name);
  private readonly floor = new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT);
  private current: ModelIndexCatalog = this.floor;
  private latestGeneration = 0;

  constructor(
    @Inject(MODEL_INDEX_REPOSITORY)
    private readonly repository: ModelIndexRepository
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /**
   * Each provider's listed index rows, or its vendored snapshot rows while the
   * index lists none for it (before the first refresh, every provider). A
   * provider's rows replace its snapshot rows entirely, so a model the sync
   * retired stops being supported. Synchronous because `ModelCatalog` is a
   * synchronous port.
   */
  catalog(): ModelIndexCatalog {
    return this.current;
  }

  /** Never rejects: an unreachable database keeps the catalog it already serves. */
  @Interval(MODEL_INDEX_REFRESH_MS)
  async refresh(): Promise<void> {
    const generation = ++this.latestGeneration;
    try {
      const rows = await this.repository.listListed();
      // A slow read must not overwrite a newer one that already landed.
      if (generation === this.latestGeneration) {
        this.current = this.withFloor(rows);
      }
    } catch (error) {
      this.logger.warn({
        event: 'ai.model_index.cache_refresh_failed',
        reason: reasonOf(error),
        models: this.current.size,
      });
    }
  }

  isSupported(modelId: string): boolean {
    return this.catalog().isSupported(modelId);
  }

  getPricing(modelId: string): ModelPricing | undefined {
    return this.catalog().getPricing(modelId);
  }

  getContextWindow(modelId: string): ModelContextWindow | undefined {
    return this.catalog().getContextWindow(modelId);
  }

  private withFloor(rows: readonly IndexedModel[]): ModelIndexCatalog {
    if (rows.length === 0) {
      return this.floor;
    }
    return new ModelIndexCatalog(servedIndexRows(rows));
  }
}
