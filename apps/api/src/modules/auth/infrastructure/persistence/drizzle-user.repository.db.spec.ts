import { AuthErrorCodes, UserId } from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
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

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { UsersRepository } from '../../../users/users.repository';
import { UsersService } from '../../../users/users.service';
import { DrizzleUserRepository } from './drizzle-user.repository';

const DB_USER_ID = '00000000-0000-4000-8000-000000000f41';
const DB_USER_EMAIL = `e-${DB_USER_ID}@test.local`;
const MALFORMED_USER_ID = UserId.fromTrusted('not-a-uuid');
const SECRET_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$sentinel-hash';

describe.runIf(DB_AVAILABLE)('DrizzleUserRepository (database)', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let repo: DrizzleUserRepository;
  let log: ReturnType<typeof vi.spyOn>;

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
    repo = new DrizzleUserRepository(new UsersService(new UsersRepository(db)));

    await db
      .insert(users)
      .values({
        id: DB_USER_ID,
        email: DB_USER_EMAIL,
        name: 'Rejected Writes Subject',
        isAnonymous: false,
      })
      .onConflictDoNothing();
  });

  beforeEach(() => {
    log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, DB_USER_ID));
    await moduleRef.close();
  });

  function expectNoPasswordHashIn(logged: unknown) {
    expect(JSON.stringify(logged)).not.toContain(SECRET_PASSWORD_HASH);
  }

  it('logs a rejected sign-up by the violated constraint and answers with the fixed internal error', async () => {
    const rejected = await repo.create({
      email: DB_USER_EMAIL,
      name: 'Duplicate',
      passwordHash: SECRET_PASSWORD_HASH,
    });

    expect(log.mock.calls).toEqual([
      [
        {
          operation: 'createUser',
          errorName: 'DrizzleQueryError',
          failureCategory: 'unique_violation',
          sqlState: '23505',
          table: 'users',
          constraint: 'users_email_unique',
        },
      ],
    ]);
    expectNoPasswordHashIn(log.mock.calls);
    expect(rejected._unsafeUnwrapErr()).toEqual({
      code: AuthErrorCodes.INTERNAL_ERROR,
      message: 'Failed to create user',
    });
  });

  it('logs a rejected password change by its SQLSTATE and answers with the fixed internal error', async () => {
    const rejected = await repo.updatePasswordHash(
      MALFORMED_USER_ID,
      SECRET_PASSWORD_HASH
    );

    expect(log.mock.calls).toEqual([
      [
        {
          operation: 'updatePasswordHash',
          userId: MALFORMED_USER_ID.value,
          errorName: 'DrizzleQueryError',
          failureCategory: 'unclassified',
          sqlState: '22P02',
        },
      ],
    ]);
    expectNoPasswordHashIn(log.mock.calls);
    expect(rejected._unsafeUnwrapErr()).toEqual({
      code: AuthErrorCodes.INTERNAL_ERROR,
      message: 'Failed to update password hash',
    });
  });

  it('logs a rejected email verification by its SQLSTATE and answers with the fixed internal error', async () => {
    const rejected = await repo.markEmailVerified(MALFORMED_USER_ID);

    expect(log.mock.calls).toEqual([
      [
        {
          operation: 'markEmailVerified',
          userId: MALFORMED_USER_ID.value,
          errorName: 'DrizzleQueryError',
          failureCategory: 'unclassified',
          sqlState: '22P02',
        },
      ],
    ]);
    expect(rejected._unsafeUnwrapErr()).toEqual({
      code: AuthErrorCodes.INTERNAL_ERROR,
      message: 'Failed to mark email verified',
    });
  });

  it('logs a rejected lookup by its SQLSTATE and finds no user', async () => {
    const found = await repo.findById(MALFORMED_USER_ID);

    expect(found).toBeNull();
    expect(log.mock.calls).toEqual([
      [
        {
          operation: 'findUserById',
          userId: MALFORMED_USER_ID.value,
          errorName: 'DrizzleQueryError',
          failureCategory: 'unclassified',
          sqlState: '22P02',
        },
      ],
    ]);
  });
});
