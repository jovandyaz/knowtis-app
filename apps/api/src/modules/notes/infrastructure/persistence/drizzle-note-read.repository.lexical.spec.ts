import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
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
import { DrizzleNoteReadRepository } from './drizzle-note-read.repository';

const USER_ID = '00000000-0000-4000-8000-0000000000a3';
const OTHER_ID = '00000000-0000-4000-8000-0000000000a4';
const OTHER_NOTE = '00000000-0000-4000-8000-0000000000b3';

describe.runIf(DB_AVAILABLE)(
  'DrizzleNoteReadRepository.findAccessibleNotesByLexicalRank',
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
            id: USER_ID,
            email: `a3-${USER_ID}@test.local`,
            name: 'A3',
            isAnonymous: true,
          },
          {
            id: OTHER_ID,
            email: `a4-${OTHER_ID}@test.local`,
            name: 'A4',
            isAnonymous: true,
          },
        ])
        .onConflictDoNothing();
      await db
        .insert(notes)
        .values([
          {
            id: '00000000-0000-4000-8000-0000000000b1',
            ownerId: USER_ID,
            title: 'Project Aurora launch plan',
            content: 'aurora launch milestones and owners',
          },
          {
            id: '00000000-0000-4000-8000-0000000000b2',
            ownerId: USER_ID,
            title: 'Grocery list',
            content: 'milk eggs coffee',
          },
          {
            id: '00000000-0000-4000-8000-0000000000b4',
            ownerId: USER_ID,
            title: 'Sprint (planning)',
            content: 'tasks and owners',
          },
          {
            id: OTHER_NOTE,
            ownerId: OTHER_ID,
            title: 'Aurora launch (secrets)',
            content: 'aurora launch private notes',
          },
        ])
        .onConflictDoNothing();
    });

    afterAll(async () => {
      await db.delete(users).where(eq(users.id, USER_ID));
      await db.delete(users).where(eq(users.id, OTHER_ID));
    });

    it('ranks the lexically-relevant note first', async () => {
      const hits = await repo.findAccessibleNotesByLexicalRank(
        UserId.create(USER_ID)._unsafeUnwrap(),
        'aurora launch',
        10
      );
      expect(hits[0]?.title).toBe('Project Aurora launch plan');
    });

    it('excludes notes the user cannot access', async () => {
      const hits = await repo.findAccessibleNotesByLexicalRank(
        UserId.create(USER_ID)._unsafeUnwrap(),
        'aurora launch',
        10
      );
      expect(hits.map((h) => h.id)).not.toContain(OTHER_NOTE);
    });

    it('falls back to access-scoped ILIKE for punctuation-only queries', async () => {
      const hits = await repo.findAccessibleNotesByLexicalRank(
        UserId.create(USER_ID)._unsafeUnwrap(),
        '(',
        10
      );
      expect(hits.map((h) => h.id)).toContain(
        '00000000-0000-4000-8000-0000000000b4'
      );
      expect(hits.map((h) => h.id)).not.toContain(OTHER_NOTE);
    });
  }
);
