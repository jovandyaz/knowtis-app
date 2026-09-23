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
import { notes } from '../database/schema/notes.schema';
import { users } from '../database/schema/users.schema';
import { htmlToYjsState } from '../modules/notes/infrastructure/html-to-yjs';
import { DB_AVAILABLE } from '../test-support/database';
import { drizzleNoteImageStore } from './note-image-audit';

const BEFORE_FIXTURES = '00000000-0000-4000-8000-000000000060';
const OWNER = '00000000-0000-4000-8000-000000000061';
const LIVE = '00000000-0000-4000-8000-000000000062';
const TRASHED = '00000000-0000-4000-8000-000000000063';
const NO_STATE = '00000000-0000-4000-8000-000000000064';
const NOTE_IDS = [LIVE, TRASHED, NO_STATE];

const TRASHED_AT = new Date('2026-09-01T00:00:00.000Z');
const LIVE_HTML = '<p>Live</p>';
const NO_STATE_HTML = '<p>Only content</p>';

describe.runIf(DB_AVAILABLE)('drizzleNoteImageStore', () => {
  let moduleRef: TestingModule;
  let db: Database;
  const liveState = htmlToYjsState(LIVE_HTML);

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
    await db.insert(notes).values([
      {
        id: LIVE,
        ownerId: OWNER,
        title: LIVE,
        content: LIVE_HTML,
        yjsState: liveState,
      },
      {
        id: TRASHED,
        ownerId: OWNER,
        title: TRASHED,
        content: LIVE_HTML,
        yjsState: liveState,
        deletedAt: TRASHED_AT,
      },
      {
        id: NO_STATE,
        ownerId: OWNER,
        title: NO_STATE,
        content: NO_STATE_HTML,
        yjsState: null,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
    await db.delete(users).where(eq(users.id, OWNER));
    await moduleRef.close();
  });

  it('reads every note in id order, trashed or without a CRDT state included', async () => {
    const states = await drizzleNoteImageStore(db).statesAfter(
      BEFORE_FIXTURES,
      NOTE_IDS.length
    );

    expect(states).toEqual([
      {
        id: LIVE,
        content: LIVE_HTML,
        yjsState: liveState,
        deletedAt: null,
      },
      {
        id: TRASHED,
        content: LIVE_HTML,
        yjsState: liveState,
        deletedAt: TRASHED_AT,
      },
      {
        id: NO_STATE,
        content: NO_STATE_HTML,
        yjsState: null,
        deletedAt: null,
      },
    ]);
  });

  it('continues after the last id it returned', async () => {
    const states = await drizzleNoteImageStore(db).statesAfter(LIVE, 1);

    expect(states.map(({ id }) => id)).toEqual([TRASHED]);
  });
});
