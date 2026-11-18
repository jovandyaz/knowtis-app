import type { DynamicModule, Provider } from '@nestjs/common';

import { AuthNestjsModule } from './auth.module';
import {
  EMAIL_SERVICE,
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  JWT_VERIFICATION_KEY_SELECTOR,
  PASSWORD_RESET_TOKEN_REPOSITORY,
  TOKEN_HASHER,
} from './constants';

const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';

class MockUserRepository {}
class MockSessionRepository {}
class MockTokenService {}
class MockPasswordHasher {}

const REQUIRED_OPTIONS = {
  useFactory: () => ({
    tokenConfig: {
      accessTokenSecret: 'test-access-secret',
      refreshTokenSecret: 'test-refresh-secret',
    },
    tokenHashKey: TEST_KEY,
  }),
  userRepository: MockUserRepository,
  sessionRepository: MockSessionRepository,
  tokenService: MockTokenService,
  passwordHasher: MockPasswordHasher,
};

const providersFor = (dynamicModule: DynamicModule, token: symbol) =>
  (dynamicModule.providers ?? []).filter(
    (provider: Provider) =>
      typeof provider === 'object' &&
      'provide' in provider &&
      provider.provide === token
  );

describe('AuthNestjsModule', () => {
  it('should be defined', () => {
    expect(AuthNestjsModule).toBeDefined();
  });

  it('should have a static registerAsync method', () => {
    expect(typeof AuthNestjsModule.registerAsync).toBe('function');
  });

  it('should return a DynamicModule from registerAsync()', () => {
    const dynamicModule = AuthNestjsModule.registerAsync(REQUIRED_OPTIONS);

    expect(dynamicModule).toBeDefined();
    expect(dynamicModule.module).toBe(AuthNestjsModule);
    expect(dynamicModule.imports).toBeDefined();
    expect(dynamicModule.providers).toBeDefined();
    expect(dynamicModule.exports).toBeDefined();
    expect(Array.isArray(dynamicModule.providers)).toBe(true);
    expect(Array.isArray(dynamicModule.exports)).toBe(true);
  });

  it('provides and exports one token hasher and one verification key selector', () => {
    const dynamicModule = AuthNestjsModule.registerAsync(REQUIRED_OPTIONS);

    expect(providersFor(dynamicModule, TOKEN_HASHER)).toHaveLength(1);
    expect(
      providersFor(dynamicModule, JWT_VERIFICATION_KEY_SELECTOR)
    ).toHaveLength(1);
    expect(dynamicModule.exports).toContain(TOKEN_HASHER);
    expect(dynamicModule.exports).toContain(JWT_VERIFICATION_KEY_SELECTOR);
  });

  it('should include optional providers when email service and token repositories are given', () => {
    class MockEmailService {}
    class MockEmailVerificationTokenRepository {}
    class MockPasswordResetTokenRepository {}

    const dynamicModule = AuthNestjsModule.registerAsync({
      ...REQUIRED_OPTIONS,
      emailService: MockEmailService,
      emailVerificationTokenRepository: MockEmailVerificationTokenRepository,
      passwordResetTokenRepository: MockPasswordResetTokenRepository,
    });

    expect(dynamicModule.exports).toEqual(
      expect.arrayContaining([
        EMAIL_SERVICE,
        EMAIL_VERIFICATION_TOKEN_REPOSITORY,
        PASSWORD_RESET_TOKEN_REPOSITORY,
      ])
    );
  });
});
