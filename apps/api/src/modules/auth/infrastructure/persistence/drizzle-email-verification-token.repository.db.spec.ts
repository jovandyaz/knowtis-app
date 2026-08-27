import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  emailVerificationTokens,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzleEmailVerificationTokenRepository } from './drizzle-email-verification-token.repository';

const DB_USER_ID = '00000000-0000-4000-8000-000000000151';

describe.runIf(DB_AVAILABLE)(
  'DrizzleEmailVerificationTokenRepository (database)',
  () => {
    let moduleRef: TestingModule;
    let db: Database;
    let repo: DrizzleEmailVerificationTokenRepository;

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
      repo = new DrizzleEmailVerificationTokenRepository(db);

      await db
        .insert(users)
        .values({
          id: DB_USER_ID,
          email: `e-${DB_USER_ID}@test.local`,
          name: 'Verification Subject',
          isAnonymous: false,
        })
        .onConflictDoNothing();
    });

    afterEach(async () => {
      await db
        .delete(emailVerificationTokens)
        .where(eq(emailVerificationTokens.userId, DB_USER_ID));
    });

    afterAll(async () => {
      await db.delete(users).where(eq(users.id, DB_USER_ID));
      await moduleRef.close();
    });

    it('creates a row with the code hash and code expiry, and finds it by user id', async () => {
      const codeExpiresAt = new Date('2026-08-26T12:05:00.000Z');
      const created = await repo.create({
        userId: DB_USER_ID,
        tokenHash: 'link-hash',
        expiresAt: new Date('2026-08-27T12:00:00.000Z'),
        codeHash: 'code-hash',
        codeExpiresAt,
      });

      expect(created.isOk()).toBe(true);

      const found = await repo.findByUserId(DB_USER_ID);

      expect(found).toMatchObject({
        userId: DB_USER_ID,
        codeHash: 'code-hash',
        attempts: 0,
      });
      expect(found?.codeExpiresAt).toEqual(codeExpiresAt);
    });

    it('returns null from findByUserId when no row exists for that user', async () => {
      expect(await repo.findByUserId(DB_USER_ID)).toBeNull();
    });

    it('increments attempts across successive sequential calls and returns the new value', async () => {
      const created = await repo.create({
        userId: DB_USER_ID,
        tokenHash: 'link-hash',
        expiresAt: new Date('2026-08-27T12:00:00.000Z'),
        codeHash: 'code-hash',
        codeExpiresAt: new Date('2026-08-26T12:05:00.000Z'),
      });
      const id = created._unsafeUnwrap().id;

      await expect(repo.incrementAttempts(id)).resolves.toBe(1);
      await expect(repo.incrementAttempts(id)).resolves.toBe(2);
    });

    it('atomically increments attempts under concurrent callers, handing each a distinct value', async () => {
      const CONCURRENT_CALLS = 10;
      const created = await repo.create({
        userId: DB_USER_ID,
        tokenHash: 'link-hash',
        expiresAt: new Date('2026-08-27T12:00:00.000Z'),
        codeHash: 'code-hash',
        codeExpiresAt: new Date('2026-08-26T12:05:00.000Z'),
      });
      const id = created._unsafeUnwrap().id;

      const results = await Promise.all(
        Array.from({ length: CONCURRENT_CALLS }, () =>
          repo.incrementAttempts(id)
        )
      );

      const [row] = await db
        .select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.id, id));

      expect(row.attempts).toBe(CONCURRENT_CALLS);
      expect([...results].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
        Array.from({ length: CONCURRENT_CALLS }, (_, index) => index + 1)
      );
    });

    it('returns null from incrementAttempts when the row is gone', async () => {
      expect(
        await repo.incrementAttempts('ffffffff-ffff-4fff-8fff-ffffffffffff')
      ).toBeNull();
    });

    it('deletes only rows whose expires_at is before the cutoff', async () => {
      const expired = await repo.create({
        userId: DB_USER_ID,
        tokenHash: 'expired-hash',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        codeHash: 'code-hash',
        codeExpiresAt: new Date('2026-08-01T00:05:00.000Z'),
      });
      const fresh = await repo.create({
        userId: DB_USER_ID,
        tokenHash: 'fresh-hash',
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
        codeHash: 'code-hash',
        codeExpiresAt: new Date('2026-09-01T00:05:00.000Z'),
      });

      await repo.deleteExpired(new Date('2026-08-15T00:00:00.000Z'));

      const [expiredRow] = await db
        .select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.id, expired._unsafeUnwrap().id));
      const [freshRow] = await db
        .select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.id, fresh._unsafeUnwrap().id));

      expect(expiredRow).toBeUndefined();
      expect(freshRow).toBeDefined();
    });
  }
);
