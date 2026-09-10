import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  noteEmbeddings,
  notes,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleNoteReadRepository } from './drizzle-note-read.repository';

const MINE = '00000000-0000-4000-8000-000000000191';
const OTHER = '00000000-0000-4000-8000-000000000192';
const NO_EMBEDDING = '00000000-0000-4000-8000-000000000193';
const STALE_EMBEDDING = '00000000-0000-4000-8000-000000000194';
const OTHER_MODEL = '00000000-0000-4000-8000-000000000195';
const UP_TO_DATE = '00000000-0000-4000-8000-000000000196';
const SOFT_DELETED = '00000000-0000-4000-8000-000000000197';
const FOREIGN = '00000000-0000-4000-8000-000000000198';

const MODEL = 'voyage-4';

function vec(first: number): number[] {
  const v = new Array(1024).fill(0);
  v[0] = first;
  return v;
}

describe.runIf(DB_AVAILABLE)(
  'DrizzleNoteReadRepository.findAccessibleNotesUnindexed',
  () => {
    let moduleRef: TestingModule;
    let db: Database;
    let repo: DrizzleNoteReadRepository;

    const unindexedIds = async () => {
      const rows = await repo.findAccessibleNotesUnindexed(
        UserId.create(MINE)._unsafeUnwrap(),
        MODEL,
        10
      );
      return rows.map((r) => r.id);
    };

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
      repo = new DrizzleNoteReadRepository(db);

      await db
        .insert(users)
        .values([
          {
            id: MINE,
            email: `mine-${MINE}@test.local`,
            name: 'Mine',
            isAnonymous: true,
          },
          {
            id: OTHER,
            email: `other-${OTHER}@test.local`,
            name: 'Other',
            isAnonymous: true,
          },
        ])
        .onConflictDoNothing();

      await db
        .insert(notes)
        .values([
          { id: NO_EMBEDDING, ownerId: MINE, title: 'fresh', content: 'a' },
          { id: STALE_EMBEDDING, ownerId: MINE, title: 'edited', content: 'b' },
          { id: OTHER_MODEL, ownerId: MINE, title: 'remodelled', content: 'c' },
          { id: UP_TO_DATE, ownerId: MINE, title: 'indexed', content: 'd' },
          {
            id: SOFT_DELETED,
            ownerId: MINE,
            title: 'trashed',
            content: 'e',
            deletedAt: new Date(),
          },
          { id: FOREIGN, ownerId: OTHER, title: 'theirs', content: 'f' },
        ])
        .onConflictDoNothing();

      await db
        .insert(noteEmbeddings)
        .values([
          {
            noteId: STALE_EMBEDDING,
            embedding: vec(1),
            model: MODEL,
            inputHash: 'h1',
          },
          {
            noteId: OTHER_MODEL,
            embedding: vec(1),
            model: 'voyage-3',
            inputHash: 'h2',
          },
          {
            noteId: UP_TO_DATE,
            embedding: vec(1),
            model: MODEL,
            inputHash: 'h3',
          },
        ])
        .onConflictDoNothing();

      await db
        .update(noteEmbeddings)
        .set({ updatedAt: sql`now() - interval '1 hour'` })
        .where(eq(noteEmbeddings.noteId, STALE_EMBEDDING));
      await db
        .update(noteEmbeddings)
        .set({ updatedAt: sql`now() + interval '1 hour'` })
        .where(eq(noteEmbeddings.noteId, UP_TO_DATE));
    });

    afterAll(async () => {
      await db.delete(users).where(eq(users.id, MINE));
      await db.delete(users).where(eq(users.id, OTHER));
      await moduleRef.close();
    });

    it('reports a note that has no embedding row', async () => {
      expect(await unindexedIds()).toContain(NO_EMBEDDING);
    });

    it('reports a note edited after it was embedded', async () => {
      expect(await unindexedIds()).toContain(STALE_EMBEDDING);
    });

    it('reports a note embedded by a different model', async () => {
      expect(await unindexedIds()).toContain(OTHER_MODEL);
    });

    it('omits a note whose embedding is current', async () => {
      expect(await unindexedIds()).not.toContain(UP_TO_DATE);
    });

    // Both carry no embedding row at all, so they are stale by the index
    // predicate: only the access scoping can keep them out.
    it('omits a soft-deleted note', async () => {
      expect(await unindexedIds()).not.toContain(SOFT_DELETED);
    });

    it('omits a note the user cannot access', async () => {
      expect(await unindexedIds()).not.toContain(FOREIGN);
    });

    it('honours the limit', async () => {
      const rows = await repo.findAccessibleNotesUnindexed(
        UserId.create(MINE)._unsafeUnwrap(),
        MODEL,
        1
      );
      expect(rows).toHaveLength(1);
    });
  }
);
