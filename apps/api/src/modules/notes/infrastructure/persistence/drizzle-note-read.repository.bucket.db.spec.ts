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

const OWNER = '00000000-0000-4000-8000-000000000101';
const OTHER_OWNER = '00000000-0000-4000-8000-000000000102';
const PROJECTS_NOTE = '00000000-0000-4000-8000-000000000103';
const AREAS_NOTE = '00000000-0000-4000-8000-000000000104';
const INBOX_NOTE = '00000000-0000-4000-8000-000000000105';
const ARCHIVE_NOTE = '00000000-0000-4000-8000-000000000106';
const SHARED_PROJECTS_NOTE = '00000000-0000-4000-8000-000000000107';
const DELETED_PROJECTS_NOTE = '00000000-0000-4000-8000-000000000108';

const NOTE_IDS = [
  PROJECTS_NOTE,
  AREAS_NOTE,
  INBOX_NOTE,
  ARCHIVE_NOTE,
  SHARED_PROJECTS_NOTE,
  DELETED_PROJECTS_NOTE,
];

const COUNTS_OWNER = '00000000-0000-4000-8000-000000000109';
const COUNTS_OTHER_OWNER = '00000000-0000-4000-8000-000000000110';
const COUNTS_INBOX_NOTE = '00000000-0000-4000-8000-000000000111';
const COUNTS_PROJECTS_NOTE_1 = '00000000-0000-4000-8000-000000000112';
const COUNTS_PROJECTS_NOTE_2 = '00000000-0000-4000-8000-000000000113';
const COUNTS_FOREIGN_AREAS_NOTE = '00000000-0000-4000-8000-000000000114';
const COUNTS_DELETED_ARCHIVE_NOTE = '00000000-0000-4000-8000-000000000115';

const COUNTS_NOTE_IDS = [
  COUNTS_INBOX_NOTE,
  COUNTS_PROJECTS_NOTE_1,
  COUNTS_PROJECTS_NOTE_2,
  COUNTS_FOREIGN_AREAS_NOTE,
  COUNTS_DELETED_ARCHIVE_NOTE,
];

const ALL = { page: 1, limit: 100 } as const;

describe.runIf(DB_AVAILABLE)('DrizzleNoteReadRepository bucket filter', () => {
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
      .values([
        {
          id: OWNER,
          email: `e-${OWNER}@test.local`,
          name: 'Owner',
          isAnonymous: true,
        },
        {
          id: OTHER_OWNER,
          email: `e-${OTHER_OWNER}@test.local`,
          name: 'Other',
          isAnonymous: true,
        },
      ])
      .onConflictDoNothing();
    await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
    await db.insert(notes).values([
      {
        id: PROJECTS_NOTE,
        ownerId: OWNER,
        title: 'in projects',
        content: 'body',
        bucket: 'projects',
      },
      {
        id: AREAS_NOTE,
        ownerId: OWNER,
        title: 'in areas',
        content: 'body',
        bucket: 'areas',
      },
      {
        id: INBOX_NOTE,
        ownerId: OWNER,
        title: 'unfiled',
        content: 'body',
        bucket: null,
      },
      {
        id: ARCHIVE_NOTE,
        ownerId: OWNER,
        title: 'in archive',
        content: 'body',
        bucket: 'archive',
      },
      {
        id: SHARED_PROJECTS_NOTE,
        ownerId: OTHER_OWNER,
        title: 'shared projects',
        content: 'body',
        bucket: 'projects',
      },
      {
        id: DELETED_PROJECTS_NOTE,
        ownerId: OWNER,
        title: 'deleted projects',
        content: 'body',
        bucket: 'projects',
        deletedAt: new Date(),
      },
    ]);
    await db.insert(notePermissions).values({
      noteId: SHARED_PROJECTS_NOTE,
      userId: OWNER,
      permission: PERMISSION.VIEWER,
    });
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
    await db.delete(users).where(inArray(users.id, [OWNER, OTHER_OWNER]));
    await moduleRef.close();
  });

  it('bucket filter returns only that bucket', async () => {
    const { items: rows } = await repo.findAccessibleByUser(ownerId, ALL, {
      bucket: 'projects',
    });

    expect(rows.map((row) => row.note.bucket)).toEqual([
      'projects',
      'projects',
    ]);
    expect(rows.map((row) => row.note.id).sort()).toEqual(
      [PROJECTS_NOTE, SHARED_PROJECTS_NOTE].sort()
    );
  });

  it('inbox filter returns only bucket IS NULL', async () => {
    const { items: rows } = await repo.findAccessibleByUser(ownerId, ALL, {
      bucket: 'inbox',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].note.id).toBe(INBOX_NOTE);
    expect(rows[0].note.bucket).toBeNull();
  });

  it('bucket filter includes notes shared with the caller', async () => {
    const { items: rows } = await repo.findAccessibleByUser(ownerId, ALL, {
      bucket: 'projects',
    });

    expect(rows.map((row) => row.note.id)).toContain(SHARED_PROJECTS_NOTE);
    expect(rows.find((row) => row.note.id === SHARED_PROJECTS_NOTE)).toEqual(
      expect.objectContaining({ permission: PERMISSION.VIEWER })
    );
  });

  it('soft-deleted notes never match a bucket filter', async () => {
    const { items: rows } = await repo.findAccessibleByUser(ownerId, ALL, {
      bucket: 'projects',
    });

    expect(rows.map((row) => row.note.id)).not.toContain(DELETED_PROJECTS_NOTE);
  });

  it('an unfiltered listing still carries the bucket of every note', async () => {
    const { items: rows } = await repo.findAccessibleByUser(ownerId, ALL);

    expect(
      rows
        .filter((row) => NOTE_IDS.includes(row.note.id))
        .map((row) => [row.note.id, row.note.bucket])
        .sort()
    ).toEqual(
      [
        [PROJECTS_NOTE, 'projects'],
        [AREAS_NOTE, 'areas'],
        [INBOX_NOTE, null],
        [ARCHIVE_NOTE, 'archive'],
        [SHARED_PROJECTS_NOTE, 'projects'],
      ].sort()
    );
  });
});

describe.runIf(DB_AVAILABLE)('DrizzleNoteReadRepository counts', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleNoteReadRepository;
  const ownerId = UserId.create(COUNTS_OWNER)._unsafeUnwrap();

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
      .values([
        {
          id: COUNTS_OWNER,
          email: `e-${COUNTS_OWNER}@test.local`,
          name: 'Counts Owner',
          isAnonymous: true,
        },
        {
          id: COUNTS_OTHER_OWNER,
          email: `e-${COUNTS_OTHER_OWNER}@test.local`,
          name: 'Counts Other',
          isAnonymous: true,
        },
      ])
      .onConflictDoNothing();
    await db.delete(notes).where(inArray(notes.id, COUNTS_NOTE_IDS));
    await db.insert(notes).values([
      {
        id: COUNTS_INBOX_NOTE,
        ownerId: COUNTS_OWNER,
        title: 'unfiled',
        content: 'body',
        bucket: null,
      },
      {
        id: COUNTS_PROJECTS_NOTE_1,
        ownerId: COUNTS_OWNER,
        title: 'projects one',
        content: 'body',
        bucket: 'projects',
      },
      {
        id: COUNTS_PROJECTS_NOTE_2,
        ownerId: COUNTS_OWNER,
        title: 'projects two',
        content: 'body',
        bucket: 'projects',
      },
      {
        id: COUNTS_FOREIGN_AREAS_NOTE,
        ownerId: COUNTS_OTHER_OWNER,
        title: 'shared areas',
        content: 'body',
        bucket: 'areas',
      },
      {
        id: COUNTS_DELETED_ARCHIVE_NOTE,
        ownerId: COUNTS_OWNER,
        title: 'deleted archive',
        content: 'body',
        bucket: 'archive',
        deletedAt: new Date(),
      },
    ]);
    await db.insert(notePermissions).values({
      noteId: COUNTS_FOREIGN_AREAS_NOTE,
      userId: COUNTS_OWNER,
      permission: PERMISSION.VIEWER,
    });
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.id, COUNTS_NOTE_IDS));
    await db
      .delete(users)
      .where(inArray(users.id, [COUNTS_OWNER, COUNTS_OTHER_OWNER]));
    await moduleRef.close();
  });

  it('groups counts by bucket over the accessible set, nulls as inbox', async () => {
    const counts = await repo.countAccessibleByBucket(ownerId);

    expect(counts).toEqual({
      inbox: 1,
      projects: 2,
      areas: 1,
      resources: 0,
      archive: 0,
    });
  });
});
