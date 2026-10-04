import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import type { ModelIntent } from '@knowtis/shared-types';

import { reasonOf } from '../../../../core/errors/reason-of';
import {
  activeModelIdsOf,
  activeModelOf,
  platformBilledModelIds,
  SEED_RESOLUTIONS,
  type ModelResolution,
} from '../../domain/model-catalog/platform-resolution';
import {
  MODEL_RESOLUTION_REPOSITORY,
  type ModelResolutionRepository,
} from '../../domain/ports/model-resolution.repository';

const PLATFORM_RESOLUTION_REFRESH_MS = 60_000;

@Injectable()
export class PlatformResolutionCache implements OnModuleInit {
  private readonly logger = new Logger(PlatformResolutionCache.name);
  private rows: readonly ModelResolution[] = SEED_RESOLUTIONS;
  private storeRead = false;
  private latestGeneration = 0;

  constructor(
    @Inject(MODEL_RESOLUTION_REPOSITORY)
    private readonly repository: ModelResolutionRepository
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /** Never rejects: an unreachable database keeps the last good rows, which are the seed floor until a read succeeds. */
  @Interval(PLATFORM_RESOLUTION_REFRESH_MS)
  async refresh(): Promise<void> {
    const generation = ++this.latestGeneration;
    try {
      const rows = await this.repository.list();
      if (generation === this.latestGeneration) {
        this.rows = rows;
        this.storeRead = true;
      }
    } catch (error) {
      this.logger.warn({
        event: 'ai.model_resolution.cache_refresh_failed',
        error: reasonOf(error),
      });
    }
  }

  /** True once a read of the store succeeded: until then the rows are the code seed floor. */
  hasReadStore(): boolean {
    return this.storeRead;
  }

  activeModelId(intent: ModelIntent): string | null {
    return activeModelOf(this.rows, intent);
  }

  activeModelIds(): string[] {
    return activeModelIdsOf(this.rows);
  }

  platformBilledModelIds(now: Date): ReadonlySet<string> {
    return platformBilledModelIds(this.rows, now);
  }
}
