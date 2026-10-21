import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PERMISSION } from '@knowtis/shared-types';

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

const OWNER = '00000000-0000-4000-8000-00000000d701';
const OTHER_OWNER = '00000000-0000-4000-8000-00000000d702';
const OLDEST_MATCH = '00000000-0000-4000-8000-00000000d711';
const MIDDLE_OTHER = '00000000-0000-4000-8000-00000000d712';
const NEWER_MATCH = '00000000-0000-4000-8000-00000000d713';
const SHARED_MATCH = '00000000-0000-4000-8000-00000000d714';
const DELETED_MATCH = '00000000-0000-4000-8000-00000000d715';
const TIED_LOW = '00000000-0000-4000-8000-00000000d716';
const TIED_HIGH = '00000000-0000-4000-8000-00000000d717';
const TIE_OWNER = '00000000-0000-4000-8000-00000000d703';
const USER_IDS = [OWNER, OTHER_OWNER, TIE_OWNER];
const NOTE_IDS = [
  OLDEST_MATCH,
  MIDDLE_OTHER,
  NEWER_MATCH,
  SHARED_MATCH,
  DELETED_MATCH,
  TIED_LOW,
  TIED_HIGH,
];
const SEARCH = 'alpha';

const at = (day: number): Date => new Date(Date.UTC(2026, 0, day));

describe.runIf(DB_AVAILABLE)(
  'DrizzleNoteReadRepository.findAccessibleSummariesByUser',
  () => {
    let moduleRef: TestingModule;
    let db: Database;
    let repo: DrizzleNoteReadRepository;
    const ownerId = UserId.create(OWNER)._unsafeUnwrap();
    const tieOwnerId = UserId.create(TIE_OWNER)._unsafeUnwrap();

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
        .values(
          USER_IDS.map((id) => ({
            id,
            email: `e-${id}@test.local`,
            name: 'U',
          }))
        )
        .onConflictDoNothing();
      await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
      await db.insert(notes).values([
        {
          id: OLDEST_MATCH,
          ownerId: OWNER,
          title: 'alpha oldest',
          content: 'body',
          updatedAt: at(1),
        },
        {
          id: MIDDLE_OTHER,
          ownerId: OWNER,
          title: 'beta',
          content: 'body',
          updatedAt: at(2),
        },
        {
          id: NEWER_MATCH,
          ownerId: OWNER,
          title: 'newer',
          content: 'mentions alpha in the body',
          updatedAt: at(3),
        },
        {
          id: SHARED_MATCH,
          ownerId: OTHER_OWNER,
          title: 'alpha shared',
          content: 'body',
          updatedAt: at(4),
        },
        {
          id: DELETED_MATCH,
          ownerId: OWNER,
          title: 'alpha deleted',
          content: 'body',
          updatedAt: at(5),
          deletedAt: at(5),
        },
        {
          id: TIED_LOW,
          ownerId: TIE_OWNER,
          title: 'tied',
          content: 'body',
          updatedAt: at(1),
        },
        {
          id: TIED_HIGH,
          ownerId: TIE_OWNER,
          title: 'tied',
          content: 'body',
          updatedAt: at(1),
        },
      ]);
      await db.insert(notePermissions).values({
        noteId: SHARED_MATCH,
        userId: OWNER,
        permission: PERMISSION.VIEWER,
      });
    });

    afterAll(async () => {
      await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
      await db.delete(users).where(inArray(users.id, USER_IDS));
      await moduleRef.close();
    });

    it('returns only `limit` rows, the most recently updated first', async () => {
      const rows = await repo.findAccessibleSummariesByUser(ownerId, 2);

      expect(rows.map((row) => row.id)).toEqual([SHARED_MATCH, NEWER_MATCH]);
    });

    it('returns every accessible live note, newest first, when the limit exceeds them', async () => {
      const rows = await repo.findAccessibleSummariesByUser(ownerId, 50);

      expect(rows.map((row) => row.id)).toEqual([
        SHARED_MATCH,
        NEWER_MATCH,
        MIDDLE_OTHER,
        OLDEST_MATCH,
      ]);
    });

    it('applies the limit after the search filter', async () => {
      const rows = await repo.findAccessibleSummariesByUser(ownerId, 2, SEARCH);

      expect(rows.map((row) => row.id)).toEqual([SHARED_MATCH, NEWER_MATCH]);
    });

    it('returns every match newest first when the limit exceeds the matches', async () => {
      const rows = await repo.findAccessibleSummariesByUser(
        ownerId,
        50,
        SEARCH
      );

      expect(rows.map((row) => row.id)).toEqual([
        SHARED_MATCH,
        NEWER_MATCH,
        OLDEST_MATCH,
      ]);
    });

    it('breaks an updatedAt tie by id so a limit cuts the same row every time', async () => {
      const rows = await repo.findAccessibleSummariesByUser(tieOwnerId, 1);

      expect(rows.map((row) => row.id)).toEqual([TIED_HIGH]);
    });
  }
);
