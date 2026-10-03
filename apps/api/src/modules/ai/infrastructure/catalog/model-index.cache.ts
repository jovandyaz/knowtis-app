import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import {
  MODEL_INDEX_SNAPSHOT,
  ModelIndexCatalog,
  type ModelCatalog,
  type ModelContextWindow,
  type ModelPricing,
} from '@knowtis/ai-gateway';

import { reasonOf } from '../../../../core/errors/reason-of';
import {
  MODEL_INDEX_REPOSITORY,
  type ModelIndexRepository,
} from '../../domain/ports/model-index.repository';

const MODEL_INDEX_REFRESH_MS = 60_000;

/** The synced model index, re-read every `MODEL_INDEX_REFRESH_MS`, with the vendored snapshot as its floor. */
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
   * The listed index rows from the last refresh that returned any, or the
   * vendored snapshot until one has and whenever the index is empty. Database
   * rows replace the snapshot entirely, so a model the sync retired stops
   * being supported. Synchronous because `ModelCatalog` is a synchronous port.
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
        this.current =
          rows.length > 0 ? new ModelIndexCatalog(rows) : this.floor;
      }
    } catch (error) {
      this.logger.warn({
        event: 'ai.model_index.cache_refresh_failed',
        reason: reasonOf(error),
        kept: this.current === this.floor ? 'vendored snapshot' : 'index rows',
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
}
