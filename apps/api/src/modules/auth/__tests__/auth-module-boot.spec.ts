import { createHmac } from 'node:crypto';

import {
  TOKEN_HASHER,
  TOKEN_SERVICE,
  TokenHasher,
} from '@jovandyaz/auth-nestjs';
import { AuthEmailService } from '@jovandyaz/email-nestjs';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { I18nService } from 'nestjs-i18n';
import { ok } from 'neverthrow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DATABASE_CONNECTION } from '../../../database';

const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const THROTTLE_TTL_MS = 60_000;
const THROTTLE_LIMIT = 60;

/**
 * `packages/auth-nestjs` and `packages/email-nestjs` each resolve their own
 * physical copy of `@nestjs/jwt` and `@nestjs/config`, so the `JwtService` and
 * `ConfigService` classes they inject are different identities than the ones
 * this app provides and Nest never matches the tokens. Only those two
 * cross-package infrastructure boundaries are replaced; the auth graph under
 * test — AuthNestjsModule.register, the handlers, AnonymousAuthService and
 * TOKEN_HASHER — is the real one.
 */
const stubTokenService = {
  generateTokens: async () => ok({ accessToken: 'at', refreshToken: 'rt' }),
  verifyRefreshToken: async () => ok({ sub: 'u1', email: 'u@test.local' }),
};

const stubEmailService = {
  sendEmailVerification: async () => ok(undefined),
  sendPasswordReset: async () => ok(undefined),
};

@Global()
@Module({
  providers: [
    { provide: DATABASE_CONNECTION, useValue: {} },
    { provide: AuthEmailService, useValue: stubEmailService },
    { provide: I18nService, useValue: { translate: (key: string) => key } },
  ],
  exports: [DATABASE_CONNECTION, AuthEmailService, I18nService],
})
class StubInfrastructureModule {}

describe('AuthModule bootstrap', () => {
  const BOOT_ENV = {
    JWT_SECRET: 'a'.repeat(40) + '-access-secret-x',
    JWT_REFRESH_SECRET: 'b'.repeat(40) + '-refresh-secret-x',
    TOKEN_HASH_KEY: TEST_KEY,
  } as const;
  const priorEnv = new Map<string, string | undefined>();

  beforeAll(() => {
    // auth.module.ts reads these with getOrThrow at import time, before Nest
    // boots, so they must land in the environment ahead of the dynamic import.
    for (const [key, value] of Object.entries(BOOT_ENV)) {
      priorEnv.set(key, process.env[key]);
      process.env[key] = value;
    }
  });

  afterAll(() => {
    for (const [key, value] of priorEnv) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
  });

  it('compiles the real module graph with the token hasher wired into AnonymousAuthService', async () => {
    const { AuthModule } = await import('../auth.module');
    const { AnonymousAuthService } =
      await import('../application/services/anonymous-auth.service');

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EventEmitterModule.forRoot(),
        // AppModule registers this globally; without it the verification
        // endpoints' UserScopedThrottlerGuard cannot resolve and boot fails.
        ThrottlerModule.forRoot([
          { ttl: THROTTLE_TTL_MS, limit: THROTTLE_LIMIT },
        ]),
        StubInfrastructureModule,
        AuthModule,
      ],
    })
      .overrideProvider(TOKEN_SERVICE)
      .useValue(stubTokenService)
      .compile();

    expect(moduleRef.get(AnonymousAuthService)).toBeInstanceOf(
      AnonymousAuthService
    );

    const hasher = moduleRef.get<TokenHasher>(TOKEN_HASHER);
    expect(hasher).toBeInstanceOf(TokenHasher);
    expect(hasher.hash('x')).toBe(
      createHmac('sha256', TEST_KEY).update('x').digest('hex')
    );

    await moduleRef.close();
  });
});
