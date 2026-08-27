import { createHmac } from 'node:crypto';

import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuthNestjsModule } from '../auth.module';
import { TOKEN_HASHER } from '../constants';
import { ForgotPasswordHandler } from '../handlers/forgot-password.handler';
import { LoginUserHandler } from '../handlers/login-user.handler';
import { LogoutUserHandler } from '../handlers/logout-user.handler';
import { RefreshTokensHandler } from '../handlers/refresh-tokens.handler';
import { RegisterUserHandler } from '../handlers/register-user.handler';
import { ResendVerificationHandler } from '../handlers/resend-verification.handler';
import { ResetPasswordHandler } from '../handlers/reset-password.handler';
import { VerifyEmailCodeHandler } from '../handlers/verify-email-code.handler';
import { VerifyEmailHandler } from '../handlers/verify-email.handler';
import { TokenHasher } from '../services/token-hasher.service';

const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';

class MockUserRepository {}
class MockSessionRepository {}
class MockTokenService {}
class MockPasswordHasher {}
class MockEmailService {}
class MockEmailVerificationTokenRepository {}
class MockPasswordResetTokenRepository {}

describe('AuthNestjsModule bootstrap', () => {
  it('resolves every handler with the token hasher injected', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EventEmitterModule.forRoot(),
        AuthNestjsModule.register({
          tokenConfig: {
            accessTokenSecret: 'a'.repeat(40),
            refreshTokenSecret: 'b'.repeat(40),
          },
          tokenHashKey: TEST_KEY,
          userRepository: MockUserRepository,
          sessionRepository: MockSessionRepository,
          tokenService: MockTokenService,
          passwordHasher: MockPasswordHasher,
          emailService: MockEmailService,
          emailVerificationTokenRepository:
            MockEmailVerificationTokenRepository,
          passwordResetTokenRepository: MockPasswordResetTokenRepository,
        }),
      ],
    }).compile();

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
      createHmac('sha256', TEST_KEY).update('x').digest('hex')
    );
    await moduleRef.close();
  });
});
