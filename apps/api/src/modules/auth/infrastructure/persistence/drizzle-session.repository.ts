import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import {
  DATABASE_CONNECTION,
  sessions,
  type Database,
} from '../../../../database';
import {
  AuthErrors,
  type AuthDomainError,
} from '../../domain/errors/auth.errors';
import type {
  CreateSessionData,
  SessionEntity,
  SessionRepository,
} from '../../domain/ports/session.repository';

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  private readonly logger = new Logger(DrizzleSessionRepository.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async create(
    data: CreateSessionData
  ): Promise<Result<SessionEntity, AuthDomainError>> {
    try {
      const result = await this.db
        .insert(sessions)
        .values({
          userId: data.userId,
          refreshTokenHash: data.refreshTokenHash,
          userAgent: data.userAgent ?? null,
          ipAddress: data.ipAddress ?? null,
          expiresAt: data.expiresAt,
        })
        .returning();

      const session = result[0];
      return ok(this.mapToEntity(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create session: ${message}`);
      return err(AuthErrors.internalError(message));
    }
  }

  async findByRefreshTokenHash(hash: string): Promise<SessionEntity | null> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, hash))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToEntity(result[0]);
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteAllByUserId(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  private mapToEntity(session: typeof sessions.$inferSelect): SessionEntity {
    return {
      id: session.id,
      userId: session.userId,
      refreshTokenHash: session.refreshTokenHash,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };
  }
}
