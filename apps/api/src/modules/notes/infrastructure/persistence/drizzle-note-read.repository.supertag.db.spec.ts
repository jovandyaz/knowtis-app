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

const OWNER = '00000000-0000-4000-8000-000000000141';
const OTHER_OWNER = '00000000-0000-4000-8000-000000000142';

const PERSON_NOTE = '00000000-0000-4000-8000-000000000143';
const BOOK_NOTE = '00000000-0000-4000-8000-000000000144';
const SHARED_PERSON_NOTE = '00000000-0000-4000-8000-000000000145';
const UNREACHABLE_PERSON_NOTE = '00000000-0000-4000-8000-000000000146';
const DELETED_PERSON_NOTE = '00000000-0000-4000-8000-000000000147';

const NOTE_IDS = [
  PERSON_NOTE,
  BOOK_NOTE,
  SHARED_PERSON_NOTE,
  UNREACHABLE_PERSON_NOTE,
  DELETED_PERSON_NOTE,
];
const USER_IDS = [OWNER, OTHER_OWNER];

const FIRST_PAGE = { page: 1, limit: 25 } as const;

describe.runIf(DB_AVAILABLE)('DrizzleNoteReadRepository supertags', () => {
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

    for (const id of USER_IDS) {
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

    await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
    await db.insert(notes).values([
      {
        id: PERSON_NOTE,
        ownerId: OWNER,
        title: 'Ada',
        content: '',
        supertag: 'person',
        supertagFields: { name: 'Ada', role: null, contact: null },
      },
      {
        id: BOOK_NOTE,
        ownerId: OWNER,
        title: 'SICP',
        content: '',
        supertag: 'book',
        supertagFields: { title: 'SICP', author: null, url: null, rating: 5 },
      },
      {
        id: SHARED_PERSON_NOTE,
        ownerId: OTHER_OWNER,
        title: 'Grace',
        content: '',
        supertag: 'person',
      },
      {
        id: UNREACHABLE_PERSON_NOTE,
        ownerId: OTHER_OWNER,
        title: 'Hidden',
        content: '',
        supertag: 'person',
      },
      {
        id: DELETED_PERSON_NOTE,
        ownerId: OWNER,
        title: 'Gone',
        content: '',
        supertag: 'person',
        deletedAt: new Date(),
      },
    ]);
    await db.insert(notePermissions).values({
      noteId: SHARED_PERSON_NOTE,
      userId: OWNER,
      permission: PERMISSION.VIEWER,
    });
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
    await db.delete(users).where(inArray(users.id, USER_IDS));
    await moduleRef.close();
  });

  it('should return only the notes carrying the requested type', async () => {
    const { items, total } = await repo.findAccessibleByUser(
      ownerId,
      FIRST_PAGE,
      { supertag: 'person' }
    );

    expect(total).toBe(2);
    expect(items.map((row) => row.note.title).sort()).toEqual(['Ada', 'Grace']);
  });

  it('should count the filtered set, not every accessible note', async () => {
    const all = await repo.findAccessibleByUser(ownerId, FIRST_PAGE);
    const books = await repo.findAccessibleByUser(ownerId, FIRST_PAGE, {
      supertag: 'book',
    });

    expect(all.total).toBe(3);
    expect(books.total).toBe(1);
  });

  it('should combine the type filter with a search term', async () => {
    const { total } = await repo.findAccessibleByUser(ownerId, FIRST_PAGE, {
      supertag: 'person',
      search: 'Ada',
    });

    expect(total).toBe(1);
  });

  it('should carry the field blob through the read path', async () => {
    const { items } = await repo.findAccessibleByUser(ownerId, FIRST_PAGE, {
      supertag: 'book',
    });

    expect(items[0]?.note.supertagFields).toEqual({
      title: 'SICP',
      author: null,
      url: null,
      rating: 5,
    });
  });

  it('should count a shared note but never an inaccessible or deleted one', async () => {
    const counts = await repo.countAccessibleBySupertag(ownerId);

    expect(counts.person).toBe(2);
    expect(counts.book).toBe(1);
  });

  it('should report every catalog type, including the unused ones', async () => {
    const counts = await repo.countAccessibleBySupertag(ownerId);

    expect(counts.meeting).toBe(0);
    expect(counts.idea).toBe(0);
    expect(counts.project).toBe(0);
  });
});
