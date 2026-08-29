import { createHmac } from 'node:crypto';

import { AuthNestjsModule } from './auth.module';
import { TOKEN_HASHER } from './constants';
import { TokenHasher } from './services/token-hasher.service';

const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';

class MockUserRepository {}
class MockSessionRepository {}
class MockTokenService {}
class MockPasswordHasher {}

describe('AuthNestjsModule', () => {
  it('should be defined', () => {
    expect(AuthNestjsModule).toBeDefined();
  });

  it('should have a static register method', () => {
    expect(typeof AuthNestjsModule.register).toBe('function');
  });

  it('should return a DynamicModule from register()', () => {
    const dynamicModule = AuthNestjsModule.register({
      tokenConfig: {
        accessTokenSecret: 'test-access-secret',
        refreshTokenSecret: 'test-refresh-secret',
      },
      tokenHashKey: TEST_KEY,
      userRepository: MockUserRepository,
      sessionRepository: MockSessionRepository,
      tokenService: MockTokenService,
      passwordHasher: MockPasswordHasher,
    });

    expect(dynamicModule).toBeDefined();
    expect(dynamicModule.module).toBe(AuthNestjsModule);
    expect(dynamicModule.imports).toBeDefined();
    expect(dynamicModule.providers).toBeDefined();
    expect(dynamicModule.exports).toBeDefined();
    expect(Array.isArray(dynamicModule.providers)).toBe(true);
    expect(Array.isArray(dynamicModule.exports)).toBe(true);
  });

  it('provides and exports the token hasher built from the module key', () => {
    const dynamicModule = AuthNestjsModule.register({
      tokenConfig: {
        accessTokenSecret: 'test-access-secret',
        refreshTokenSecret: 'test-refresh-secret',
      },
      tokenHashKey: TEST_KEY,
      userRepository: MockUserRepository,
      sessionRepository: MockSessionRepository,
      tokenService: MockTokenService,
      passwordHasher: MockPasswordHasher,
    });

    const hasherProvider = (dynamicModule.providers ?? []).find(
      (provider) =>
        typeof provider === 'object' &&
        'provide' in provider &&
        provider.provide === TOKEN_HASHER
    );

    expect(hasherProvider).toEqual({
      provide: TOKEN_HASHER,
      useValue: expect.any(TokenHasher),
    });
    // Pins the digest to TEST_KEY: a register() that keyed the hasher with
    // anything other than options.tokenHashKey still satisfies expect.any.
    const hasher = (hasherProvider as { useValue: TokenHasher }).useValue;
    expect(hasher.hash('x')).toBe(
      createHmac('sha256', Buffer.from(TEST_KEY, 'base64'))
        .update('x')
        .digest('hex')
    );
    expect(dynamicModule.exports).toContain(TOKEN_HASHER);
  });

  it('refuses to register with a malformed token hash key', () => {
    expect(() =>
      AuthNestjsModule.register({
        tokenConfig: {
          accessTokenSecret: 'test-access-secret',
          refreshTokenSecret: 'test-refresh-secret',
        },
        tokenHashKey: 'too-short',
        userRepository: MockUserRepository,
        sessionRepository: MockSessionRepository,
        tokenService: MockTokenService,
        passwordHasher: MockPasswordHasher,
      })
    ).toThrow(/TOKEN_HASH_KEY must decode to 32 bytes/);
  });

  it('should include optional providers when email service and token repositories are given', () => {
    class MockEmailService {}
    class MockEmailVerificationTokenRepository {}
    class MockPasswordResetTokenRepository {}

    const dynamicModule = AuthNestjsModule.register({
      tokenConfig: {
        accessTokenSecret: 'test-access-secret',
        refreshTokenSecret: 'test-refresh-secret',
      },
      tokenHashKey: TEST_KEY,
      userRepository: MockUserRepository,
      sessionRepository: MockSessionRepository,
      tokenService: MockTokenService,
      passwordHasher: MockPasswordHasher,
      emailService: MockEmailService,
      emailVerificationTokenRepository: MockEmailVerificationTokenRepository,
      passwordResetTokenRepository: MockPasswordResetTokenRepository,
    });

    expect(dynamicModule.providers!.length).toBeGreaterThan(0);
  });
});
