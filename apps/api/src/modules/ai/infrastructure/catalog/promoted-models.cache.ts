import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import type { CatalogModelStatus } from '@knowtis/shared-types';

import type { AiCatalogModelRow } from '../../../../database';
import {
  AI_CATALOG_REPOSITORY,
  type AiCatalogRepository,
} from '../../domain/ports/ai-catalog.repository';

const PROMOTED_CACHE_REFRESH_MS = 60_000;
const PROMOTED_STATUS: CatalogModelStatus = 'promoted';

@Injectable()
export class PromotedModelsCache implements OnModuleInit {
  private readonly logger = new Logger(PromotedModelsCache.name);
  private promoted: readonly AiCatalogModelRow[] = [];

  constructor(
    @Inject(AI_CATALOG_REPOSITORY)
    private readonly repository: AiCatalogRepository
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /** Last known promoted rows, empty until the first successful warm. Reads without awaiting because ModelCatalog is a synchronous port. */
  snapshot(): readonly AiCatalogModelRow[] {
    return this.promoted;
  }

  /** Never rejects: an unreachable database keeps the previous snapshot rather than dropping promoted models out of the catalog. */
  @Interval(PROMOTED_CACHE_REFRESH_MS)
  async refresh(): Promise<void> {
    try {
      this.promoted = await this.repository.listByStatus(PROMOTED_STATUS);
    } catch (error) {
      this.logger.warn(
        `Failed to refresh promoted models, keeping ${this.promoted.length} cached`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }
}
