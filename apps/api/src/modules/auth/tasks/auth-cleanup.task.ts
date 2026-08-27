import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from '@jovandyaz/auth-nestjs';
import type { EmailVerificationTokenRepository } from '@jovandyaz/auth-nestjs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { DrizzleAnonymousUserRepository } from '../infrastructure/persistence/drizzle-anonymous-user.repository';

@Injectable()
export class AuthCleanupTask {
  private readonly logger = new Logger(AuthCleanupTask.name);
  private static readonly MAX_AGE_DAYS = 30;

  constructor(
    private readonly anonymousUserRepository: DrizzleAnonymousUserRepository,
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

    try {
      const deleted = await this.anonymousUserRepository.deleteAbandoned(
        cutoff,
        now
      );

      if (deleted > 0) {
        this.logger.log(`Cleaned up ${deleted} abandoned anonymous users`);
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
