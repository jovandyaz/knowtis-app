import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { and, eq, sql } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  conversationMessages,
  conversations,
  DATABASE_CONNECTION,
  DatabaseModule,
  notePermissions,
  notes,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import {
  AGENT_MESSAGE_PARTS_VERSION,
  type PersistedParts,
} from '../../domain/agent-message';
import { pruneTranscript } from '../../domain/prune-transcript';
import { buildTurnRows } from '../../domain/turn-transcript';
import { DrizzleConversationRepository } from './drizzle-conversation.repository';

// Own ids: specs sharing fixture users delete each other's rows in afterAll when
// the suite runs in parallel against one database.
const USER = '00000000-0000-4000-8000-000000000091';
const OTHER = '00000000-0000-4000-8000-000000000092';

describe.runIf(DB_AVAILABLE)('DrizzleConversationRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleConversationRepository;

  const spyOnWarn = () =>
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
              outputType: 'json',
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
      outputType: 'json',
    });
    expect(rows.map((r) => r.stopReason)).toEqual([
      null,
      null,
      null,
      'completed',
    ]);
    expect(rows[3].sources).toEqual([{ id: 'n1', title: 'GTD' }]);
  });

  it.each(['max_steps', 'token_budget'] as const)(
    'reloads a %s tool-ending turn with its terminal notice and intact replay pairs',
    async (stopReason) => {
      const { id } = await repo.create({ userId: USER, title: 'capped turn' });
      const turnId = randomUUID();
      await repo.appendTurn({
        conversationId: id,
        turnId,
        messages: buildTurnRows({
          userContent: 'read n1',
          assistantText: '',
          sources: [{ id: 'n1', title: 'N1' }],
          stopReason,
          turnMessages: [
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
                  outputType: 'text',
                },
              ],
            },
          ],
        }),
      });

      const rows = await repo.loadMessages(id, 40);

      expect(rows.map((row) => row.role)).toEqual([
        'user',
        'assistant',
        'tool',
        'assistant',
      ]);
      expect(rows.every((row) => row.turnId === turnId)).toBe(true);
      expect(rows[2]).toMatchObject({
        role: 'tool',
        stopReason: null,
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            output: 'body',
            outputType: 'text',
          },
        ],
      });
      expect(rows[3]).toMatchObject({
        role: 'assistant',
        content: '',
        stopReason,
        sources: [{ id: 'n1', title: 'N1' }],
      });
      const replay = pruneTranscript(rows, { keepToolTurns: 2 });
      expect(replay).toEqual([
        { role: 'user', content: 'read n1' },
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
              outputType: 'text',
            },
          ],
        },
      ]);
      expect(await repo.loadMessages(id, 40, { textOnly: true })).toHaveLength(
        1
      );
    }
  );

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

  it('returns parts: null when the stored payload is not an array of parts', async () => {
    const warnSpy = spyOnWarn();
    const { id } = await repo.create({ userId: USER, title: 't' });
    await db.insert(conversationMessages).values({
      conversationId: id,
      turnId: randomUUID(),
      role: 'assistant',
      content: 'malformed envelope content',
      parts: {
        v: AGENT_MESSAGE_PARTS_VERSION,
        parts: 'not-an-array',
      } as unknown as PersistedParts,
    });

    const rows = await repo.loadMessages(id, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('malformed envelope content');
    expect(rows[0].parts).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.transcript.parts_invalid',
        conversationId: id,
      })
    );
  });

  it('returns parts: null when a tool-result part has no output type', async () => {
    const warnSpy = spyOnWarn();
    const { id } = await repo.create({ userId: USER, title: 't' });
    await db.insert(conversationMessages).values({
      conversationId: id,
      turnId: randomUUID(),
      role: 'tool',
      content: 'untyped tool result content',
      parts: {
        v: AGENT_MESSAGE_PARTS_VERSION,
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'searchNotes',
            output: { hits: [] },
          },
        ],
      } as unknown as PersistedParts,
    });

    const rows = await repo.loadMessages(id, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('untyped tool result content');
    expect(rows[0].parts).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.transcript.parts_invalid',
        conversationId: id,
      })
    );
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
              outputType: 'text',
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

  describe('conversation history', () => {
    const LISTER = '00000000-0000-4000-8000-0000000004b1';
    const STRANGER = '00000000-0000-4000-8000-0000000004b2';

    const noteOf = async (
      ownerId: string,
      title: string,
      trashed = false
    ): Promise<string> => {
      const [row] = await db
        .insert(notes)
        .values({
          ownerId,
          title,
          content: '',
          ...(trashed ? { deletedAt: new Date() } : {}),
        })
        .returning({ id: notes.id });
      return row.id;
    };

    const storedNoteId = async (id: string): Promise<string | null> => {
      const [row] = await db
        .select({ noteId: conversations.noteId })
        .from(conversations)
        .where(eq(conversations.id, id));
      return row?.noteId ?? null;
    };

    const answer = (conversationId: string) =>
      repo.appendTurn({
        conversationId,
        turnId: randomUUID(),
        messages: [
          { role: 'user', content: 'question' },
          { role: 'assistant', content: 'answer', sources: [] },
        ],
      });

    const withTurn = async (
      userId: string,
      extra: { noteId?: string; title?: string } = {}
    ): Promise<string> => {
      const { id } = await repo.create({
        userId,
        title: extra.title ?? 'title',
        ...(extra.noteId ? { noteId: extra.noteId } : {}),
      });
      await answer(id);
      return id;
    };

    const touch = (id: string, at: Date) =>
      db
        .update(conversations)
        .set({ updatedAt: at })
        .where(eq(conversations.id, id));

    beforeAll(async () => {
      for (const [id, isAnonymous] of [
        [LISTER, false],
        [STRANGER, true],
      ] as const) {
        await db
          .insert(users)
          .values({ id, email: `e-${id}@test.local`, name: 'H', isAnonymous })
          .onConflictDoNothing();
      }
    });

    beforeEach(async () => {
      await db.delete(conversations).where(eq(conversations.userId, LISTER));
      await db.delete(conversations).where(eq(conversations.userId, STRANGER));
      await db.delete(notes).where(eq(notes.ownerId, LISTER));
      await db.delete(notes).where(eq(notes.ownerId, STRANGER));
    });

    afterAll(async () => {
      await db.delete(users).where(eq(users.id, LISTER));
      await db.delete(users).where(eq(users.id, STRANGER));
    });

    it('keeps the note a conversation starts from when the user owns it', async () => {
      const noteId = await noteOf(LISTER, 'Mine');
      const { id } = await repo.create({ userId: LISTER, noteId, title: 't' });

      expect(await storedNoteId(id)).toBe(noteId);
    });

    it('keeps a note shared with the user', async () => {
      const noteId = await noteOf(STRANGER, 'Shared with me');
      await db
        .insert(notePermissions)
        .values({ noteId, userId: LISTER, permission: 'viewer' });
      const { id } = await repo.create({ userId: LISTER, noteId, title: 't' });

      expect(await storedNoteId(id)).toBe(noteId);
    });

    it("stores no note when the id names someone else's note", async () => {
      const noteId = await noteOf(STRANGER, 'Not yours');
      const { id } = await repo.create({ userId: LISTER, noteId, title: 't' });

      expect(await storedNoteId(id)).toBeNull();
    });

    it('stores no note when the note is in the trash', async () => {
      const noteId = await noteOf(LISTER, 'Trashed', true);
      const { id } = await repo.create({ userId: LISTER, noteId, title: 't' });

      expect(await storedNoteId(id)).toBeNull();
    });

    it('lists the owner conversations newest first and hides the empty ones', async () => {
      const older = await withTurn(LISTER);
      const newer = await withTurn(LISTER);
      await repo.create({ userId: LISTER, title: 'never answered' });
      await touch(older, new Date('2026-09-01T10:00:00.000Z'));
      await touch(newer, new Date('2026-09-02T10:00:00.000Z'));

      const page = await repo.listForUser(LISTER, { offset: 0, limit: 10 });

      expect(page.items.map((item) => item.id)).toEqual([newer, older]);
      expect(page.total).toBe(2);
      expect(page.items[0].updatedAt).toBe('2026-09-02T10:00:00.000Z');
    });

    it('breaks a tie on updated_at by id so the order never flips', async () => {
      const LOW = '00000000-0000-4000-8000-0000000004b3';
      const MID = '00000000-0000-4000-8000-0000000004b4';
      const HIGH = '00000000-0000-4000-8000-0000000004b5';
      const at = new Date('2026-09-03T10:00:00.000Z');
      for (const id of [MID, HIGH, LOW]) {
        await db
          .insert(conversations)
          .values({ id, userId: LISTER, title: 'tie' });
        await answer(id);
      }
      for (const id of [MID, HIGH, LOW]) {
        await touch(id, at);
      }

      const page = await repo.listForUser(LISTER, { offset: 0, limit: 10 });

      expect(page.items.map((item) => item.id)).toEqual([HIGH, MID, LOW]);
    });

    it('pages with offset and limit and counts the whole set', async () => {
      const ids: string[] = [];
      for (let day = 1; day <= 3; day += 1) {
        const id = await withTurn(LISTER);
        await touch(id, new Date(`2026-09-0${day}T10:00:00.000Z`));
        ids.push(id);
      }

      const page = await repo.listForUser(LISTER, { offset: 1, limit: 1 });

      expect(page.items.map((item) => item.id)).toEqual([ids[1]]);
      expect(page.total).toBe(3);
    });

    it('shows another user nothing', async () => {
      await withTurn(LISTER);

      expect(
        await repo.listForUser(STRANGER, { offset: 0, limit: 10 })
      ).toEqual({
        items: [],
        total: 0,
      });
    });

    it('names the note a conversation started from while the user can read it', async () => {
      const noteId = await noteOf(LISTER, 'Viaje a Oaxaca');
      const id = await withTurn(LISTER, { noteId, title: 'Itinerario' });

      const [item] = (await repo.listForUser(LISTER, { offset: 0, limit: 10 }))
        .items;

      expect(item).toEqual({
        id,
        title: 'Itinerario',
        noteId,
        noteTitle: 'Viaje a Oaxaca',
        updatedAt: expect.any(String),
      });
    });

    it('hides the note once it is in the trash', async () => {
      const noteId = await noteOf(LISTER, 'Soon trashed');
      await withTurn(LISTER, { noteId });
      await db
        .update(notes)
        .set({ deletedAt: new Date() })
        .where(eq(notes.id, noteId));

      const [item] = (await repo.listForUser(LISTER, { offset: 0, limit: 10 }))
        .items;

      expect([item.noteId, item.noteTitle]).toEqual([null, null]);
    });

    it('hides the note once its share is revoked', async () => {
      const noteId = await noteOf(STRANGER, 'Shared then revoked');
      await db
        .insert(notePermissions)
        .values({ noteId, userId: LISTER, permission: 'viewer' });
      await withTurn(LISTER, { noteId });
      await db
        .delete(notePermissions)
        .where(
          and(
            eq(notePermissions.noteId, noteId),
            eq(notePermissions.userId, LISTER)
          )
        );

      const [item] = (await repo.listForUser(LISTER, { offset: 0, limit: 10 }))
        .items;

      expect([item.noteId, item.noteTitle]).toEqual([null, null]);
    });

    it('reads a transcript only for its owner', async () => {
      const id = await withTurn(LISTER);

      expect(await repo.loadTranscriptForUser(id, STRANGER, 40)).toBeNull();
      expect(
        await repo.loadTranscriptForUser(randomUUID(), LISTER, 40)
      ).toBeNull();
    });

    it('returns the whole conversation with its header when it fits', async () => {
      const noteId = await noteOf(LISTER, 'Origin');
      const id = await withTurn(LISTER, { noteId, title: 'Trip' });

      expect(await repo.loadTranscriptForUser(id, LISTER, 40)).toEqual({
        id,
        title: 'Trip',
        noteId,
        hasEarlier: false,
        messages: [
          {
            turnId: expect.any(String),
            role: 'user',
            content: 'question',
            sources: [],
            stopReason: null,
          },
          {
            turnId: expect.any(String),
            role: 'assistant',
            content: 'answer',
            sources: [],
            stopReason: null,
          },
        ],
      });
    });

    it('hides a note the user can no longer read from the transcript header', async () => {
      const noteId = await noteOf(LISTER, 'Trashed later');
      const id = await withTurn(LISTER, { noteId });
      await db
        .update(notes)
        .set({ deletedAt: new Date() })
        .where(eq(notes.id, noteId));

      expect(
        (await repo.loadTranscriptForUser(id, LISTER, 40))?.noteId
      ).toBeNull();
    });

    it('keeps the empty terminal row that carries a stop reason and skips tool rows', async () => {
      const { id } = await repo.create({ userId: LISTER, title: 't' });
      const turnId = randomUUID();
      await repo.appendTurn({
        conversationId: id,
        turnId,
        messages: [
          { role: 'user', content: 'read n1' },
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
                outputType: 'text',
              },
            ],
          },
          {
            role: 'assistant',
            content: '',
            sources: [{ id: 'n1', title: 'N1' }],
            stopReason: 'max_steps',
          },
        ],
      });

      expect(
        (await repo.loadTranscriptForUser(id, LISTER, 40))?.messages
      ).toEqual([
        {
          turnId,
          role: 'user',
          content: 'read n1',
          sources: [],
          stopReason: null,
        },
        {
          turnId,
          role: 'assistant',
          content: '',
          sources: [{ id: 'n1', title: 'N1' }],
          stopReason: 'max_steps',
        },
      ]);
    });

    it('aligns a cut window to a question and says earlier messages exist', async () => {
      const { id } = await repo.create({ userId: LISTER, title: 't' });
      for (let turn = 0; turn < 3; turn += 1) {
        await repo.appendTurn({
          conversationId: id,
          turnId: randomUUID(),
          messages: [
            { role: 'user', content: `u${turn}` },
            { role: 'assistant', content: `a${turn}`, sources: [] },
          ],
        });
      }

      const transcript = await repo.loadTranscriptForUser(id, LISTER, 3);

      expect(transcript?.messages.map((message) => message.content)).toEqual([
        'u2',
        'a2',
      ]);
      expect(transcript?.hasEarlier).toBe(true);
    });
  });
});
