import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { PROMOTED_STATUS } from '@knowtis/shared-types';

import { stackOf } from '../../../../core/errors/stack-of';
import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import {
  AI_CATALOG_REPOSITORY,
  type AiCatalogRepository,
} from '../../domain/ports/ai-catalog.repository';

const PROMOTED_CACHE_REFRESH_MS = 60_000;

@Injectable()
export class PromotedModelsCache implements OnModuleInit {
  private readonly logger = new Logger(PromotedModelsCache.name);
  private promoted: readonly CatalogModel[] = [];
  private latestRefreshSucceeded = false;
  private latestGeneration = 0;

  constructor(
    @Inject(AI_CATALOG_REPOSITORY)
    private readonly repository: AiCatalogRepository
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /** Last known promoted models, empty until the first successful warm. Reads without awaiting because ModelCatalog is a synchronous port. */
  snapshot(): readonly CatalogModel[] {
    return this.promoted;
  }

  /** True only when the latest refresh succeeded: after a failure `snapshot()` keeps rows that may lag what another instance serves, so nothing durable may be decided from what it lacks. */
  isFresh(): boolean {
    return this.latestRefreshSucceeded;
  }

  /** Never rejects: an unreachable database keeps the previous snapshot rather than dropping promoted models out of the catalog. */
  @Interval(PROMOTED_CACHE_REFRESH_MS)
  async refresh(): Promise<void> {
    const generation = ++this.latestGeneration;
    try {
      const rows = await this.repository.listByStatus(PROMOTED_STATUS);
      // A slow read must not overwrite a newer one that already landed, or a
      // just-promoted model would vanish again until the next interval.
      if (generation === this.latestGeneration) {
        this.promoted = rows;
        this.latestRefreshSucceeded = true;
      }
    } catch (error) {
      if (generation === this.latestGeneration) {
        this.latestRefreshSucceeded = false;
      }
      this.logger.warn(
        `Failed to refresh promoted models, keeping ${this.promoted.length} cached`,
        stackOf(error)
      );
    }
  }
}
