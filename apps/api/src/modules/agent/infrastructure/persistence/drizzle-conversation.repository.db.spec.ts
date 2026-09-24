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
  userMemories,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import type { AgentSource } from '../../domain/agent-event';
import {
  AGENT_MESSAGE_PARTS_VERSION,
  type AgentMessagePart,
  type PersistedParts,
} from '../../domain/agent-message';
import type { AppendTurnInput } from '../../domain/ports/conversation.repository';
import { pruneTranscript } from '../../domain/prune-transcript';
import { buildTurnRows } from '../../domain/turn-transcript';
import { DrizzleConversationRepository } from './drizzle-conversation.repository';

const USER = '00000000-0000-4000-8000-000000000091';
const OTHER = '00000000-0000-4000-8000-000000000092';

describe.runIf(DB_AVAILABLE)('DrizzleConversationRepository', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleConversationRepository;

  const spyOnWarn = () =>
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

  const ownNote = async (title: string): Promise<string> => {
    const [row] = await db
      .insert(notes)
      .values({ ownerId: USER, title, content: '' })
      .returning({ id: notes.id });
    return row.id;
  };

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
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 'first message',
    });
    await repo.appendTurn({
      conversationId: id,
      turnId: randomUUID(),
      messages: [
        { role: 'user', content: 'remember my codeword is BLUE' },
        { role: 'assistant', content: 'Noted: BLUE', sources: [] },
      ],
    });
    const rows = await repo.loadMessages(id, USER, 40);
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(rows[0].content).toBe('remember my codeword is BLUE');
    expect(rows[1].content).toBe('Noted: BLUE');
  });

  it('creates a conversation under the id it is given', async () => {
    const given = '00000000-0000-4000-8000-0000000007a4';

    const { id } = await repo.create({ id: given, userId: USER, title: 't' });

    expect(id).toBe(given);
    expect(await repo.findByIdForUser(given, USER)).toEqual({
      id: given,
      model: null,
    });
  });

  it('orders the user row before the assistant row within one turn', async () => {
    const noteId = await ownNote('N1');
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
    await repo.appendTurn({
      conversationId: id,
      turnId: randomUUID(),
      messages: [
        { role: 'user', content: 'U' },
        {
          role: 'assistant',
          content: 'A',
          sources: [{ id: noteId, title: 'N1' }],
        },
      ],
    });
    const rows = await repo.loadMessages(id, USER, 40);
    expect(rows.map((r) => r.content)).toEqual(['U', 'A']);
    expect(rows[1].sources).toEqual([{ id: noteId, title: 'N1' }]);
  });

  it('returns only the last `limit` messages, oldest→newest', async () => {
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
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
    const rows = await repo.loadMessages(id, USER, 2);
    expect(rows.map((r) => r.content)).toEqual(['u2', 'a2']);
  });

  it('scopes findByIdForUser to the owner', async () => {
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
    expect(await repo.findByIdForUser(id, USER)).toMatchObject({ id });
    expect(await repo.findByIdForUser(id, OTHER)).toBeNull();
  });

  it('bumps updatedAt on appendTurn', async () => {
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
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
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
    await repo.appendTurn({
      conversationId: id,
      turnId: randomUUID(),
      messages: [{ role: 'assistant', content: 'proactive', sources: [] }],
    });
    const rows = await repo.loadMessages(id, USER, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('assistant');
    expect(rows[0].content).toBe('proactive');
  });

  it('appends a user-only turn when the assistant produced nothing', async () => {
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 'turno abortado',
    });

    await repo.appendTurn({
      conversationId: id,
      turnId: randomUUID(),
      messages: [{ role: 'user', content: 'pregunta perdida' }],
    });

    const rows = await repo.loadMessages(id, USER, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      role: 'user',
      content: 'pregunta perdida',
    });
  });

  it('setModel persists, findByIdForUser returns it (scoped to owner)', async () => {
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 'model-test',
    });
    await repo.setModel(id, USER, 'openai:gpt-4o-mini');
    const found = await repo.findByIdForUser(id, USER);
    expect(found?.model).toBe('openai:gpt-4o-mini');
    expect(await repo.findByIdForUser(id, OTHER)).toBeNull();
  });

  it('scopes markExtracted to the owner', async () => {
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
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
    const noteId = await ownNote('GTD');
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
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
              output: { hits: [{ id: noteId, title: 'GTD' }] },
              outputType: 'json',
            },
          ],
        },
        {
          role: 'assistant',
          content: 'Your notes describe GTD as…',
          sources: [{ id: noteId, title: 'GTD' }],
          stopReason: 'completed',
        },
      ],
    });

    const rows = await repo.loadMessages(id, USER, 40);

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
    expect(rows[3].sources).toEqual([{ id: noteId, title: 'GTD' }]);
  });

  it.each(['max_steps', 'token_budget'] as const)(
    'reloads a %s tool-ending turn with its terminal notice and intact replay pairs',
    async (stopReason) => {
      const noteId = await ownNote('N1');
      const { id } = await repo.create({
        id: randomUUID(),
        userId: USER,
        title: 'capped turn',
      });
      const turnId = randomUUID();
      await repo.appendTurn({
        conversationId: id,
        turnId,
        messages: buildTurnRows({
          userContent: 'read n1',
          assistantText: '',
          sources: [{ id: noteId, title: 'N1' }],
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
                  input: { noteId },
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

      const rows = await repo.loadMessages(id, USER, 40);

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
        sources: [{ id: noteId, title: 'N1' }],
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
              input: { noteId },
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
      expect(
        await repo.loadMessages(id, USER, 40, { textOnly: true })
      ).toHaveLength(1);
    }
  );

  it.each([
    ['an object', { id: 'x', title: 'X' }],
    ['a string', 'x'],
  ])(
    'loads a row whose stored sources are %s as citing nothing',
    async (_what, stored) => {
      const { id } = await repo.create({
        id: randomUUID(),
        userId: USER,
        title: 't',
      });
      await db.insert(conversationMessages).values({
        conversationId: id,
        turnId: randomUUID(),
        role: 'assistant',
        content: 'malformed sources',
        sources: stored as unknown as AgentSource[],
      });

      const rows = await repo.loadMessages(id, USER, 10);
      const transcript = await repo.loadTranscriptForUser(id, USER, 10);

      expect(rows.map((row) => row.sources)).toEqual([[]]);
      expect(transcript?.messages.map((message) => message.sources)).toEqual([
        [],
      ]);
    }
  );

  it('returns parts: null for a row persisted under an unknown parts version', async () => {
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
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

    const rows = await repo.loadMessages(id, USER, 10);

    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('unknown version content');
    expect(rows[0].parts).toBeNull();
  });

  it('returns parts: null when the stored payload is not an array of parts', async () => {
    const warnSpy = spyOnWarn();
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
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

    const rows = await repo.loadMessages(id, USER, 10);

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
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
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

    const rows = await repo.loadMessages(id, USER, 10);

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
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
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

    const rows = await repo.loadMessages(id, USER, 40, { textOnly: true });

    expect(rows.map((r) => [r.role, r.content])).toEqual([
      ['user', 'U'],
      ['assistant', 'A'],
    ]);
  });

  it('is a no-op for an empty turn', async () => {
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });
    const persisted = await repo.appendTurn({
      conversationId: id,
      turnId: randomUUID(),
      messages: [],
    });
    expect(persisted).toBe(false);
    expect(await repo.loadMessages(id, USER, 40)).toEqual([]);
  });

  it('rejects a stop reason outside the persisted set', async () => {
    const { id } = await repo.create({
      id: randomUUID(),
      userId: USER,
      title: 't',
    });

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
        id: randomUUID(),
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
      const { id } = await repo.create({
        id: randomUUID(),
        userId: LISTER,
        noteId,
        title: 't',
      });

      expect(await storedNoteId(id)).toBe(noteId);
    });

    it('keeps a note shared with the user', async () => {
      const noteId = await noteOf(STRANGER, 'Shared with me');
      await db
        .insert(notePermissions)
        .values({ noteId, userId: LISTER, permission: 'viewer' });
      const { id } = await repo.create({
        id: randomUUID(),
        userId: LISTER,
        noteId,
        title: 't',
      });

      expect(await storedNoteId(id)).toBe(noteId);
    });

    it("stores no note when the id names someone else's note", async () => {
      const noteId = await noteOf(STRANGER, 'Not yours');
      const { id } = await repo.create({
        id: randomUUID(),
        userId: LISTER,
        noteId,
        title: 't',
      });

      expect(await storedNoteId(id)).toBeNull();
    });

    it('stores no note when the note is in the trash', async () => {
      const noteId = await noteOf(LISTER, 'Trashed', true);
      const { id } = await repo.create({
        id: randomUUID(),
        userId: LISTER,
        noteId,
        title: 't',
      });

      expect(await storedNoteId(id)).toBeNull();
    });

    it('lists the owner conversations newest first and hides the empty ones', async () => {
      const older = await withTurn(LISTER);
      const newer = await withTurn(LISTER);
      await repo.create({
        id: randomUUID(),
        userId: LISTER,
        title: 'never answered',
      });
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
      const noteId = await noteOf(LISTER, 'N1');
      const { id } = await repo.create({
        id: randomUUID(),
        userId: LISTER,
        title: 't',
      });
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
                input: { noteId },
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
            sources: [{ id: noteId, title: 'N1' }],
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
          sources: [{ id: noteId, title: 'N1' }],
          stopReason: 'max_steps',
        },
      ]);
    });

    it('aligns a cut window to a question and says earlier messages exist', async () => {
      const { id } = await repo.create({
        id: randomUUID(),
        userId: LISTER,
        title: 't',
      });
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

    it('renames only the owner conversation', async () => {
      const id = await withTurn(LISTER, { title: 'Before' });

      expect(await repo.rename(id, STRANGER, 'Hijacked')).toBe(false);
      expect(await repo.rename(id, LISTER, 'After')).toBe(true);

      const [row] = await db
        .select({ title: conversations.title })
        .from(conversations)
        .where(eq(conversations.id, id));
      expect(row?.title).toBe('After');
    });

    it('keeps the list order and updatedAt when a conversation is renamed', async () => {
      const older = await withTurn(LISTER);
      const newer = await withTurn(LISTER);
      await touch(older, new Date('2026-09-01T10:00:00.000Z'));
      await touch(newer, new Date('2026-09-02T10:00:00.000Z'));

      await repo.rename(older, LISTER, 'Renamed');

      const page = await repo.listForUser(LISTER, { offset: 0, limit: 10 });
      expect(page.items.map((item) => [item.id, item.updatedAt])).toEqual([
        [newer, '2026-09-02T10:00:00.000Z'],
        [older, '2026-09-01T10:00:00.000Z'],
      ]);
    });

    it('does not make a renamed conversation due for memory extraction again', async () => {
      const id = await withTurn(LISTER);
      await touch(id, new Date(Date.now() - 60 * 60 * 1000));
      const due = async () =>
        (await repo.findExtractable(0, 10_000)).some((row) => row.id === id);

      expect(await due()).toBe(true);
      await repo.markExtracted(LISTER, id);
      expect(await due()).toBe(false);

      await repo.rename(id, LISTER, 'Renamed');

      expect(await due()).toBe(false);
    });

    it('deletes only the owner conversation, with its messages', async () => {
      const id = await withTurn(LISTER);

      expect(await repo.deleteForUser(id, STRANGER)).toBe(false);
      expect(await repo.deleteForUser(id, LISTER)).toBe(true);
      expect(await repo.deleteForUser(id, LISTER)).toBe(false);

      const [counted] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, id));
      expect(counted?.value).toBe(0);
    });

    it('keeps the memories extracted from a deleted conversation', async () => {
      const id = await withTurn(LISTER);
      const [memory] = await db
        .insert(userMemories)
        .values({
          userId: LISTER,
          content: 'prefers window seats',
          embedding: new Array(1024).fill(0),
          sourceConversationId: id,
        })
        .returning({ id: userMemories.id });

      await repo.deleteForUser(id, LISTER);

      const [kept] = await db
        .select({ source: userMemories.sourceConversationId })
        .from(userMemories)
        .where(eq(userMemories.id, memory.id));
      expect(kept).toEqual({ source: null });
    });
  });

  describe('turn identity', () => {
    const userAndAnswer = (conversationId: string, turnId: string) =>
      ({
        conversationId,
        turnId,
        messages: [
          { role: 'user', content: 'U' },
          { role: 'assistant', content: 'A', stopReason: 'completed' },
        ],
      }) satisfies AppendTurnInput;

    it('stores a replayed turn once and warns about the replay', async () => {
      const warnSpy = spyOnWarn();
      const { id } = await repo.create({
        id: randomUUID(),
        userId: USER,
        title: 't',
      });
      const turnId = randomUUID();

      const first = await repo.appendTurn(userAndAnswer(id, turnId));
      const replay = await repo.appendTurn(userAndAnswer(id, turnId));

      expect([first, replay]).toEqual([true, false]);
      const rows = await repo.loadMessages(id, USER, 40);
      expect(rows.map((row) => [row.role, row.content, row.turnId])).toEqual([
        ['user', 'U', turnId],
        ['assistant', 'A', turnId],
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'agent.turn.duplicate_persist',
          conversationId: id,
          turnId,
        })
      );
    });

    it('rejects a second user row for the same turn', async () => {
      const { id } = await repo.create({
        id: randomUUID(),
        userId: USER,
        title: 't',
      });
      const userRow = {
        conversationId: id,
        turnId: randomUUID(),
        role: 'user' as const,
        content: 'U',
      };
      await db.insert(conversationMessages).values(userRow);

      const driverError = await db
        .insert(conversationMessages)
        .values(userRow)
        .then(
          () => undefined,
          (error: unknown) => (error instanceof Error ? error.cause : error)
        );

      expect(driverError).toMatchObject({
        message: expect.stringContaining(
          'conversation_messages_turn_user_uniq'
        ),
      });
    });

    it('appends rows without a user row to a turn already stored', async () => {
      const { id } = await repo.create({
        id: randomUUID(),
        userId: USER,
        title: 't',
      });
      const turnId = randomUUID();
      await repo.appendTurn(userAndAnswer(id, turnId));

      await repo.appendTurn({
        conversationId: id,
        turnId,
        messages: [
          { role: 'assistant', content: 'resumed', stopReason: 'completed' },
        ],
      });

      const rows = await repo.loadMessages(id, USER, 40);
      expect(rows.map((row) => [row.content, row.turnId])).toEqual([
        ['U', turnId],
        ['A', turnId],
        ['resumed', turnId],
      ]);
    });
  });

  describe('note access at read time', () => {
    const READER = '00000000-0000-4000-8000-0000000004d1';
    const AUTHOR = '00000000-0000-4000-8000-0000000004d2';

    const noteBy = async (ownerId: string, title: string): Promise<string> => {
      const [row] = await db
        .insert(notes)
        .values({ ownerId, title, content: `${title} body` })
        .returning({ id: notes.id });
      return row.id;
    };

    const sharedWithReader = async (title: string): Promise<string> => {
      const noteId = await noteBy(AUTHOR, title);
      await db
        .insert(notePermissions)
        .values({ noteId, userId: READER, permission: 'viewer' });
      return noteId;
    };

    const revokeShare = (noteId: string) =>
      db
        .delete(notePermissions)
        .where(
          and(
            eq(notePermissions.noteId, noteId),
            eq(notePermissions.userId, READER)
          )
        );
    const trash = (noteId: string) =>
      db
        .update(notes)
        .set({ deletedAt: new Date() })
        .where(eq(notes.id, noteId));
    const purge = (noteId: string) =>
      db.delete(notes).where(eq(notes.id, noteId));

    const LOSING_ACCESS = [
      ['its share is revoked', revokeShare],
      ['it is in the trash', trash],
      ['it is deleted for good', purge],
    ] as const;

    const conversation = async (): Promise<string> =>
      (await repo.create({ id: randomUUID(), userId: READER, title: 't' })).id;

    const getNoteCall = (noteId: string): AgentMessagePart => ({
      type: 'tool-call',
      toolCallId: `call-${noteId}`,
      toolName: 'getNote',
      input: { noteId },
    });

    const getNoteResult = (
      noteId: string,
      title: string
    ): AgentMessagePart => ({
      type: 'tool-result',
      toolCallId: `call-${noteId}`,
      toolName: 'getNote',
      output: { id: noteId, title, content: `${title} body` },
      outputType: 'json',
    });

    const redactedCall = (
      toolCallId: string,
      toolName: string
    ): AgentMessagePart => ({
      type: 'tool-call',
      toolCallId,
      toolName,
      input: { note: 'unavailable' },
    });

    const redacted = (
      toolCallId: string,
      toolName: string
    ): AgentMessagePart => ({
      type: 'tool-result',
      toolCallId,
      toolName,
      output: { error: 'note_unavailable' },
      outputType: 'json',
    });

    const readNote = (conversationId: string, noteId: string, title: string) =>
      repo.appendTurn({
        conversationId,
        turnId: randomUUID(),
        messages: buildTurnRows({
          userContent: `read ${title}`,
          assistantText: `${title} says hi`,
          sources: [{ id: noteId, title }],
          stopReason: 'completed',
          turnMessages: [
            { role: 'assistant', content: '', parts: [getNoteCall(noteId)] },
            {
              role: 'tool',
              content: '',
              parts: [getNoteResult(noteId, title)],
            },
            { role: 'assistant', content: `${title} says hi` },
          ],
        }),
      });

    const citing = (conversationId: string, sources: AgentSource[]) =>
      repo.appendTurn({
        conversationId,
        turnId: randomUUID(),
        messages: [
          { role: 'user', content: 'question' },
          {
            role: 'assistant',
            content: 'answer',
            sources,
            stopReason: 'completed',
          },
        ],
      });

    const transcriptSources = async (conversationId: string) =>
      (
        await repo.loadTranscriptForUser(conversationId, READER, 40)
      )?.messages.flatMap((message) => message.sources);

    beforeAll(async () => {
      for (const id of [READER, AUTHOR]) {
        await db
          .insert(users)
          .values({ id, email: `e-${id}@test.local`, name: 'R' })
          .onConflictDoNothing();
      }
    });

    beforeEach(async () => {
      await db.delete(conversations).where(eq(conversations.userId, READER));
      await db.delete(notes).where(eq(notes.ownerId, READER));
      await db.delete(notes).where(eq(notes.ownerId, AUTHOR));
    });

    afterAll(async () => {
      await db.delete(users).where(eq(users.id, READER));
      await db.delete(users).where(eq(users.id, AUTHOR));
    });

    it.each(LOSING_ACCESS)(
      'drops a transcript source once %s and keeps the readable ones in order',
      async (_how, loseAccess) => {
        const lost = await sharedWithReader('Shared');
        const kept = await noteBy(READER, 'Mine');
        const id = await conversation();
        await citing(id, [
          { id: lost, title: 'Shared' },
          { id: kept, title: 'Mine' },
        ]);

        await loseAccess(lost);

        expect(await transcriptSources(id)).toEqual([
          { id: kept, title: 'Mine' },
        ]);
      }
    );

    it('names a source by the title its note has now', async () => {
      const noteId = await noteBy(READER, 'Draft');
      const id = await conversation();
      await citing(id, [{ id: noteId, title: 'Draft' }]);

      await db
        .update(notes)
        .set({ title: 'Final' })
        .where(eq(notes.id, noteId));

      expect(await transcriptSources(id)).toEqual([
        { id: noteId, title: 'Final' },
      ]);
      const rows = await repo.loadMessages(id, READER, 40);
      expect(rows.flatMap((row) => row.sources)).toEqual([
        { id: noteId, title: 'Final' },
      ]);
    });

    it.each(LOSING_ACCESS)(
      'forgets a note in the model context once %s, redacting its tool call and result and keeping the pair',
      async (_how, loseAccess) => {
        const noteId = await sharedWithReader('Secret');
        const id = await conversation();
        await readNote(id, noteId, 'Secret');

        await loseAccess(noteId);

        const rows = await repo.loadMessages(id, READER, 40);
        expect(rows.flatMap((row) => row.sources)).toEqual([]);
        expect(rows.map((row) => row.parts)).toEqual([
          null,
          [redactedCall(`call-${noteId}`, 'getNote')],
          [redacted(`call-${noteId}`, 'getNote')],
          null,
        ]);
        expect(
          pruneTranscript(rows, { keepToolTurns: 2 }).map((m) => m.parts)
        ).toEqual([
          undefined,
          [redactedCall(`call-${noteId}`, 'getNote')],
          [redacted(`call-${noteId}`, 'getNote')],
          undefined,
        ]);
      }
    );

    it('leaves a note the reader can still open untouched', async () => {
      const noteId = await sharedWithReader('Open');
      const id = await conversation();
      await readNote(id, noteId, 'Open');

      const rows = await repo.loadMessages(id, READER, 40);

      expect(rows.map((row) => row.parts)).toEqual([
        null,
        [getNoteCall(noteId)],
        [getNoteResult(noteId, 'Open')],
        null,
      ]);
      expect(rows.flatMap((row) => row.sources)).toEqual([
        { id: noteId, title: 'Open' },
      ]);
      expect(await transcriptSources(id)).toEqual([
        { id: noteId, title: 'Open' },
      ]);
    });

    it('treats an id that is not a uuid as a note the reader cannot open', async () => {
      const id = await conversation();
      await readNote(id, 'not-a-uuid', 'Bogus');

      const rows = await repo.loadMessages(id, READER, 40);

      expect(rows.flatMap((row) => row.sources)).toEqual([]);
      expect(rows[2].parts).toEqual([redacted('call-not-a-uuid', 'getNote')]);
      expect(await transcriptSources(id)).toEqual([]);
    });

    it('matches a note id written in uppercase to the readable note', async () => {
      const noteId = await sharedWithReader('Open');
      const upper = noteId.toUpperCase();
      const id = await conversation();
      await readNote(id, upper, 'Open');

      const rows = await repo.loadMessages(id, READER, 40);

      expect(rows[2].parts).toEqual([getNoteResult(upper, 'Open')]);
      expect(rows.flatMap((row) => row.sources)).toEqual([
        { id: noteId, title: 'Open' },
      ]);
    });

    it('pairs a reused tool call id only with the call of its own turn', async () => {
      const lost = await sharedWithReader('Lost');
      const kept = await noteBy(READER, 'Kept');
      const id = await conversation();
      const REUSED_CALL_ID = 'tool_0';
      const turnCalling = (
        toolName: string,
        input: unknown,
        output: unknown
      ): AppendTurnInput => ({
        conversationId: id,
        turnId: randomUUID(),
        messages: [
          { role: 'user', content: toolName },
          {
            role: 'assistant',
            content: '',
            parts: [
              {
                type: 'tool-call',
                toolCallId: REUSED_CALL_ID,
                toolName,
                input,
              },
            ],
          },
          {
            role: 'tool',
            content: '',
            parts: [
              {
                type: 'tool-result',
                toolCallId: REUSED_CALL_ID,
                toolName,
                output,
                outputType: 'json',
              },
            ],
          },
          { role: 'assistant', content: 'done', stopReason: 'completed' },
        ],
      });
      const recent = [{ id: kept, title: 'Kept' }];
      await repo.appendTurn(
        turnCalling('getNote', { noteId: lost }, { error: 'gone' })
      );
      await repo.appendTurn(
        turnCalling('listRecentNotes', { limit: 5 }, recent)
      );

      await revokeShare(lost);

      const results = (await repo.loadMessages(id, READER, 40))
        .filter((row) => row.role === 'tool')
        .map((row) => row.parts);
      expect(results).toEqual([
        [redacted(REUSED_CALL_ID, 'getNote')],
        [
          {
            type: 'tool-result',
            toolCallId: REUSED_CALL_ID,
            toolName: 'listRecentNotes',
            output: recent,
            outputType: 'json',
          },
        ],
      ]);
    });

    it('redacts only the search result that lists a note the reader lost', async () => {
      const kept = await noteBy(READER, 'Kept');
      const lost = await sharedWithReader('Lost');
      const id = await conversation();
      const search = (toolCallId: string, hits: AgentSource[]) => ({
        call: {
          type: 'tool-call',
          toolCallId,
          toolName: 'searchNotes',
          input: { query: 'plans' },
        } satisfies AgentMessagePart,
        result: {
          type: 'tool-result',
          toolCallId,
          toolName: 'searchNotes',
          output: { hits },
          outputType: 'json',
        } satisfies AgentMessagePart,
      });
      const onlyKept = search('s1', [{ id: kept, title: 'Kept' }]);
      const both = search('s2', [
        { id: kept, title: 'Kept' },
        { id: lost, title: 'Lost' },
      ]);
      await repo.appendTurn({
        conversationId: id,
        turnId: randomUUID(),
        messages: [
          { role: 'user', content: 'find my plans' },
          {
            role: 'assistant',
            content: '',
            parts: [onlyKept.call, both.call],
          },
          { role: 'tool', content: '', parts: [onlyKept.result, both.result] },
          { role: 'assistant', content: 'Two notes', stopReason: 'completed' },
        ],
      });

      await revokeShare(lost);

      const rows = await repo.loadMessages(id, READER, 40);
      expect(rows[2].parts).toEqual([
        onlyKept.result,
        redacted('s2', 'searchNotes'),
      ]);
    });

    it('redacts the call and the result of a proposal made against a note the reader lost', async () => {
      const noteId = await sharedWithReader('Plan');
      const id = await conversation();
      const call: AgentMessagePart = {
        type: 'tool-call',
        toolCallId: 'p1',
        toolName: 'proposeEditNote',
        input: { noteId, appendMarkdown: 'more' },
      };
      await repo.appendTurn({
        conversationId: id,
        turnId: randomUUID(),
        messages: [
          { role: 'user', content: 'add more' },
          { role: 'assistant', content: '', parts: [call] },
          {
            role: 'tool',
            content: '',
            parts: [
              {
                type: 'tool-result',
                toolCallId: 'p1',
                toolName: 'proposeEditNote',
                output: { ok: true, proposalId: 'x', summary: 'Edit Plan' },
                outputType: 'json',
              },
            ],
          },
          { role: 'assistant', content: 'Proposed', stopReason: 'completed' },
        ],
      });

      await trash(noteId);

      const rows = await repo.loadMessages(id, READER, 40);
      expect(rows[1].parts).toEqual([redactedCall('p1', 'proposeEditNote')]);
      expect(rows[2].parts).toEqual([redacted('p1', 'proposeEditNote')]);
    });
  });
});
