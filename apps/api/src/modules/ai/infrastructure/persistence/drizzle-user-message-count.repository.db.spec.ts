import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  type Database,
} from '../../../../database/database.module';
import {
  conversationMessages,
  conversations,
} from '../../../../database/schema/conversations.schema';
import { users } from '../../../../database/schema/users.schema';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { utcDayOf } from '../../domain/value-objects/utc-day';
import { DrizzleUserMessageCountRepository } from './drizzle-user-message-count.repository';

const USER = '00000000-0000-4000-8000-0000000000c5';
const OTHER = '00000000-0000-4000-8000-0000000000c6';
const IDLE = '00000000-0000-4000-8000-0000000000c7';
const DAY = utcDayOf(new Date('2026-09-27T12:00:00.000Z'));
const MS = 1;

describe.runIf(DB_AVAILABLE)('DrizzleUserMessageCountRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleUserMessageCountRepository;

  async function conversationOf(userId: string): Promise<string> {
    const [row] = await db
      .insert(conversations)
      .values({ id: randomUUID(), userId, title: 't' })
      .returning({ id: conversations.id });
    return row.id;
  }

  async function row(
    conversationId: string,
    role: 'user' | 'assistant',
    createdAt: Date
  ): Promise<void> {
    await db.insert(conversationMessages).values({
      conversationId,
      role,
      content: 'x',
      turnId: randomUUID(),
      createdAt,
    });
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.local', '.env'],
        }),
        DatabaseModule,
      ],
    }).compile();
    db = moduleRef.get<Database>(DATABASE_CONNECTION);
    repo = new DrizzleUserMessageCountRepository(db);
    await db.delete(users).where(inArray(users.id, [USER, OTHER, IDLE]));
    for (const id of [USER, OTHER, IDLE]) {
      await db
        .insert(users)
        .values({
          id,
          email: `q-${id}@test.local`,
          name: 'Q',
          isAnonymous: false,
        })
        .onConflictDoNothing();
    }
    const mine = await conversationOf(USER);
    const another = await conversationOf(USER);
    const theirs = await conversationOf(OTHER);
    await row(mine, 'user', DAY.start);
    await row(another, 'user', new Date('2026-09-27T12:00:00.000Z'));
    await row(mine, 'assistant', new Date('2026-09-27T12:00:01.000Z'));
    await row(mine, 'user', new Date(DAY.start.getTime() - MS));
    await row(mine, 'user', DAY.resetsAt);
    await row(theirs, 'user', new Date('2026-09-27T12:00:00.000Z'));
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [USER, OTHER, IDLE]));
    await moduleRef.close();
  });

  it("counts today's UTC user rows across the caller's conversations, not yesterday's or tomorrow's", async () => {
    await expect(repo.countUserMessages(USER, DAY)).resolves.toBe(2);
  });

  it('counts only the caller', async () => {
    await expect(repo.countUserMessages(OTHER, DAY)).resolves.toBe(1);
  });

  it('counts zero for a caller with no conversations', async () => {
    await expect(repo.countUserMessages(IDLE, DAY)).resolves.toBe(0);
  });
});
