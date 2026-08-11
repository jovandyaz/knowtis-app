import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GENERAL_ACCESS } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  notes,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleNoteReadRepository } from './drizzle-note-read.repository';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const NOTE = '00000000-0000-4000-8000-0000000000a2';
const ACTIVE_NOTE = '00000000-0000-4000-8000-0000000000a6';
const TOKEN = 'softdelete-tok-a2';

describe.runIf(DB_AVAILABLE)('DrizzleNoteReadRepository soft-delete', () => {
  let db: Database;
  let repo: DrizzleNoteReadRepository;
  const ownerId = UserId.create(OWNER)._unsafeUnwrap();

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
      .values({
        id: OWNER,
        email: `e-${OWNER}@test.local`,
        name: 'O',
        isAnonymous: true,
      })
      .onConflictDoNothing();
    await db.delete(notes).where(eq(notes.id, NOTE));
    await db.delete(notes).where(eq(notes.id, ACTIVE_NOTE));
    await db.insert(notes).values({
      id: NOTE,
      ownerId: OWNER,
      title: 'to be deleted',
      content: 'body',
      shareToken: TOKEN,
      generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
      deletedAt: new Date(),
    });
    await db.insert(notes).values({
      id: ACTIVE_NOTE,
      ownerId: OWNER,
      title: 'still active',
      content: 'body',
      generalAccess: GENERAL_ACCESS.RESTRICTED,
    });
  });

  afterAll(async () => {
    await db.delete(notes).where(eq(notes.id, NOTE));
    await db.delete(notes).where(eq(notes.id, ACTIVE_NOTE));
    await db.delete(users).where(eq(users.id, OWNER));
  });

  it('findById excludes a soft-deleted note', async () => {
    expect(await repo.findById(NOTE)).toBeNull();
  });

  it('findByIdForUser excludes a soft-deleted note', async () => {
    expect(await repo.findByIdForUser(NOTE, ownerId)).toBeNull();
  });

  it('findByIdWithOwner excludes a soft-deleted note', async () => {
    expect(await repo.findByIdWithOwner(NOTE)).toBeNull();
  });

  it('findByOwner excludes soft-deleted notes but keeps active ones', async () => {
    const ids = (await repo.findByOwner(ownerId)).map((note) => note.id);
    expect(ids).toContain(ACTIVE_NOTE);
    expect(ids).not.toContain(NOTE);
  });

  it('findAccessibleSummariesByUser excludes a soft-deleted note', async () => {
    const rows = await repo.findAccessibleSummariesByUser(ownerId);
    expect(rows.map((r) => r.id)).not.toContain(NOTE);
  });

  it('findByShareToken does not resolve a soft-deleted note', async () => {
    expect(await repo.findByShareToken(TOKEN)).toBeNull();
  });
});
