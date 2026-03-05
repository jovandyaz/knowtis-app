import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lt } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../../database';
import { users } from '../../../database/schema/users.schema';

@Injectable()
export class CleanupAnonymousTask {
  private readonly logger = new Logger(CleanupAnonymousTask.name);
  private static readonly MAX_AGE_DAYS = 30;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CleanupAnonymousTask.MAX_AGE_DAYS);

    const result = await this.db
      .delete(users)
      .where(and(eq(users.isAnonymous, true), lt(users.createdAt, cutoff)))
      .returning({ id: users.id });

    if (result.length > 0) {
      this.logger.log(`Cleaned up ${result.length} abandoned anonymous users`);
    }
  }
}
