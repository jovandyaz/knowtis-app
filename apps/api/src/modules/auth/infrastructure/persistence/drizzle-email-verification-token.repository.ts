import { AuthErrors } from '@jovandyaz/auth';
import type { AuthDomainError } from '@jovandyaz/auth';
import type {
  CreateEmailVerificationTokenData,
  EmailVerificationTokenEntity,
  EmailVerificationTokenRepository,
} from '@jovandyaz/auth-nestjs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import {
  DATABASE_CONNECTION,
  emailVerificationTokens,
  type Database,
} from '../../../../database';

@Injectable()
export class DrizzleEmailVerificationTokenRepository implements EmailVerificationTokenRepository {
  private readonly logger = new Logger(
    DrizzleEmailVerificationTokenRepository.name
  );

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async create(
    data: CreateEmailVerificationTokenData
  ): Promise<Result<EmailVerificationTokenEntity, AuthDomainError>> {
    try {
      const result = await this.db
        .insert(emailVerificationTokens)
        .values({
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        })
        .returning();

      const token = result[0];
      return ok(this.mapToEntity(token));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to create email verification token: ${message}`
      );
      return err(AuthErrors.internalError(message));
    }
  }

  async findByTokenHash(
    tokenHash: string
  ): Promise<EmailVerificationTokenEntity | null> {
    const result = await this.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToEntity(result[0]);
  }

  async deleteAllByUserId(userId: string): Promise<void> {
    await this.db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
  }

  private mapToEntity(
    token: typeof emailVerificationTokens.$inferSelect
  ): EmailVerificationTokenEntity {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
    };
  }
}
