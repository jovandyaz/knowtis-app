import { AuthErrorCodes } from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
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
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import { DrizzlePasswordResetTokenRepository } from './drizzle-password-reset-token.repository';

const MISSING_USER_ID = '00000000-0000-4000-8000-000000000f31';
const SECRET_TOKEN_HASH = 'sentinel-reset-token-hash';

describe.runIf(DB_AVAILABLE)(
  'DrizzlePasswordResetTokenRepository (database)',
  () => {
    let moduleRef: TestingModule;
    let repo: DrizzlePasswordResetTokenRepository;

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
      repo = new DrizzlePasswordResetTokenRepository(
        moduleRef.get<Database>(DATABASE_CONNECTION)
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      await moduleRef.close();
    });

    it('logs a rejected token by the violated constraint and answers with the fixed internal error', async () => {
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const rejected = await repo.create({
        userId: MISSING_USER_ID,
        tokenHash: SECRET_TOKEN_HASH,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      });

      expect(log.mock.calls).toEqual([
        [
          {
            operation: 'createPasswordResetToken',
            userId: MISSING_USER_ID,
            errorName: 'DrizzleQueryError',
            failureCategory: 'unclassified',
            sqlState: '23503',
            table: 'password_reset_tokens',
            constraint: 'password_reset_tokens_user_id_users_id_fk',
          },
        ],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET_TOKEN_HASH);
      expect(rejected._unsafeUnwrapErr()).toEqual({
        code: AuthErrorCodes.INTERNAL_ERROR,
        message: 'Failed to create password reset token',
      });
    });
  }
);
