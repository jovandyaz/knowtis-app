import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import {
  DATABASE_CONNECTION,
  passwordResetTokens,
  type Database,
} from '../../../../database';
import {
  AuthErrors,
  type AuthDomainError,
} from '../../domain/errors/auth.errors';
import type {
  CreatePasswordResetTokenData,
  PasswordResetTokenEntity,
  PasswordResetTokenRepository,
} from '../../domain/ports/password-reset-token.repository';

@Injectable()
export class DrizzlePasswordResetTokenRepository implements PasswordResetTokenRepository {
  private readonly logger = new Logger(
    DrizzlePasswordResetTokenRepository.name
  );

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async create(
    data: CreatePasswordResetTokenData
  ): Promise<Result<PasswordResetTokenEntity, AuthDomainError>> {
    try {
      const result = await this.db
        .insert(passwordResetTokens)
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
      this.logger.error(`Failed to create password reset token: ${message}`);
      return err(AuthErrors.internalError(message));
    }
  }

  async findByTokenHash(
    tokenHash: string
  ): Promise<PasswordResetTokenEntity | null> {
    const result = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToEntity(result[0]);
  }

  async deleteAllByUserId(userId: string): Promise<void> {
    await this.db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
  }

  private mapToEntity(
    token: typeof passwordResetTokens.$inferSelect
  ): PasswordResetTokenEntity {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
    };
  }
}
