import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
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
import { DB_AVAILABLE } from '../../../../test-support/database';
import { htmlToYjsState } from '../html-to-yjs';
import { DrizzleNoteReadRepository } from './drizzle-note-read.repository';

const OWNER = '00000000-0000-4000-8000-000000000071';
const NOTE = '00000000-0000-4000-8000-000000000072';

describe.runIf(DB_AVAILABLE)('DrizzleNoteReadRepository CRDT state', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleNoteReadRepository;
  const ownerId = UserId.create(OWNER)._unsafeUnwrap();
  const yjsState = htmlToYjsState('<p>live body</p>');

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
      .values({
        id: OWNER,
        email: `e-${OWNER}@test.local`,
        name: 'O',
        isAnonymous: true,
      })
      .onConflictDoNothing();
    await db.delete(notes).where(eq(notes.id, NOTE));
    await db.insert(notes).values({
      id: NOTE,
      ownerId: OWNER,
      title: 'frozen',
      content: '<p>stale body</p>',
      yjsState,
    });
  });

  afterAll(async () => {
    await db.delete(notes).where(eq(notes.id, NOTE));
    await db.delete(users).where(eq(users.id, OWNER));
    await moduleRef.close();
  });

  it('findByIdForUser returns the note with its CRDT state', async () => {
    const note = await repo.findByIdForUser(NOTE, ownerId);

    expect(note?.content).toBe('<p>stale body</p>');
    expect(note?.yjsState?.equals(yjsState)).toBe(true);
  });
});
