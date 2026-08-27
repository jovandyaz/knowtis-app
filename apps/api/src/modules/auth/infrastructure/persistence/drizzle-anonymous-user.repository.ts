import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lt, notExists } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import { sessions } from '../../../../database/schema/sessions.schema';
import { users } from '../../../../database/schema/users.schema';

@Injectable()
export class DrizzleAnonymousUserRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  /**
   * Deletes anonymous users created before `createdBefore` that hold no session
   * still live at `sessionsLiveAt`. Returns how many rows went.
   */
  async deleteAbandoned(
    createdBefore: Date,
    sessionsLiveAt: Date
  ): Promise<number> {
    const liveSessions = new QueryBuilder()
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, users.id),
          gt(sessions.expiresAt, sessionsLiveAt)
        )
      );

    const deleted = await this.db
      .delete(users)
      .where(
        and(
          eq(users.isAnonymous, true),
          lt(users.createdAt, createdBefore),
          notExists(liveSessions)
        )
      )
      .returning({ id: users.id });

    return deleted.length;
  }
}
