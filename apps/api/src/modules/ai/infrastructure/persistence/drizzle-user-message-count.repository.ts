import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, lt } from 'drizzle-orm';

import {
  DATABASE_CONNECTION,
  type Database,
} from '../../../../database/database.module';
import {
  conversationMessages,
  conversations,
} from '../../../../database/schema/conversations.schema';
import type { UserMessageCountPort } from '../../domain/ports/message-quota.port';
import type { UtcDay } from '../../domain/value-objects/utc-day';

const USER_ROLE = 'user';

@Injectable()
export class DrizzleUserMessageCountRepository implements UserMessageCountPort {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async countUserMessages(userId: string, day: UtcDay): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(conversationMessages)
      .innerJoin(
        conversations,
        eq(conversations.id, conversationMessages.conversationId)
      )
      .where(
        and(
          eq(conversations.userId, userId),
          eq(conversationMessages.role, USER_ROLE),
          gte(conversationMessages.createdAt, day.start),
          lt(conversationMessages.createdAt, day.resetsAt)
        )
      );
    return row?.total ?? 0;
  }
}
