import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { OPENROUTER_PROVIDER } from '@knowtis/ai-gateway';

import { reasonOf } from '../../../../core/errors/reason-of';
import { stackOf } from '../../../../core/errors/stack-of';
import { findStaleSync } from '../../domain/model-catalog/model-watch';
import {
  MODEL_INDEX_REPOSITORY,
  type ModelIndexRepository,
} from '../../domain/ports/model-index.repository';
import { CatalogAlertsWriter } from './catalog-alerts.writer';

/** Watches the model index sync from outside it, so a sync cron that stopped running still raises `sync_stale`, and resolves that alert once the sync recovers. */
@Injectable()
export class SyncStalenessTask {
  private readonly logger = new Logger(SyncStalenessTask.name);

  constructor(
    @Inject(MODEL_INDEX_REPOSITORY)
    private readonly index: ModelIndexRepository,
    private readonly alerts: CatalogAlertsWriter
  ) {}

  /** Raises `sync_stale` unless a listed OpenRouter index row was seen recently, and otherwise resolves the open one, so the next outage alerts again. Never rejects. */
  @Cron(CronExpression.EVERY_DAY_AT_6AM, { timeZone: 'UTC' })
  async check(): Promise<void> {
    try {
      const finding = findStaleSync(
        await this.index.lastSeenAt(OPENROUTER_PROVIDER),
        new Date()
      );
      if (finding === null) {
        await this.alerts.resolveOpen(OPENROUTER_PROVIDER, 'sync_stale');
      } else {
        await this.alerts.raise([finding]);
      }
    } catch (error) {
      this.logger.error({
        event: 'ai.model_index.staleness_check_failed',
        reason: reasonOf(error),
        stack: stackOf(error),
      });
    }
  }
}
