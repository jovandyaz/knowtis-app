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

const OWNER = '00000000-0000-4000-8000-000000000121';
const OTHER_OWNER = '00000000-0000-4000-8000-000000000122';

const OWNED_IDS = [
  '00000000-0000-4000-8000-000000000123',
  '00000000-0000-4000-8000-000000000124',
  '00000000-0000-4000-8000-000000000125',
  '00000000-0000-4000-8000-000000000126',
];
const SHARED_ID = '00000000-0000-4000-8000-000000000127';
const NOTE_IDS = [...OWNED_IDS, SHARED_ID];

// every fixture shares one updatedAt so the id tiebreak is the only thing ordering them
const SAME_INSTANT = new Date('2026-01-01T00:00:00.000Z');

describe.runIf(DB_AVAILABLE)('DrizzleNoteReadRepository paging', () => {
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

    for (const id of [OWNER, OTHER_OWNER]) {
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

    for (const id of OWNED_IDS) {
      await db.insert(notes).values({
        id,
        ownerId: OWNER,
        title: `owned ${id.slice(-3)}`,
        content: 'body',
        updatedAt: SAME_INSTANT,
      });
    }
    await db.insert(notes).values({
      id: SHARED_ID,
      ownerId: OTHER_OWNER,
      title: 'shared',
      content: 'body',
      updatedAt: SAME_INSTANT,
    });
    await db.insert(notePermissions).values({
      noteId: SHARED_ID,
      userId: OWNER,
      permission: PERMISSION.VIEWER,
    });
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.id, NOTE_IDS));
    await db.delete(users).where(inArray(users.id, [OWNER, OTHER_OWNER]));
    await moduleRef.close();
  });

  it('limits the page while reporting the unpaged total', async () => {
    const { items, total } = await repo.findAccessibleByUser(ownerId, {
      page: 1,
      limit: 2,
    });

    expect(items).toHaveLength(2);
    expect(total).toBe(NOTE_IDS.length);
  });

  it('walks every note exactly once across pages when updatedAt ties', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= NOTE_IDS.length; page++) {
      const { items } = await repo.findAccessibleByUser(ownerId, {
        page,
        limit: 1,
      });
      seen.push(...items.map((row) => row.note.id));
    }

    expect(seen).toHaveLength(NOTE_IDS.length);
    expect([...new Set(seen)].sort()).toEqual([...NOTE_IDS].sort());
  });

  it('view=mine excludes the shared note in SQL rather than after paging', async () => {
    const { items, total } = await repo.findAccessibleByUser(
      ownerId,
      { page: 1, limit: 100 },
      { view: 'mine' }
    );

    expect(items.map((row) => row.note.id).sort()).toEqual(
      [...OWNED_IDS].sort()
    );
    expect(total).toBe(OWNED_IDS.length);
  });

  it('view=shared keeps only notes owned by somebody else', async () => {
    const { items, total } = await repo.findAccessibleByUser(
      ownerId,
      { page: 1, limit: 100 },
      { view: 'shared' }
    );

    expect(items.map((row) => row.note.id)).toEqual([SHARED_ID]);
    expect(total).toBe(1);
  });

  it('reports a filtered total rather than the whole accessible set', async () => {
    const { total } = await repo.findAccessibleByUser(
      ownerId,
      { page: 1, limit: 1 },
      { view: 'mine' }
    );

    expect(total).toBe(OWNED_IDS.length);
  });

  it('returns an empty page past the end without inventing rows', async () => {
    const { items, total } = await repo.findAccessibleByUser(ownerId, {
      page: 99,
      limit: 25,
    });

    expect(items).toEqual([]);
    expect(total).toBe(NOTE_IDS.length);
  });
});
