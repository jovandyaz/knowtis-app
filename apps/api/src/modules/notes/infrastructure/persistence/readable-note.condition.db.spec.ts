import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  notePermissions,
  notes,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleNoteReadRepository } from './drizzle-note-read.repository';
import { readableNoteCondition } from './readable-note.condition';

const OWNER = '00000000-0000-4000-8000-0000000004a1';
const READER = '00000000-0000-4000-8000-0000000004a2';
const REVOKED = '00000000-0000-4000-8000-0000000004a3';
const STRANGER = '00000000-0000-4000-8000-0000000004a4';
const OWN_NOTE = '00000000-0000-4000-8000-0000000004a5';
const SHARED_NOTE = '00000000-0000-4000-8000-0000000004a6';
const TRASHED_NOTE = '00000000-0000-4000-8000-0000000004a7';
const ACTORS = [OWNER, READER, REVOKED, STRANGER];

const CASES = [
  {
    label: 'the owner reads their note',
    user: OWNER,
    note: OWN_NOTE,
    readable: true,
  },
  {
    label: 'the owner reads a note they shared',
    user: OWNER,
    note: SHARED_NOTE,
    readable: true,
  },
  {
    label: 'a reader reads a note shared with them',
    user: READER,
    note: SHARED_NOTE,
    readable: true,
  },
  {
    label: 'a revoked reader cannot',
    user: REVOKED,
    note: SHARED_NOTE,
    readable: false,
  },
  {
    label: 'a stranger cannot',
    user: STRANGER,
    note: OWN_NOTE,
    readable: false,
  },
  {
    label: 'the owner cannot read a trashed note',
    user: OWNER,
    note: TRASHED_NOTE,
    readable: false,
  },
  {
    label: 'a reader cannot read a trashed note',
    user: READER,
    note: TRASHED_NOTE,
    readable: false,
  },
] as const;

describe.runIf(DB_AVAILABLE)('readableNoteCondition', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleNoteReadRepository;

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

    for (const id of ACTORS) {
      await db
        .insert(users)
        .values({
          id,
          email: `e-${id}@test.local`,
          name: 'R',
          isAnonymous: true,
        })
        .onConflictDoNothing();
    }
    await db
      .insert(notes)
      .values([
        { id: OWN_NOTE, ownerId: OWNER, title: 'own', content: '' },
        { id: SHARED_NOTE, ownerId: OWNER, title: 'shared', content: '' },
        {
          id: TRASHED_NOTE,
          ownerId: OWNER,
          title: 'trashed',
          content: '',
          deletedAt: new Date(),
        },
      ])
      .onConflictDoNothing();
    await db
      .insert(notePermissions)
      .values([
        { noteId: SHARED_NOTE, userId: READER, permission: 'viewer' },
        { noteId: SHARED_NOTE, userId: REVOKED, permission: 'viewer' },
        { noteId: TRASHED_NOTE, userId: READER, permission: 'viewer' },
      ])
      .onConflictDoNothing();
    await db
      .delete(notePermissions)
      .where(
        and(
          eq(notePermissions.noteId, SHARED_NOTE),
          eq(notePermissions.userId, REVOKED)
        )
      );
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, ACTORS));
    await moduleRef.close();
  });

  it.each(CASES)('$label', async ({ user, note, readable }) => {
    const byRepository =
      (await repo.findByIdForUser(
        note,
        UserId.create(user)._unsafeUnwrap()
      )) !== null;
    const [row] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, note), readableNoteCondition(user)));

    expect(byRepository).toBe(readable);
    expect(row !== undefined).toBe(readable);
  });
});
