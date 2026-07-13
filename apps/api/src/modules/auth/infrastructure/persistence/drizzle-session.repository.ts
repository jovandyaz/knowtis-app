import type {
  CreateSessionData,
  SessionEntity,
  SessionRepository,
} from '@jovandyaz/auth-nestjs';
import { AuthErrors } from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt, isNotNull, isNull, lt } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import {
  DATABASE_CONNECTION,
  sessions,
  type Database,
} from '../../../../database';

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
          familyId: data.familyId,
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

  async hasLiveSessionForFamily(familyId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.familyId, familyId),
          gt(sessions.expiresAt, new Date()),
          isNull(sessions.rotatedAt)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  async markRotated(id: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ rotatedAt: new Date() })
      .where(eq(sessions.id, id));
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteByFamilyId(familyId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.familyId, familyId));
  }

  async deleteAllByUserId(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async deleteRotatedBefore(cutoff: Date): Promise<void> {
    await this.db
      .delete(sessions)
      .where(
        and(isNotNull(sessions.rotatedAt), lt(sessions.rotatedAt, cutoff))
      );
  }

  private mapToEntity(session: typeof sessions.$inferSelect): SessionEntity {
    return {
      id: session.id,
      userId: session.userId,
      familyId: session.familyId,
      refreshTokenHash: session.refreshTokenHash,
      rotatedAt: session.rotatedAt,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };
  }
}
