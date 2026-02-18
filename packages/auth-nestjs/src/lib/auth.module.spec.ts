import { AuthNestjsModule } from './auth.module';

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

  it('should include optional providers when email service and token repositories are given', () => {
    class MockEmailService {}
    class MockEmailVerificationTokenRepository {}
    class MockPasswordResetTokenRepository {}

    const dynamicModule = AuthNestjsModule.register({
      tokenConfig: {
        accessTokenSecret: 'test-access-secret',
        refreshTokenSecret: 'test-refresh-secret',
      },
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
