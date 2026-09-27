import { AuthErrorCodes } from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  sessions,
  users,
  type Database,
} from '../../../../database';
import { isUniqueViolation } from '../../../../database/unique-violation';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleSessionRepository } from './drizzle-session.repository';

const DB_USER_ID = '00000000-0000-4000-8000-000000000161';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000162';
const CURRENT_FAMILY_ID = '00000000-0000-4000-8000-000000000171';
const STALE_FAMILY_ID = '00000000-0000-4000-8000-000000000172';
const OTHER_USER_FAMILY_ID = '00000000-0000-4000-8000-000000000173';
const MISSING_USER_ID = '00000000-0000-4000-8000-000000000f11';
const SECRET_REFRESH_TOKEN_HASH = 'sentinel-refresh-token-hash';
const SECRET_USER_AGENT = 'sentinel-user-agent';
const SECRET_IP_ADDRESS = '203.0.113.77';
const SESSION_EXPIRES_AT = new Date('2099-01-01T00:00:00.000Z');
const REFRESH_TOKEN_HASH_INDEX = 'sessions_refresh_token_hash_idx';
const COLLIDING_HASH = 'colliding-refresh-token-hash';

describe.runIf(DB_AVAILABLE)('DrizzleSessionRepository (database)', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleSessionRepository;

  const createSession = (userId: string, familyId: string, hash: string) =>
    repo.create({
      userId,
      familyId,
      refreshTokenHash: hash,
      expiresAt: SESSION_EXPIRES_AT,
    });

  const insertSessionRow = (refreshTokenHash: string) =>
    db.insert(sessions).values({
      userId: DB_USER_ID,
      familyId: CURRENT_FAMILY_ID,
      refreshTokenHash,
      expiresAt: SESSION_EXPIRES_AT,
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
    repo = new DrizzleSessionRepository(db);

    await db
      .insert(users)
      .values([
        {
          id: DB_USER_ID,
          email: `e-${DB_USER_ID}@test.local`,
          name: 'Session Subject',
          isAnonymous: false,
        },
        {
          id: OTHER_USER_ID,
          email: `e-${OTHER_USER_ID}@test.local`,
          name: 'Session Bystander',
          isAnonymous: false,
        },
      ])
      .onConflictDoNothing();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db
      .delete(sessions)
      .where(inArray(sessions.userId, [DB_USER_ID, OTHER_USER_ID]));
  });

  afterAll(async () => {
    await db
      .delete(users)
      .where(inArray(users.id, [DB_USER_ID, OTHER_USER_ID]));
    await moduleRef.close();
  });

  it('deletes the user sessions outside the kept family, leaving other users untouched', async () => {
    const kept = await createSession(
      DB_USER_ID,
      CURRENT_FAMILY_ID,
      'kept-hash'
    );
    const keptSibling = await createSession(
      DB_USER_ID,
      CURRENT_FAMILY_ID,
      'kept-sibling-hash'
    );
    const stale = await createSession(
      DB_USER_ID,
      STALE_FAMILY_ID,
      'stale-hash'
    );
    const bystander = await createSession(
      OTHER_USER_ID,
      OTHER_USER_FAMILY_ID,
      'bystander-hash'
    );

    await repo.deleteAllByUserIdExceptFamily(DB_USER_ID, CURRENT_FAMILY_ID);

    const remaining = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(inArray(sessions.userId, [DB_USER_ID, OTHER_USER_ID]));

    expect(remaining.map((row) => row.id).sort()).toEqual(
      [
        kept._unsafeUnwrap().id,
        keptSibling._unsafeUnwrap().id,
        bystander._unsafeUnwrap().id,
      ].sort()
    );
    expect(remaining).not.toContainEqual({ id: stale._unsafeUnwrap().id });
  });

  it('leaves nothing behind when the kept family has no sessions', async () => {
    await createSession(DB_USER_ID, STALE_FAMILY_ID, 'stale-hash');

    await repo.deleteAllByUserIdExceptFamily(DB_USER_ID, CURRENT_FAMILY_ID);

    const remaining = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, DB_USER_ID));

    expect(remaining).toEqual([]);
  });

  describe('a session the database rejects', () => {
    const createForMissingUser = () =>
      repo.create({
        userId: MISSING_USER_ID,
        familyId: CURRENT_FAMILY_ID,
        refreshTokenHash: SECRET_REFRESH_TOKEN_HASH,
        userAgent: SECRET_USER_AGENT,
        ipAddress: SECRET_IP_ADDRESS,
        expiresAt: SESSION_EXPIRES_AT,
      });

    it('is logged by the violated constraint, never by the values it carried', async () => {
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await createForMissingUser();

      expect(log.mock.calls).toEqual([
        [
          {
            operation: 'createSession',
            userId: MISSING_USER_ID,
            errorName: 'DrizzleQueryError',
            failureCategory: 'unclassified',
            sqlState: '23503',
            table: 'sessions',
            constraint: 'sessions_user_id_users_id_fk',
          },
        ],
      ]);
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).not.toContain(SECRET_REFRESH_TOKEN_HASH);
      expect(logged).not.toContain(SECRET_USER_AGENT);
      expect(logged).not.toContain(SECRET_IP_ADDRESS);
    });

    it('answers with the fixed internal error', async () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const rejected = await createForMissingUser();

      expect(rejected._unsafeUnwrapErr()).toEqual({
        code: AuthErrorCodes.INTERNAL_ERROR,
        message: 'Failed to create session',
      });
    });

    it('rejects a second session holding an existing refresh token hash', async () => {
      await insertSessionRow(COLLIDING_HASH);

      const outcome = await insertSessionRow(COLLIDING_HASH).catch(
        (error: unknown) => error
      );

      expect(isUniqueViolation(outcome, REFRESH_TOKEN_HASH_INDEX)).toBe(true);
    });

    it('logs a session colliding on its refresh token hash by the unique index, never by the hash', async () => {
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      await createSession(DB_USER_ID, CURRENT_FAMILY_ID, COLLIDING_HASH);

      await createSession(DB_USER_ID, CURRENT_FAMILY_ID, COLLIDING_HASH);

      expect(log.mock.calls).toEqual([
        [
          {
            operation: 'createSession',
            userId: DB_USER_ID,
            errorName: 'DrizzleQueryError',
            failureCategory: 'unique_violation',
            sqlState: '23505',
            table: 'sessions',
            constraint: REFRESH_TOKEN_HASH_INDEX,
          },
        ],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain(COLLIDING_HASH);
    });

    it('answers a session colliding on its refresh token hash with the fixed internal error', async () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await createSession(DB_USER_ID, CURRENT_FAMILY_ID, COLLIDING_HASH);

      const collision = await createSession(
        DB_USER_ID,
        CURRENT_FAMILY_ID,
        COLLIDING_HASH
      );

      expect(collision._unsafeUnwrapErr()).toEqual({
        code: AuthErrorCodes.INTERNAL_ERROR,
        message: 'Failed to create session',
      });
    });
  });
});
