import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  notes,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleNoteWriteRepository } from './drizzle-note-write.repository';

const OWNER = '00000000-0000-4000-8000-0000000000f1';
const OTHER = '00000000-0000-4000-8000-0000000000f2';
const NOTE = '00000000-0000-4000-8000-0000000000f3';

describe.runIf(DB_AVAILABLE)('DrizzleNoteWriteRepository soft-delete', () => {
  let db: Database;
  let repo: DrizzleNoteWriteRepository;
  let originalUpdatedAt: Date;

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
    repo = new DrizzleNoteWriteRepository(db);

    for (const id of [OWNER, OTHER]) {
      await db
        .insert(users)
        .values({
          id,
          email: `e-${id}@test.local`,
          name: 'U',
          isAnonymous: true,
        })
        .onConflictDoNothing();
    }
  });

  beforeEach(async () => {
    await db.delete(notes).where(eq(notes.id, NOTE));
    const [inserted] = await db
      .insert(notes)
      .values({ id: NOTE, ownerId: OWNER, title: 'note', content: 'body' })
      .returning();
    originalUpdatedAt = inserted.updatedAt;
  });

  afterAll(async () => {
    await db.delete(notes).where(eq(notes.id, NOTE));
    await db.delete(users).where(eq(users.id, OWNER));
    await db.delete(users).where(eq(users.id, OTHER));
  });

  it('delete soft-deletes the row (keeps it, sets deleted_at)', async () => {
    const result = await repo.delete(NOTE);
    expect(result.isOk()).toBe(true);

    const rows = await db.select().from(notes).where(eq(notes.id, NOTE));
    expect(rows).toHaveLength(1);
    expect(rows[0].deletedAt).not.toBeNull();
    expect(rows[0].updatedAt).toEqual(originalUpdatedAt);
  });

  it('re-deleting an already-deleted note returns not-found', async () => {
    await repo.delete(NOTE);
    const again = await repo.delete(NOTE);
    expect(again.isErr()).toBe(true);
  });

  it('restore clears deleted_at for the owner', async () => {
    await repo.delete(NOTE);
    const result = await repo.restore(NOTE, OWNER);
    expect(result.isOk()).toBe(true);

    const rows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, NOTE), isNull(notes.deletedAt)));
    expect(rows).toHaveLength(1);
    expect(rows[0].updatedAt).toEqual(originalUpdatedAt);
  });

  it('restore by a non-owner returns not-found and leaves the note deleted', async () => {
    await repo.delete(NOTE);
    const result = await repo.restore(NOTE, OTHER);
    expect(result.isErr()).toBe(true);

    const rows = await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, NOTE), isNull(notes.deletedAt)));
    expect(rows).toHaveLength(0);
  });

  it('restore of a note that is not deleted returns not-found', async () => {
    const result = await repo.restore(NOTE, OWNER);
    expect(result.isErr()).toBe(true);
  });
});
