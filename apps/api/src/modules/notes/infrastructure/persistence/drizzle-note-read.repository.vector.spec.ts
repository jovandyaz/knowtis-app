import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
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
import { DrizzleNoteReadRepository } from './drizzle-note-read.repository';

const MINE = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-0000000000c2';
const NOTE_NEAR = '00000000-0000-4000-8000-0000000000d1';
const NOTE_FAR = '00000000-0000-4000-8000-0000000000d2';
const NOTE_OTHER = '00000000-0000-4000-8000-0000000000d3';

function vec(first: number): number[] {
  const v = new Array(1024).fill(0);
  v[0] = first;
  return v;
}

loadEnv({ path: ['.env.local', '.env'] });
const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();

describe.runIf(DB_AVAILABLE)(
  'DrizzleNoteReadRepository.findAccessibleNotesByEmbedding',
  () => {
    let db: Database;
    let repo: DrizzleNoteReadRepository;

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
          { id: NOTE_NEAR, ownerId: MINE, title: 'near', content: 'near' },
          { id: NOTE_FAR, ownerId: MINE, title: 'far', content: 'far' },
          { id: NOTE_OTHER, ownerId: OTHER, title: 'other', content: 'other' },
        ])
        .onConflictDoNothing();
      await db
        .insert(noteEmbeddings)
        .values([
          {
            noteId: NOTE_NEAR,
            embedding: vec(1),
            model: 'voyage-4',
            inputHash: 'h1',
          },
          {
            noteId: NOTE_FAR,
            embedding: vec(-1),
            model: 'voyage-4',
            inputHash: 'h2',
          },
          {
            noteId: NOTE_OTHER,
            embedding: vec(1),
            model: 'voyage-4',
            inputHash: 'h3',
          },
        ])
        .onConflictDoNothing();
    });

    afterAll(async () => {
      await db.delete(users).where(eq(users.id, MINE));
      await db.delete(users).where(eq(users.id, OTHER));
    });

    it('returns only accessible notes, nearest first', async () => {
      const hits = await repo.findAccessibleNotesByEmbedding(
        UserId.create(MINE)._unsafeUnwrap(),
        vec(1),
        'voyage-4',
        10
      );
      const ids = hits.map((h) => h.id);
      expect(ids).not.toContain(NOTE_OTHER); // access scoping
      expect(ids[0]).toBe(NOTE_NEAR); // nearest first
    });
  }
);
