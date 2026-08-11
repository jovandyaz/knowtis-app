import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  conversations,
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleConversationRepository } from './drizzle-conversation.repository';

// Own ids: specs sharing fixture users delete each other's rows in afterAll when
// the suite runs in parallel against one database.
const USER = '00000000-0000-4000-8000-000000000091';
const OTHER = '00000000-0000-4000-8000-000000000092';

describe.runIf(DB_AVAILABLE)('DrizzleConversationRepository', () => {
  let db: Database;
  let repo: DrizzleConversationRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
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
    repo = new DrizzleConversationRepository(db);

    for (const id of [USER, OTHER]) {
      await db
        .insert(users)
        .values({
          id,
          email: `e-${id}@test.local`,
          name: 'E',
          isAnonymous: true,
        })
        .onConflictDoNothing();
    }
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER));
    await db.delete(users).where(eq(users.id, OTHER));
  });

  it('creates a conversation and loads its turns oldest→newest', async () => {
    const { id } = await repo.create({ userId: USER, title: 'first message' });
    await repo.appendTurn({
      conversationId: id,
      userMessage: { content: 'remember my codeword is BLUE' },
      assistantMessage: { content: 'Noted: BLUE', sources: [] },
    });
    const rows = await repo.loadMessages(id, 40);
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(rows[0].content).toBe('remember my codeword is BLUE');
    expect(rows[1].content).toBe('Noted: BLUE');
  });

  it('orders the user row before the assistant row within one turn', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    await repo.appendTurn({
      conversationId: id,
      userMessage: { content: 'U' },
      assistantMessage: { content: 'A', sources: [{ id: 'n1', title: 'N1' }] },
    });
    const rows = await repo.loadMessages(id, 40);
    expect(rows.map((r) => r.content)).toEqual(['U', 'A']);
    expect(rows[1].sources).toEqual([{ id: 'n1', title: 'N1' }]);
  });

  it('returns only the last `limit` messages, oldest→newest', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    for (let i = 0; i < 3; i += 1) {
      await repo.appendTurn({
        conversationId: id,
        userMessage: { content: `u${i}` },
        assistantMessage: { content: `a${i}`, sources: [] },
      });
    }
    const rows = await repo.loadMessages(id, 2);
    expect(rows.map((r) => r.content)).toEqual(['u2', 'a2']);
  });

  it('scopes findByIdForUser to the owner', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    expect(await repo.findByIdForUser(id, USER)).toMatchObject({ id });
    expect(await repo.findByIdForUser(id, OTHER)).toBeNull();
  });

  it('bumps updatedAt on appendTurn', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    await repo.appendTurn({
      conversationId: id,
      userMessage: { content: 'x' },
      assistantMessage: { content: 'y', sources: [] },
    });
    const [conv] = await db
      .select({
        bumped: sql<boolean>`${conversations.updatedAt} > ${conversations.createdAt}`,
      })
      .from(conversations)
      .where(eq(conversations.id, id));
    expect(conv?.bumped).toBe(true);
  });

  it('appends an assistant-only turn when userMessage is absent', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    await repo.appendTurn({
      conversationId: id,
      assistantMessage: { content: 'proactive', sources: [] },
    });
    const rows = await repo.loadMessages(id, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('assistant');
    expect(rows[0].content).toBe('proactive');
  });

  it('setModel persists, findByIdForUser returns it (scoped to owner)', async () => {
    const { id } = await repo.create({ userId: USER, title: 'model-test' });
    await repo.setModel(id, USER, 'openai:gpt-4o-mini');
    const found = await repo.findByIdForUser(id, USER);
    expect(found?.model).toBe('openai:gpt-4o-mini');
    expect(await repo.findByIdForUser(id, OTHER)).toBeNull();
  });

  it('scopes markExtracted to the owner', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    const extractedAt = async () => {
      const [row] = await db
        .select({ at: conversations.memoriesExtractedAt })
        .from(conversations)
        .where(eq(conversations.id, id));
      return row?.at ?? null;
    };
    await repo.markExtracted(OTHER, id);
    expect(await extractedAt()).toBeNull();
    await repo.markExtracted(USER, id);
    expect(await extractedAt()).not.toBeNull();
  });
});
