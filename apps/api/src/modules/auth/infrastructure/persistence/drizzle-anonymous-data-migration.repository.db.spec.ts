import { UserId } from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { ANONYMOUS_LIMITS } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  aiUsage,
  DATABASE_CONNECTION,
  DatabaseModule,
  notes,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { NoteErrorCodes } from '../../../notes/domain/errors/note.errors';
import { DrizzleNoteWriteRepository } from '../../../notes/infrastructure/persistence/drizzle-note-write.repository';
import { DrizzleAnonymousDataMigrationRepository } from './drizzle-anonymous-data-migration.repository';

const GUEST = '00000000-0000-4000-8000-00000000e801';
const REGISTERED = '00000000-0000-4000-8000-00000000e802';
const TRASHED_NOTE = '00000000-0000-4000-8000-00000000e811';
const USER_IDS = [GUEST, REGISTERED];
const RACING_TITLE = 'created while the guest was merged';
const CAPPED = { anonymousNoteCap: ANONYMOUS_LIMITS.maxNotes };
const MIGRATED = 'migrated';
const LOCK_WAIT_POLL_MS = 20;
const LOCK_WAIT_TIMEOUT_MS = 3000;

describe.runIf(DB_AVAILABLE)(
  'DrizzleAnonymousDataMigrationRepository racing a capped note write',
  () => {
    let moduleRef: TestingModule;
    let db: Database;
    let holder: postgres.Sql;
    let observer: postgres.Sql;
    let migration: DrizzleAnonymousDataMigrationRepository;
    let writes: DrizzleNoteWriteRepository;

    const until = async <T>(
      probe: () => Promise<T | undefined>
    ): Promise<T> => {
      const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
      for (;;) {
        const found = await probe();
        if (found !== undefined) {
          return found;
        }
        if (Date.now() > deadline) {
          throw new Error('no session ever reached the awaited lock wait');
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_MS));
      }
    };

    const firstWaiterOn = async (pid: number): Promise<number | undefined> => {
      const [row] = await observer<{ pid: number }[]>`
        SELECT pid FROM pg_stat_activity
        WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
      return row?.pid;
    };

    const holdGuestUsage = async (): Promise<{
      pid: number;
      release: () => Promise<void>;
    }> => {
      let confirmHeld: (pid: number) => void = () => undefined;
      let release: () => void = () => undefined;
      const held = new Promise<number>((resolve) => {
        confirmHeld = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const done = holder.begin(async (tx) => {
        const [backend] = await tx<{ pid: number }[]>`
          SELECT pg_backend_pid() AS pid`;
        await tx`SELECT id FROM ai_usage WHERE user_id = ${GUEST} FOR UPDATE`;
        confirmHeld(backend?.pid ?? 0);
        await released;
      });
      return {
        pid: await held,
        release: async () => {
          release();
          await done;
        },
      };
    };

    const startMigration = (): Promise<unknown> =>
      migration.migrateAnonymousData(GUEST, REGISTERED).then(
        () => MIGRATED,
        (error: unknown) => error
      );

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
      const databaseUrl = moduleRef
        .get(ConfigService)
        .getOrThrow<string>('DATABASE_URL');
      holder = postgres(databaseUrl, { max: 1 });
      observer = postgres(databaseUrl, { max: 1 });
      migration = new DrizzleAnonymousDataMigrationRepository(db);
      writes = new DrizzleNoteWriteRepository(db);
    });

    beforeEach(async () => {
      await db.delete(users).where(inArray(users.id, USER_IDS));
      await db.insert(users).values([
        {
          id: GUEST,
          email: `e-${GUEST}@test.local`,
          name: 'G',
          isAnonymous: true,
        },
        { id: REGISTERED, email: `e-${REGISTERED}@test.local`, name: 'R' },
      ]);
      await db
        .insert(aiUsage)
        .values({ userId: GUEST, action: 'complete', model: 'test-model' });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      await db.delete(users).where(inArray(users.id, USER_IDS));
      await holder.end();
      await observer.end();
      await moduleRef.close();
    });

    it('lets a capped restore that locked the guest wait out the merge instead of deadlocking it', async () => {
      await db.insert(notes).values({
        id: TRASHED_NOTE,
        ownerId: GUEST,
        title: 'trashed',
        content: 'body',
        deletedAt: new Date(),
      });
      const usage = await holdGuestUsage();
      const migrating = startMigration();
      const migrationPid = await until(() => firstWaiterOn(usage.pid));

      const restoring = writes.restore(TRASHED_NOTE, GUEST, CAPPED);
      await until(() => firstWaiterOn(migrationPid));
      await usage.release();

      expect(await migrating).toBe(MIGRATED);
      expect((await restoring)._unsafeUnwrapErr().code).toBe(
        NoteErrorCodes.NOTE_NOT_FOUND
      );
      const [moved] = await db
        .select({ ownerId: notes.ownerId, deletedAt: notes.deletedAt })
        .from(notes)
        .where(eq(notes.id, TRASHED_NOTE));
      expect(moved?.ownerId).toBe(REGISTERED);
      expect(moved?.deletedAt).toBeInstanceOf(Date);
    });

    it('never lets the merge cascade away a note a capped create added while it ran', async () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const usage = await holdGuestUsage();
      const migrating = startMigration();
      const migrationPid = await until(() => firstWaiterOn(usage.pid));

      let createSettled = false;
      const creating = writes
        .create(
          {
            title: RACING_TITLE,
            content: '',
            ownerId: UserId.fromTrusted(GUEST),
          },
          CAPPED
        )
        .finally(() => {
          createSettled = true;
        });
      await until(async () =>
        createSettled ? true : firstWaiterOn(migrationPid)
      );
      await usage.release();

      expect(await migrating).toBe(MIGRATED);
      const created = await creating;
      const landed = await db
        .select({ ownerId: notes.ownerId })
        .from(notes)
        .where(eq(notes.title, RACING_TITLE));
      expect(landed).toEqual(created.isOk() ? [{ ownerId: REGISTERED }] : []);
    });
  }
);
