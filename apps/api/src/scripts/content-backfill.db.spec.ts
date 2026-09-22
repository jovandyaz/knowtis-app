import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  type Database,
} from '../database/database.module';
import { noteEmbeddings } from '../database/schema/note-embeddings.schema';
import { notes } from '../database/schema/notes.schema';
import { users } from '../database/schema/users.schema';
import { DrizzleNoteEmbeddingRepository } from '../modules/agent/infrastructure/retrieval/drizzle-note-embedding.repository';
import {
  htmlToYjsState,
  yjsStateToHtml,
} from '../modules/notes/infrastructure/html-to-yjs';
import { DB_AVAILABLE } from '../test-support/database';
import { drizzleNoteContentStore, type NoteState } from './content-backfill';

const OWNER = '00000000-0000-4000-8000-000000000081';
const FROZEN = '00000000-0000-4000-8000-000000000082';
const CURRENT = '00000000-0000-4000-8000-000000000083';
const EMPTY_STATE = '00000000-0000-4000-8000-000000000084';
const OTHER_STATE = '00000000-0000-4000-8000-000000000085';
const NO_STATE = '00000000-0000-4000-8000-000000000086';
const BEFORE_FIXTURES = '00000000-0000-4000-8000-000000000080';
const NOTE_IDS = [FROZEN, CURRENT, EMPTY_STATE, OTHER_STATE, NO_STATE];

const EDITED_AT = new Date('2000-01-01T00:00:00.000Z');
const BEFORE_ANY_NOTE_EDIT = new Date(0);
const EMBEDDING_MODEL = 'backfill-spec-model';
const EMBEDDING_DIMENSIONS = 1024;
const STALE_NOTES_PAGE = 50;
const LIVE_HTML = '<p>Intro</p><p>Written after the column froze</p>';
const FROZEN_HTML = '<p>Intro</p>';

describe.runIf(DB_AVAILABLE)('drizzleNoteContentStore', () => {
  let moduleRef: TestingModule;
  let db: Database;
  const liveState = htmlToYjsState(LIVE_HTML);

  function note(id: string, content: string, yjsState: Buffer | null) {
    return { id, ownerId: OWNER, title: id, content, yjsState };
  }

  async function stored(id: string) {
    const [row] = await db
      .select({ content: notes.content, updatedAt: notes.updatedAt })
      .from(notes)
      .where(eq(notes.id, id));
    return row;
  }

  async function embeddingUpdatedAt(id: string) {
    const [row] = await db
      .select({ updatedAt: noteEmbeddings.updatedAt })
      .from(noteEmbeddings)
      .where(eq(noteEmbeddings.noteId, id));
    return row?.updatedAt;
  }

  async function reconcileSeesStale(id: string) {
    const stale = await new DrizzleNoteEmbeddingRepository(db).findStaleNotes(
      EMBEDDING_MODEL,
      0,
      STALE_NOTES_PAGE
    );
    return stale.some(({ noteId }) => noteId === id);
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

    await db
      .insert(users)
      .values({
        id: OWNER,
        email: `e-${OWNER}@test.local`,
        name: 'O',
        isAnonymous: true,
      })
      .onConflictDoNothing();
    await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
    await db
      .insert(notes)
      .values(
        [
          note(FROZEN, FROZEN_HTML, liveState),
          note(CURRENT, yjsStateToHtml(liveState), liveState),
          note(EMPTY_STATE, FROZEN_HTML, Buffer.alloc(0)),
          note(OTHER_STATE, FROZEN_HTML, htmlToYjsState('<p>Other</p>')),
          note(NO_STATE, FROZEN_HTML, null),
        ].map((row) => ({ ...row, updatedAt: EDITED_AT }))
      );
    await db.insert(noteEmbeddings).values(
      [FROZEN, OTHER_STATE].map((noteId) => ({
        noteId,
        embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0),
        model: EMBEDDING_MODEL,
        inputHash: noteId,
        updatedAt: EDITED_AT,
      }))
    );
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
    await db.delete(users).where(eq(users.id, OWNER));
    await moduleRef.close();
  });

  it('reads, in id order, only the notes that hold a CRDT state', async () => {
    const states = await drizzleNoteContentStore(db).statesAfter(
      BEFORE_FIXTURES,
      3
    );

    expect(
      states.map(({ id, hasEmbedding }) => ({ id, hasEmbedding }))
    ).toEqual([
      { id: FROZEN, hasEmbedding: true },
      { id: CURRENT, hasEmbedding: false },
      { id: OTHER_STATE, hasEmbedding: true },
    ]);
    expect(states[0]?.yjsState.equals(liveState)).toBe(true);
  });

  it('writes content rendered from the state the note still holds and hands its embedding back to the reconcile, keeping its edit time', async () => {
    const frozen: NoteState = {
      id: FROZEN,
      content: FROZEN_HTML,
      yjsState: liveState,
      hasEmbedding: true,
    };
    const staleBefore = await reconcileSeesStale(FROZEN);

    const replacement = await drizzleNoteContentStore(db).replaceContent(
      frozen,
      LIVE_HTML
    );

    expect(replacement).toEqual({ written: true, embeddingMarkedStale: true });
    expect(await stored(FROZEN)).toEqual({
      content: LIVE_HTML,
      updatedAt: EDITED_AT,
    });
    expect(await embeddingUpdatedAt(FROZEN)).toEqual(BEFORE_ANY_NOTE_EDIT);
    expect(staleBefore).toBe(false);
    expect(await reconcileSeesStale(FROZEN)).toBe(true);
  });

  it('leaves a note whose state changed after it was read', async () => {
    const readBeforeASave: NoteState = {
      id: OTHER_STATE,
      content: FROZEN_HTML,
      yjsState: liveState,
      hasEmbedding: true,
    };

    const replacement = await drizzleNoteContentStore(db).replaceContent(
      readBeforeASave,
      LIVE_HTML
    );

    expect(replacement).toEqual({
      written: false,
      embeddingMarkedStale: false,
    });
    expect(await stored(OTHER_STATE)).toEqual({
      content: FROZEN_HTML,
      updatedAt: EDITED_AT,
    });
    expect(await embeddingUpdatedAt(OTHER_STATE)).toEqual(EDITED_AT);
  });
});
