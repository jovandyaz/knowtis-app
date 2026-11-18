import { createHmac } from 'node:crypto';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

import { AuthNestjsModule, type AuthSecretsOptions } from '../auth.module';
import {
  AUTH_MODULE_OPTIONS,
  JWT_VERIFICATION_KEY_SELECTOR,
  TOKEN_HASHER,
} from '../constants';
import { ForgotPasswordHandler } from '../handlers/forgot-password.handler';
import { LoginUserHandler } from '../handlers/login-user.handler';
import { LogoutUserHandler } from '../handlers/logout-user.handler';
import { RefreshTokensHandler } from '../handlers/refresh-tokens.handler';
import { RegisterUserHandler } from '../handlers/register-user.handler';
import { ResendVerificationHandler } from '../handlers/resend-verification.handler';
import { ResetPasswordHandler } from '../handlers/reset-password.handler';
import { VerifyEmailCodeHandler } from '../handlers/verify-email-code.handler';
import { VerifyEmailHandler } from '../handlers/verify-email.handler';
import type { JwtVerificationKeySelector } from '../jwt-verification-key-selector';
import { TokenHasher } from '../services/token-hasher.service';

const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';

const SECRETS: AuthSecretsOptions = {
  tokenConfig: {
    accessTokenSecret: 'a'.repeat(40),
    refreshTokenSecret: 'b'.repeat(40),
  },
  tokenHashKey: TEST_KEY,
};

class MockUserRepository {}
class MockSessionRepository {}
class MockTokenService {}
class MockPasswordHasher {}
class MockEmailService {}
class MockEmailVerificationTokenRepository {}
class MockPasswordResetTokenRepository {}

const PORTS = {
  userRepository: MockUserRepository,
  sessionRepository: MockSessionRepository,
  tokenService: MockTokenService,
  passwordHasher: MockPasswordHasher,
  emailService: MockEmailService,
  emailVerificationTokenRepository: MockEmailVerificationTokenRepository,
  passwordResetTokenRepository: MockPasswordResetTokenRepository,
};

const compileWith = (secrets: AuthSecretsOptions): Promise<TestingModule> =>
  Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      AuthNestjsModule.registerAsync({ useFactory: () => secrets, ...PORTS }),
    ],
  }).compile();

describe('AuthNestjsModule bootstrap', () => {
  it('resolves every handler with the token hasher injected', async () => {
    const moduleRef = await compileWith(SECRETS);

    for (const handler of [
      LoginUserHandler,
      RegisterUserHandler,
      RefreshTokensHandler,
      LogoutUserHandler,
      ForgotPasswordHandler,
      ResetPasswordHandler,
      VerifyEmailHandler,
      VerifyEmailCodeHandler,
      ResendVerificationHandler,
    ]) {
      expect(moduleRef.get(handler)).toBeInstanceOf(handler);
    }

    const hasher = moduleRef.get<TokenHasher>(TOKEN_HASHER);
    expect(hasher).toBeInstanceOf(TokenHasher);
    expect(hasher.hash('x')).toBe(
      createHmac('sha256', Buffer.from(TEST_KEY, 'base64'))
        .update('x')
        .digest('hex')
    );
    await moduleRef.close();
  });

  it('registerAsync resolves secrets from the factory', async () => {
    const fakeEnv = {
      JWT_SECRET: 'fake-access-secret-for-auth-module-spec',
      JWT_REFRESH_SECRET: 'fake-refresh-secret-for-auth-module-spec',
      TOKEN_HASH_KEY: TEST_KEY,
    };
    const useFactory = vi.fn(
      (config: ConfigService): AuthSecretsOptions => ({
        tokenConfig: {
          accessTokenSecret: config.getOrThrow<string>('JWT_SECRET'),
          refreshTokenSecret: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
        tokenHashKey: config.getOrThrow<string>('TOKEN_HASH_KEY'),
      })
    );

    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        AuthNestjsModule.registerAsync({
          imports: [
            ConfigModule.forRoot({
              ignoreEnvFile: true,
              load: [() => fakeEnv],
            }),
          ],
          inject: [ConfigService],
          useFactory,
          ...PORTS,
        }),
      ],
    }).compile();

    expect(
      moduleRef.get<AuthSecretsOptions>(AUTH_MODULE_OPTIONS).tokenConfig
        .accessTokenSecret
    ).toBe(fakeEnv.JWT_SECRET);
    // JwtModule and the module's own providers must share one options instance.
    expect(useFactory).toHaveBeenCalledTimes(1);

    const token = moduleRef.get(JwtService).sign({ sub: 'u1' });
    const claims = new JwtService().verify<{ iat: number; exp: number }>(
      token,
      { secret: fakeEnv.JWT_SECRET, algorithms: ['HS256'] }
    );
    expect(claims.exp - claims.iat).toBe(15 * 60);

    expect(moduleRef.get(TOKEN_HASHER)).toBeInstanceOf(TokenHasher);
    await moduleRef.close();
  });

  it('builds the verification key selector from the factory token config', async () => {
    const moduleRef = await compileWith({
      ...SECRETS,
      tokenConfig: {
        ...SECRETS.tokenConfig,
        additionalPublicKeys: [
          { kid: 'current', publicKey: 'current-public-key' },
        ],
      },
    });

    const select = moduleRef.get<JwtVerificationKeySelector>(
      JWT_VERIFICATION_KEY_SELECTOR
    );
    const header = Buffer.from(
      JSON.stringify({ alg: 'ES256', kid: 'current' })
    ).toString('base64url');
    expect(select(`${header}.payload.signature`)).toEqual({
      algorithm: 'ES256',
      publicKey: 'current-public-key',
    });
    await moduleRef.close();
  });

  it('refuses to boot with a malformed token hash key', async () => {
    await expect(
      compileWith({ ...SECRETS, tokenHashKey: 'too-short' })
    ).rejects.toThrow(/TOKEN_HASH_KEY must decode to 32 bytes/);
  });

  it('hands the resolved options to modules that import it', async () => {
    const OPTIONS_PROBE = Symbol('OPTIONS_PROBE');

    @Module({
      imports: [
        AuthNestjsModule.registerAsync({ useFactory: () => SECRETS, ...PORTS }),
      ],
      providers: [
        {
          provide: OPTIONS_PROBE,
          useFactory: (options: AuthSecretsOptions) => options,
          inject: [AUTH_MODULE_OPTIONS],
        },
      ],
    })
    class ConsumerModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), ConsumerModule],
    }).compile();

    expect(moduleRef.get(OPTIONS_PROBE)).toBe(SECRETS);
    await moduleRef.close();
  });
});
