import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  sessions,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleSessionRepository } from './drizzle-session.repository';

const DB_USER_ID = '00000000-0000-4000-8000-000000000161';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000162';
const CURRENT_FAMILY_ID = '00000000-0000-4000-8000-000000000171';
const STALE_FAMILY_ID = '00000000-0000-4000-8000-000000000172';
const OTHER_USER_FAMILY_ID = '00000000-0000-4000-8000-000000000173';
const SESSION_EXPIRES_AT = new Date('2099-01-01T00:00:00.000Z');

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
});
