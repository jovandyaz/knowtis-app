import {
  createSessionWithTokens,
  RefreshTokensHandler,
  TokenHasher,
} from '@jovandyaz/auth-nestjs';
import { AuthErrorCodes, REFRESH_TOKEN_GRACE_MS } from '@jovandyaz/auth/server';
import type { AuthDomainError, AuthTokens } from '@jovandyaz/auth/server';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import type { Result } from 'neverthrow';
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

import { validateEnv } from '../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  sessions,
  users,
  type Database,
} from '../../../database';
import { DB_AVAILABLE } from '../../../test-support/database';
import { UsersRepository } from '../../users/users.repository';
import { UsersService } from '../../users/users.service';
import { DrizzleSessionRepository } from '../infrastructure/persistence/drizzle-session.repository';
import { DrizzleUserRepository } from '../infrastructure/persistence/drizzle-user.repository';
import { JwtTokenService } from '../infrastructure/security/jwt-token.service';

const USER_ID = '00000000-0000-4000-8000-000000000641';
const FAMILY_ID = '00000000-0000-4000-8000-000000000642';
const EMAIL = `e-${USER_ID}@test.local`;
// The handler prunes rotated sessions of every user, so the clock must predate any real row.
const CLOCK_BEFORE_REAL_SESSIONS = new Date('2000-01-01T00:00:00.000Z');
const ONE_SECOND_MS = 1_000;
const REFRESHED = 'REFRESHED';
const REUSE_DETECTED = AuthErrorCodes.TOKEN_REUSE_DETECTED;

function outcome(result: Result<AuthTokens, AuthDomainError>): string {
  return result.isOk() ? REFRESHED : result.error.code;
}

describe.runIf(DB_AVAILABLE)('Refresh token rotation (database)', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let tokenService: JwtTokenService;
  let sessionRepository: DrizzleSessionRepository;
  let tokenHasher: TokenHasher;
  let handler: RefreshTokensHandler;

  const refreshToken = (result: Result<AuthTokens, AuthDomainError>) =>
    result._unsafeUnwrap().refreshToken;

  const familySessionCount = async () =>
    (
      await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.familyId, FAMILY_ID))
    ).length;

  const sessionsHoldingToken = async (token: string) =>
    (
      await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.refreshTokenHash, tokenHasher.hash(token)))
    ).length;

  const logIn = () =>
    createSessionWithTokens(
      { tokenService, sessionRepository, tokenHasher },
      { userId: USER_ID, email: EMAIL, familyId: FAMILY_ID }
    );

  const rotateTwiceInOneSecond = async () => {
    const first = await handler.execute(refreshToken(await logIn()));
    const second = await handler.execute(refreshToken(first));
    return { rotated: refreshToken(first), live: refreshToken(second) };
  };

  const passGraceWindow = () =>
    vi.setSystemTime(Date.now() + REFRESH_TOKEN_GRACE_MS + ONE_SECOND_MS);

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
    const config = moduleRef.get(ConfigService);

    tokenService = new JwtTokenService(new JwtService(), config);
    sessionRepository = new DrizzleSessionRepository(db);
    tokenHasher = new TokenHasher(config.getOrThrow('TOKEN_HASH_KEY'));
    handler = new RefreshTokensHandler(
      new DrizzleUserRepository(new UsersService(new UsersRepository(db))),
      tokenService,
      sessionRepository,
      tokenHasher,
      new EventEmitter2()
    );

    await db
      .insert(users)
      .values({
        id: USER_ID,
        email: EMAIL,
        name: 'Rotation Subject',
        isAnonymous: false,
      })
      .onConflictDoNothing();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: CLOCK_BEFORE_REAL_SESSIONS });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.delete(sessions).where(eq(sessions.userId, USER_ID));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER_ID));
    await moduleRef.close();
  });

  it('keeps the live token valid past the grace window', async () => {
    const { live } = await rotateTwiceInOneSecond();
    passGraceWindow();

    expect(outcome(await handler.execute(live))).toBe(REFRESHED);
  });

  it('rejects the rotated token replayed past the grace window and revokes its family', async () => {
    const { rotated } = await rotateTwiceInOneSecond();
    passGraceWindow();

    expect(outcome(await handler.execute(rotated))).toBe(REUSE_DETECTED);
    expect(await familySessionCount()).toBe(0);
  });

  it('rejects the rotated token replayed after its session was pruned and revokes its family', async () => {
    const { rotated, live } = await rotateTwiceInOneSecond();
    passGraceWindow();
    expect(outcome(await handler.execute(live))).toBe(REFRESHED);
    expect(await sessionsHoldingToken(rotated)).toBe(0);

    expect(outcome(await handler.execute(rotated))).toBe(REUSE_DETECTED);
    expect(await familySessionCount()).toBe(0);
  });

  it('detects reuse of a rotated token after two tabs refreshed it concurrently in one second', async () => {
    const login = await logIn();
    const firstTab = await handler.execute(refreshToken(login));
    const secondTab = await handler.execute(refreshToken(login));
    expect(outcome(secondTab)).toBe(REFRESHED);
    vi.setSystemTime(Date.now() + ONE_SECOND_MS);
    const next = await handler.execute(refreshToken(firstTab));
    passGraceWindow();
    expect(outcome(await handler.execute(refreshToken(next)))).toBe(REFRESHED);

    expect(outcome(await handler.execute(refreshToken(firstTab)))).toBe(
      REUSE_DETECTED
    );
    expect(await familySessionCount()).toBe(0);
  });
});
