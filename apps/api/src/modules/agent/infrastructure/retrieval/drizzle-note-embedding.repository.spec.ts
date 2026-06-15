import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  notes,
  users,
  type Database,
} from '../../../../database';
import { DrizzleNoteEmbeddingRepository } from './drizzle-note-embedding.repository';

const USER = '00000000-0000-4000-8000-0000000000e1';
const NOTE = '00000000-0000-4000-8000-0000000000e2';

loadEnv({ path: ['.env.local', '.env'] });
const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();

describe.runIf(DB_AVAILABLE)('DrizzleNoteEmbeddingRepository', () => {
  let db: Database;
  let repo: DrizzleNoteEmbeddingRepository;

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
    repo = new DrizzleNoteEmbeddingRepository(db);

    await db
      .insert(users)
      .values({
        id: USER,
        email: `e-${USER}@test.local`,
        name: 'E',
        isAnonymous: true,
      })
      .onConflictDoNothing();
    await db
      .insert(notes)
      .values({ id: NOTE, ownerId: USER, title: 'note', content: 'body' })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER));
  });

  it('reports a note with no embedding as stale (quietSeconds=0)', async () => {
    const stale = await repo.findStaleNotes('voyage-4', 0, 200);
    expect(stale.map((s) => s.noteId)).toContain(NOTE);
  });

  it('upsert then findStaleNotes no longer reports it', async () => {
    await repo.upsert({
      noteId: NOTE,
      embedding: new Array(1024).fill(0),
      model: 'voyage-4',
      inputHash: 'h',
    });
    const stale = await repo.findStaleNotes('voyage-4', 0, 200);
    expect(stale.map((s) => s.noteId)).not.toContain(NOTE);
  });

  it('reports the note as stale when the embedding model differs', async () => {
    await repo.upsert({
      noteId: NOTE,
      embedding: new Array(1024).fill(0),
      model: 'voyage-4',
      inputHash: 'h',
    });
    const staleForSameModel = await repo.findStaleNotes('voyage-4', 0, 200);
    expect(staleForSameModel.map((s) => s.noteId)).not.toContain(NOTE);

    const staleForNewModel = await repo.findStaleNotes('voyage-5', 0, 200);
    expect(staleForNewModel.map((s) => s.noteId)).toContain(NOTE);
  });
});
