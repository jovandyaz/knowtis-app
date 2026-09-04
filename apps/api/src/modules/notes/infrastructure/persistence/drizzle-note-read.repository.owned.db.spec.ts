import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
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

const OWNER = '00000000-0000-4000-8000-000000000311';
const STRANGER = '00000000-0000-4000-8000-000000000312';
const OWNED_NOTE = '00000000-0000-4000-8000-000000000313';
const OWNED_NOTE_2 = '00000000-0000-4000-8000-000000000314';
const DELETED_NOTE = '00000000-0000-4000-8000-000000000315';
const FOREIGN_NOTE = '00000000-0000-4000-8000-000000000316';
const MISSING_NOTE = '00000000-0000-4000-8000-000000000317';
const NOTE_IDS = [OWNED_NOTE, OWNED_NOTE_2, DELETED_NOTE, FOREIGN_NOTE];
const USER_IDS = [OWNER, STRANGER];

describe.runIf(DB_AVAILABLE)(
  'DrizzleNoteReadRepository.findOwnedSummariesByIds',
  () => {
    let moduleRef: TestingModule;
    let db: Database;
    let repo: DrizzleNoteReadRepository;
    const ownerId = UserId.create(OWNER)._unsafeUnwrap();

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
            isAnonymous: true,
          }))
        )
        .onConflictDoNothing();
      await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
      await db.insert(notes).values([
        {
          id: OWNED_NOTE,
          ownerId: OWNER,
          title: 'owned one',
          content: '<p>owned body one</p>',
          generalAccess: GENERAL_ACCESS.RESTRICTED,
          yjsState: Buffer.from('crdt-state-one'),
        },
        {
          id: OWNED_NOTE_2,
          ownerId: OWNER,
          title: 'owned two',
          content: '<p>owned body two</p>',
          generalAccess: GENERAL_ACCESS.RESTRICTED,
        },
        {
          id: DELETED_NOTE,
          ownerId: OWNER,
          title: 'owned but deleted',
          content: 'gone',
          generalAccess: GENERAL_ACCESS.RESTRICTED,
          deletedAt: new Date(),
        },
        {
          id: FOREIGN_NOTE,
          ownerId: STRANGER,
          title: 'someone else',
          content: 'not yours',
          generalAccess: GENERAL_ACCESS.ANYONE_WITH_LINK,
          shareToken: 'owned-spec-tok-0316',
        },
      ]);
    });

    afterAll(async () => {
      await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
      await db.delete(users).where(inArray(users.id, USER_IDS));
      await moduleRef.close();
    });

    it('returns only the live notes the user owns', async () => {
      const rows = await repo.findOwnedSummariesByIds(
        [OWNED_NOTE, OWNED_NOTE_2, DELETED_NOTE, FOREIGN_NOTE, MISSING_NOTE],
        ownerId
      );

      expect(rows.map((row) => row.id).sort()).toEqual(
        [OWNED_NOTE, OWNED_NOTE_2].sort()
      );
    });

    it('projects only id, owner, title and content, never the CRDT blob', async () => {
      const rows = await repo.findOwnedSummariesByIds([OWNED_NOTE], ownerId);

      expect(rows).toEqual([
        {
          id: OWNED_NOTE,
          ownerId: OWNER,
          title: 'owned one',
          content: '<p>owned body one</p>',
        },
      ]);
      expect(Object.keys(rows[0] ?? {})).not.toContain('yjsState');
    });

    it('returns nothing for an empty id list', async () => {
      expect(await repo.findOwnedSummariesByIds([], ownerId)).toEqual([]);
    });
  }
);
