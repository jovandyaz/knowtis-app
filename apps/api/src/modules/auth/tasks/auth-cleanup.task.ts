import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from '@jovandyaz/auth-nestjs';
import type { EmailVerificationTokenRepository } from '@jovandyaz/auth-nestjs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, gt, lt, notExists } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

import { DATABASE_CONNECTION, type Database } from '../../../database';
import { sessions } from '../../../database/schema/sessions.schema';
import { users } from '../../../database/schema/users.schema';

@Injectable()
export class AuthCleanupTask {
  private readonly logger = new Logger(AuthCleanupTask.name);
  private static readonly MAX_AGE_DAYS = 30;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepository: EmailVerificationTokenRepository
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    const now = new Date();

    await this.pruneAbandonedAnonymousUsers(now);
    await this.pruneExpiredVerificationTokens(now);
  }

  private async pruneAbandonedAnonymousUsers(now: Date): Promise<void> {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - AuthCleanupTask.MAX_AGE_DAYS);

    const liveSessions = new QueryBuilder()
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, users.id), gt(sessions.expiresAt, now)));

    try {
      const result = await this.db
        .delete(users)
        .where(
          and(
            eq(users.isAnonymous, true),
            lt(users.createdAt, cutoff),
            notExists(liveSessions)
          )
        )
        .returning({ id: users.id });

      if (result.length > 0) {
        this.logger.log(
          `Cleaned up ${result.length} abandoned anonymous users`
        );
      }
    } catch (error) {
      this.logger.error(
        'Anonymous user cleanup failed',
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      );
    }
  }

  private async pruneExpiredVerificationTokens(now: Date): Promise<void> {
    try {
      await this.verificationTokenRepository.deleteExpired(now);
    } catch (error) {
      this.logger.error(
        'Expired verification token cleanup failed',
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      );
    }
  }
}
