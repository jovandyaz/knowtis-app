import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  conversationMessages,
  conversations,
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import {
  AGENT_MESSAGE_PARTS_VERSION,
  type PersistedParts,
} from '../../domain/agent-message';
import { DrizzleConversationRepository } from './drizzle-conversation.repository';

// Own ids: specs sharing fixture users delete each other's rows in afterAll when
// the suite runs in parallel against one database.
const USER = '00000000-0000-4000-8000-000000000091';
const OTHER = '00000000-0000-4000-8000-000000000092';

describe.runIf(DB_AVAILABLE)('DrizzleConversationRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleConversationRepository;

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
    await moduleRef.close();
  });

  it('creates a conversation and loads its turns oldest→newest', async () => {
    const { id } = await repo.create({ userId: USER, title: 'first message' });
    await repo.appendTurn({
      conversationId: id,
      turnId: randomUUID(),
      messages: [
        { role: 'user', content: 'remember my codeword is BLUE' },
        { role: 'assistant', content: 'Noted: BLUE', sources: [] },
      ],
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
      turnId: randomUUID(),
      messages: [
        { role: 'user', content: 'U' },
        {
          role: 'assistant',
          content: 'A',
          sources: [{ id: 'n1', title: 'N1' }],
        },
      ],
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
        turnId: randomUUID(),
        messages: [
          { role: 'user', content: `u${i}` },
          { role: 'assistant', content: `a${i}`, sources: [] },
        ],
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
      turnId: randomUUID(),
      messages: [
        { role: 'user', content: 'x' },
        { role: 'assistant', content: 'y', sources: [] },
      ],
    });
    const [conv] = await db
      .select({
        bumped: sql<boolean>`${conversations.updatedAt} > ${conversations.createdAt}`,
      })
      .from(conversations)
      .where(eq(conversations.id, id));
    expect(conv?.bumped).toBe(true);
  });

  it('appends an assistant-only turn when the user row is absent', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    await repo.appendTurn({
      conversationId: id,
      turnId: randomUUID(),
      messages: [{ role: 'assistant', content: 'proactive', sources: [] }],
    });
    const rows = await repo.loadMessages(id, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('assistant');
    expect(rows[0].content).toBe('proactive');
  });

  it('appends a user-only turn when the assistant produced nothing', async () => {
    const { id } = await repo.create({
      userId: USER,
      title: 'turno abortado',
    });

    await repo.appendTurn({
      conversationId: id,
      turnId: randomUUID(),
      messages: [{ role: 'user', content: 'pregunta perdida' }],
    });

    const rows = await repo.loadMessages(id, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      role: 'user',
      content: 'pregunta perdida',
    });
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

  it('persists tool activity and turn metadata and loads them back oldest→newest', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    const turnId = randomUUID();
    await repo.appendTurn({
      conversationId: id,
      turnId,
      messages: [
        { role: 'user', content: 'what do my notes say about gtd?' },
        {
          role: 'assistant',
          content: '',
          parts: [
            {
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'searchNotes',
              input: { query: 'gtd' },
            },
          ],
        },
        {
          role: 'tool',
          content: '',
          parts: [
            {
              type: 'tool-result',
              toolCallId: 'c1',
              toolName: 'searchNotes',
              output: { hits: [{ id: 'n1', title: 'GTD' }] },
              isError: false,
            },
          ],
        },
        {
          role: 'assistant',
          content: 'Your notes describe GTD as…',
          sources: [{ id: 'n1', title: 'GTD' }],
          stopReason: 'completed',
        },
      ],
    });

    const rows = await repo.loadMessages(id, 40);

    expect(rows.map((r) => r.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(rows.every((r) => r.turnId === turnId)).toBe(true);
    expect(rows[1].parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'searchNotes',
        input: { query: 'gtd' },
      },
    ]);
    expect(rows[2].parts?.[0]).toMatchObject({
      type: 'tool-result',
      isError: false,
    });
    expect(rows.map((r) => r.stopReason)).toEqual([
      null,
      null,
      null,
      'completed',
    ]);
    expect(rows[3].sources).toEqual([{ id: 'n1', title: 'GTD' }]);
  });

  it('returns parts: null for a row persisted under an unknown parts version', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    const unknownVersionParts = {
      v: AGENT_MESSAGE_PARTS_VERSION + 1,
      parts: [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: 'searchNotes',
          input: { query: 'gtd' },
        },
      ],
    } as unknown as PersistedParts;
    await db.insert(conversationMessages).values({
      conversationId: id,
      turnId: randomUUID(),
      role: 'assistant',
      content: 'unknown version content',
      parts: unknownVersionParts,
    });

    const rows = await repo.loadMessages(id, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('unknown version content');
    expect(rows[0].parts).toBeNull();
  });

  it('loads text-only rows when asked, skipping tool rows and empty assistant rows', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    await repo.appendTurn({
      conversationId: id,
      turnId: randomUUID(),
      messages: [
        { role: 'user', content: 'U' },
        {
          role: 'assistant',
          content: '',
          parts: [
            {
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'getNote',
              input: { id: 'n1' },
            },
          ],
        },
        {
          role: 'tool',
          content: '',
          parts: [
            {
              type: 'tool-result',
              toolCallId: 'c1',
              toolName: 'getNote',
              output: 'body',
              isError: false,
            },
          ],
        },
        { role: 'assistant', content: 'A', stopReason: 'completed' },
      ],
    });

    const rows = await repo.loadMessages(id, 40, { textOnly: true });

    expect(rows.map((r) => [r.role, r.content])).toEqual([
      ['user', 'U'],
      ['assistant', 'A'],
    ]);
  });

  it('is a no-op for an empty turn', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });
    await repo.appendTurn({
      conversationId: id,
      turnId: randomUUID(),
      messages: [],
    });
    expect(await repo.loadMessages(id, 40)).toEqual([]);
  });

  it('rejects a stop reason outside the persisted set', async () => {
    const { id } = await repo.create({ userId: USER, title: 't' });

    const driverError = await repo
      .appendTurn({
        conversationId: id,
        turnId: randomUUID(),
        messages: [
          { role: 'assistant', content: 'A', stopReason: 'bogus' as never },
        ],
      })
      .then(
        () => undefined,
        (error: unknown) => (error instanceof Error ? error.cause : error)
      );

    expect(driverError).toMatchObject({
      message: expect.stringContaining(
        'conversation_messages_stop_reason_check'
      ),
    });
  });
});
