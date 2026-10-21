import { UserId } from '@jovandyaz/auth/server';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Result } from 'neverthrow';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ANONYMOUS_LIMITS } from '@knowtis/shared-types';

import { validateEnv } from '../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  notes,
  users,
  type Database,
} from '../../../database';
import { DB_AVAILABLE } from '../../../test-support/database';
import { UsersRepository } from '../../users/users.repository';
import { UsersService } from '../../users/users.service';
import type { NoteEntity } from '../domain/entities/note.entity';
import {
  NoteErrorCodes,
  type NoteDomainError,
} from '../domain/errors/note.errors';
import { DrizzleNoteReadRepository } from '../infrastructure/persistence/drizzle-note-read.repository';
import { DrizzleNoteWriteRepository } from '../infrastructure/persistence/drizzle-note-write.repository';
import { DrizzleNoteRepository } from '../infrastructure/persistence/drizzle-note.repository';
import { AnonymousNoteLimitPolicy } from './anonymous-note-limit.policy';
import { CreateNoteHandler } from './commands/create-note.handler';
import { RestoreNoteHandler } from './commands/restore-note.handler';

const GUEST = '00000000-0000-4000-8000-00000000d801';
const MEMBER = '00000000-0000-4000-8000-00000000d802';
const GUEST_TRASHED = '00000000-0000-4000-8000-00000000d811';
const MEMBER_TRASHED = '00000000-0000-4000-8000-00000000d812';
const USER_IDS = [GUEST, MEMBER];
const CONCURRENT_CREATES = 6;
const LIMIT = ANONYMOUS_LIMITS.maxNotes;
const CONNECTION_HOLD_SECONDS = 0.05;

type NoteResult = Result<NoteEntity, NoteDomainError>;

const succeeded = (results: NoteResult[]): NoteResult[] =>
  results.filter((result) => result.isOk());

const refusalCodes = (results: NoteResult[]): string[] =>
  results.flatMap((result) => (result.isErr() ? [result.error.code] : []));

describe.runIf(DB_AVAILABLE)('anonymous note limit under concurrency', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let reads: DrizzleNoteReadRepository;
  let createNote: CreateNoteHandler;
  let restoreNote: RestoreNoteHandler;

  const ownedCount = async (userId: string): Promise<number> =>
    (await reads.countAccessibleByUser(UserId.fromTrusted(userId))).owned;

  const seedActive = async (ownerId: string, count: number): Promise<void> => {
    await db.insert(notes).values(
      Array.from({ length: count }, (_, index) => ({
        ownerId,
        title: `seeded ${index}`,
        content: 'body',
      }))
    );
  };

  const seedTrashed = async (id: string, ownerId: string): Promise<void> => {
    await db.insert(notes).values({
      id,
      ownerId,
      title: 'trashed',
      content: 'body',
      deletedAt: new Date(),
    });
  };

  const createFor = (ownerId: string, index: number): Promise<NoteResult> =>
    createNote.execute({
      title: `race ${index}`,
      ownerId,
      ...(index % 2 === 0 ? { content: `<p>race ${index}</p>` } : {}),
    });

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
    reads = new DrizzleNoteReadRepository(db);
    const policy = new AnonymousNoteLimitPolicy(
      new UsersService(new UsersRepository(db))
    );
    createNote = new CreateNoteHandler(
      new DrizzleNoteWriteRepository(db),
      new EventEmitter2(),
      policy
    );
    restoreNote = new RestoreNoteHandler(new DrizzleNoteRepository(db), policy);

    await db.delete(users).where(inArray(users.id, USER_IDS));
    await db.insert(users).values([
      {
        id: GUEST,
        email: `e-${GUEST}@test.local`,
        name: 'G',
        isAnonymous: true,
      },
      { id: MEMBER, email: `e-${MEMBER}@test.local`, name: 'M' },
    ]);
    // Opens the pool's connections up front: a write still dialling its own
    // connection starts after the first one committed, so it never races.
    await Promise.all(
      Array.from({ length: CONCURRENT_CREATES + 1 }, () =>
        db.execute(sql`SELECT pg_sleep(${CONNECTION_HOLD_SECONDS})`)
      )
    );
  });

  beforeEach(async () => {
    await db.delete(notes).where(inArray(notes.ownerId, USER_IDS));
  });

  afterAll(async () => {
    await db.delete(notes).where(inArray(notes.ownerId, USER_IDS));
    await db.delete(users).where(inArray(users.id, USER_IDS));
    await moduleRef.close();
  });

  it('lets exactly one of several concurrent creates take an anonymous owner to the limit', async () => {
    await seedActive(GUEST, LIMIT - 1);

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CREATES }, (_, index) =>
        createFor(GUEST, index)
      )
    );

    expect(succeeded(results)).toHaveLength(1);
    expect(refusalCodes(results)).toEqual(
      Array(CONCURRENT_CREATES - 1).fill(NoteErrorCodes.ANONYMOUS_NOTE_LIMIT)
    );
    expect(await ownedCount(GUEST)).toBe(LIMIT);
  });

  it('lets only one of a concurrent restore and create take an anonymous owner to the limit', async () => {
    await seedActive(GUEST, LIMIT - 1);
    await seedTrashed(GUEST_TRASHED, GUEST);

    const results = await Promise.all([
      restoreNote.execute({ noteId: GUEST_TRASHED, userId: GUEST }),
      createFor(GUEST, 0),
    ]);

    expect(succeeded(results)).toHaveLength(1);
    expect(refusalCodes(results)).toEqual([
      NoteErrorCodes.ANONYMOUS_NOTE_LIMIT,
    ]);
    expect(await ownedCount(GUEST)).toBe(LIMIT);
  });

  it('refuses a restore at the limit and leaves the note in the trash', async () => {
    await seedActive(GUEST, LIMIT);
    await seedTrashed(GUEST_TRASHED, GUEST);

    const result = await restoreNote.execute({
      noteId: GUEST_TRASHED,
      userId: GUEST,
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      NoteErrorCodes.ANONYMOUS_NOTE_LIMIT
    );
    const restored = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, GUEST_TRASHED), isNull(notes.deletedAt)));
    expect(restored).toEqual([]);
  });

  it('never caps a registered owner, however many notes they already hold', async () => {
    await seedActive(MEMBER, LIMIT);
    await seedTrashed(MEMBER_TRASHED, MEMBER);

    const results = await Promise.all([
      restoreNote.execute({ noteId: MEMBER_TRASHED, userId: MEMBER }),
      ...Array.from({ length: CONCURRENT_CREATES }, (_, index) =>
        createFor(MEMBER, index)
      ),
    ]);

    expect(refusalCodes(results)).toEqual([]);
    expect(await ownedCount(MEMBER)).toBe(LIMIT + 1 + CONCURRENT_CREATES);
  });
});
