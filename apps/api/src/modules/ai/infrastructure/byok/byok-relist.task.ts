import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Sql } from 'postgres';

import { reasonOf } from '../../../../core/errors/reason-of';
import { DATABASE_CLIENT, runWithAdvisoryLock } from '../../../../database';
import {
  ByokModelsService,
  type RelistOutcome,
} from '../../application/services/byok-models.service';
import {
  USER_PROVIDER_MODELS_REPOSITORY,
  type ListingKey,
  type UserProviderModelsRepository,
} from '../../domain/ports/user-provider-models.repository';

const ADVISORY_LOCK_KEY = 778_493_005;
// An hour short of a day, so a daily run re-lists rows the previous run stamped just after it started.
const RELIST_AFTER_HOURS = 23;
const RELIST_BATCH_SIZE = 50;
const RELIST_MAX_BATCHES = 20;
const MS_PER_HOUR = 3_600_000;
const FAILED = 'failed';

export type ByokRelistRunStatus = 'completed' | 'locked';

type RelistCounts = Record<RelistOutcome | typeof FAILED, number>;

/** Re-lists the models of every BYOK key whose listing is missing, stale, a day old, or older than its key, so the stored listings follow each account's entitlements. */
@Injectable()
export class ByokRelistTask {
  private readonly logger = new Logger(ByokRelistTask.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly client: Sql,
    @Inject(USER_PROVIDER_MODELS_REPOSITORY)
    private readonly models: UserProviderModelsRepository,
    private readonly byokModels: ByokModelsService
  ) {}

  /** Never rejects: a failed run logs `byok.relist.run_failed`. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: 'UTC' })
  async relistDue(): Promise<void> {
    try {
      await this.run(new Date());
    } catch (error) {
      this.logger.error({
        event: 'byok.relist.run_failed',
        reason: reasonOf(error),
      });
    }
  }

  /** Re-lists the keys due at `now`, one at a time, unless another instance holds the lock. Rejects only when the advisory lock cannot be taken or released. */
  async run(now: Date): Promise<ByokRelistRunStatus> {
    const outcome = await runWithAdvisoryLock(
      this.client,
      ADVISORY_LOCK_KEY,
      () => this.relistDueAt(now)
    );
    if (!outcome.acquired) {
      this.logger.log({
        event: 'byok.relist.skipped',
        reason: 'another run holds the lock',
      });
      return 'locked';
    }
    return 'completed';
  }

  private async relistDueAt(now: Date): Promise<void> {
    const olderThan = new Date(
      now.getTime() - RELIST_AFTER_HOURS * MS_PER_HOUR
    );
    const counts: RelistCounts = {
      listed: 0,
      superseded: 0,
      unlisted: 0,
      rejected: 0,
      unavailable: 0,
      no_key: 0,
      [FAILED]: 0,
    };
    let cursor: ListingKey | null = null;
    let batches = 0;
    while (batches < RELIST_MAX_BATCHES) {
      let due: ListingKey[];
      try {
        due = await this.models.findDue(olderThan, RELIST_BATCH_SIZE, cursor);
      } catch (error) {
        this.logger.error({
          event: 'byok.relist.run_failed',
          reason: reasonOf(error),
          ...counts,
          batches,
        });
        return;
      }
      batches += 1;
      for (const key of due) {
        counts[await this.relistOne(key)] += 1;
      }
      const last = due.at(-1);
      if (due.length < RELIST_BATCH_SIZE || last === undefined) {
        break;
      }
      cursor = last;
    }
    this.logger.log({ event: 'byok.relist.completed', ...counts, batches });
  }

  private async relistOne(
    key: ListingKey
  ): Promise<RelistOutcome | typeof FAILED> {
    try {
      return await this.byokModels.relist(key.userId, key.provider);
    } catch (error) {
      this.logger.warn({
        event: 'byok.relist.item_failed',
        userId: key.userId,
        provider: key.provider,
        error: reasonOf(error),
      });
      return FAILED;
    }
  }
}
