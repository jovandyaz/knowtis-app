import type {
  CreateEmailVerificationTokenData,
  EmailVerificationTokenEntity,
  EmailVerificationTokenRepository,
} from '@jovandyaz/auth-nestjs';
import { AuthErrors } from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq, lt, sql } from 'drizzle-orm';
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
          codeHash: data.codeHash,
          codeExpiresAt: data.codeExpiresAt,
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

  /** Updates in place so a verify attempt holding the old row id still lands; resetting `createdAt` is what restarts the cooldown and the attempt budget. */
  async replaceIfOlderThan(
    data: CreateEmailVerificationTokenData,
    minAgeMs: number
  ): Promise<Result<EmailVerificationTokenEntity | null, AuthDomainError>> {
    try {
      const rows = await this.db
        .insert(emailVerificationTokens)
        .values({
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          codeHash: data.codeHash,
          codeExpiresAt: data.codeExpiresAt,
        })
        .onConflictDoUpdate({
          target: emailVerificationTokens.userId,
          set: {
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt,
            codeHash: data.codeHash,
            codeExpiresAt: data.codeExpiresAt,
            attempts: 0,
            createdAt: sql`now()`,
          },
          setWhere: sql`${emailVerificationTokens.createdAt} <= now() - make_interval(secs => ${minAgeMs / 1000})`,
        })
        .returning();

      return ok(rows[0] ? this.mapToEntity(rows[0]) : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to replace email verification token: ${message}`
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

  async findByUserId(
    userId: string
  ): Promise<EmailVerificationTokenEntity | null> {
    const result = await this.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
      .orderBy(desc(emailVerificationTokens.createdAt))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToEntity(result[0]);
  }

  /** A single UPDATE ... RETURNING keeps two concurrent code attempts from both reading the same pre-increment count. */
  async incrementAttempts(id: string): Promise<number | null> {
    const result = await this.db
      .update(emailVerificationTokens)
      .set({ attempts: sql`${emailVerificationTokens.attempts} + 1` })
      .where(eq(emailVerificationTokens.id, id))
      .returning({ attempts: emailVerificationTokens.attempts });

    return result[0]?.attempts ?? null;
  }

  async deleteAllByUserId(userId: string): Promise<void> {
    await this.db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
  }

  async deleteExpired(cutoff: Date): Promise<void> {
    await this.db
      .delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, cutoff));
  }

  private mapToEntity(
    token: typeof emailVerificationTokens.$inferSelect
  ): EmailVerificationTokenEntity {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      codeHash: token.codeHash,
      codeExpiresAt: token.codeExpiresAt,
      attempts: token.attempts,
      createdAt: token.createdAt,
    };
  }
}
