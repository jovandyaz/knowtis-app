import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthErrorCodes, AuthErrors } from '../../../domain/errors/auth.errors';
import {
  AuthEventName,
  LoginFailedEvent,
} from '../../../domain/events/auth.events';
import type { AuthTokens } from '../../../domain/ports/token.service';
import type { UserEntity } from '../../../domain/ports/user.repository';
import { LoginUserHandler } from '../login-user.handler';
import type { ValidatedUser, ValidateUserInput } from '../login-user.handler';

function createMockUserRepository() {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    emailExists: vi.fn(),
    updatePasswordHash: vi.fn(),
    markEmailVerified: vi.fn(),
  };
}

function createMockPasswordHasher() {
  return {
    hash: vi.fn(),
    verify: vi.fn(),
  };
}

function createMockTokenService() {
  return {
    generateTokens: vi.fn(),
    verifyRefreshToken: vi.fn(),
  };
}

function createMockSessionRepository() {
  return {
    create: vi.fn(),
    findByRefreshTokenHash: vi.fn(),
    deleteById: vi.fn(),
    deleteAllByUserId: vi.fn(),
  };
}

function createValidInput(
  overrides: Partial<ValidateUserInput> = {}
): ValidateUserInput {
  return {
    email: 'user@example.com',
    password: 'StrongP@ss1',
    ...overrides,
  };
}

function createUserEntity(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-123',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    passwordHash: 'hashed_password',
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createValidatedUser(
  overrides: Partial<ValidatedUser> = {}
): ValidatedUser {
  return {
    id: 'user-123',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    ...overrides,
  };
}

function createAuthTokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-123',
    ...overrides,
  };
}

describe('LoginUserHandler', () => {
  let handler: LoginUserHandler;
  let userRepository: ReturnType<typeof createMockUserRepository>;
  let passwordHasher: ReturnType<typeof createMockPasswordHasher>;
  let tokenService: ReturnType<typeof createMockTokenService>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let eventEmitter: EventEmitter2;

  beforeEach(() => {
    userRepository = createMockUserRepository();
    passwordHasher = createMockPasswordHasher();
    tokenService = createMockTokenService();
    sessionRepository = createMockSessionRepository();
    eventEmitter = { emit: vi.fn() } as unknown as EventEmitter2;

    handler = new LoginUserHandler(
      userRepository,
      passwordHasher,
      tokenService,
      sessionRepository,
      eventEmitter
    );
  });

  describe('validateCredentials', () => {
    it('should validate credentials successfully', async () => {
      const input = createValidInput();
      const user = createUserEntity();

      userRepository.findByEmail.mockResolvedValue(user);
      passwordHasher.verify.mockResolvedValue(ok(true));

      const result = await handler.validateCredentials(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        });
      }

      expect(userRepository.findByEmail).toHaveBeenCalledOnce();
      expect(passwordHasher.verify).toHaveBeenCalledWith(
        input.password,
        user.passwordHash
      );
    });

    it('should reject non-existent user with INVALID_CREDENTIALS (not USER_NOT_FOUND)', async () => {
      const input = createValidInput();

      userRepository.findByEmail.mockResolvedValue(null);

      const result = await handler.validateCredentials(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_CREDENTIALS);
        expect(result.error.code).not.toBe(AuthErrorCodes.USER_NOT_FOUND);
      }

      expect(passwordHasher.verify).not.toHaveBeenCalled();
    });

    it('should reject wrong password with INVALID_CREDENTIALS', async () => {
      const input = createValidInput();
      const user = createUserEntity();

      userRepository.findByEmail.mockResolvedValue(user);
      passwordHasher.verify.mockResolvedValue(ok(false));

      const result = await handler.validateCredentials(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_CREDENTIALS);
      }
    });

    it('should reject invalid email format with INVALID_CREDENTIALS', async () => {
      const input = createValidInput({ email: 'not-an-email' });

      const result = await handler.validateCredentials(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_CREDENTIALS);
      }

      expect(userRepository.findByEmail).not.toHaveBeenCalled();
    });

    it('should reject user without password hash (e.g. OAuth user)', async () => {
      const input = createValidInput();
      const user = createUserEntity({
        passwordHash: null,
      });

      userRepository.findByEmail.mockResolvedValue(user);

      const result = await handler.validateCredentials(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_CREDENTIALS);
      }

      expect(passwordHasher.verify).not.toHaveBeenCalled();
    });

    it('should reject when password hasher returns an error', async () => {
      const input = createValidInput();
      const user = createUserEntity();

      userRepository.findByEmail.mockResolvedValue(user);
      passwordHasher.verify.mockResolvedValue(
        err(AuthErrors.internalError('verify failed'))
      );

      const result = await handler.validateCredentials(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INVALID_CREDENTIALS);
      }
    });

    it('should emit LOGIN_FAILED event with IP and userAgent when provided', async () => {
      const input = createValidInput({
        ipAddress: '192.168.1.1',
        userAgent: 'TestBrowser/1.0',
      });

      userRepository.findByEmail.mockResolvedValue(null);

      await handler.validateCredentials(input);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AuthEventName.LOGIN_FAILED,
        expect.objectContaining({
          email: input.email,
          ipAddress: '192.168.1.1',
          userAgent: 'TestBrowser/1.0',
        })
      );
    });

    it('should emit LOGIN_FAILED event with empty strings when context is not provided', async () => {
      const input = createValidInput();

      userRepository.findByEmail.mockResolvedValue(null);

      await handler.validateCredentials(input);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        AuthEventName.LOGIN_FAILED,
        expect.objectContaining({
          email: input.email,
          ipAddress: '',
          userAgent: '',
        })
      );
    });

    it('should emit LOGIN_FAILED event as LoginFailedEvent instance', async () => {
      const input = createValidInput({
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      userRepository.findByEmail.mockResolvedValue(null);

      await handler.validateCredentials(input);

      const emitCall = (eventEmitter.emit as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(emitCall[0]).toBe(AuthEventName.LOGIN_FAILED);
      expect(emitCall[1]).toBeInstanceOf(LoginFailedEvent);
    });
  });

  describe('login', () => {
    it('should generate tokens, create session, and return login output', async () => {
      const user = createValidatedUser();
      const tokens = createAuthTokens();

      tokenService.generateTokens.mockResolvedValue(ok(tokens));
      sessionRepository.create.mockResolvedValue(
        ok({
          id: 'session-1',
          userId: user.id,
          refreshTokenHash: 'hashed',
          userAgent: null,
          ipAddress: null,
          expiresAt: new Date(),
          createdAt: new Date(),
        })
      );

      const result = await handler.login(user);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.user).toEqual(user);
        expect(result.value.tokens).toEqual(tokens);
      }

      expect(tokenService.generateTokens).toHaveBeenCalledOnce();
      expect(sessionRepository.create).toHaveBeenCalledOnce();

      const sessionCall = sessionRepository.create.mock.calls[0][0];
      expect(sessionCall.userId).toBe(user.id);
      expect(sessionCall.refreshTokenHash).toBeDefined();
      expect(sessionCall.expiresAt).toBeInstanceOf(Date);
    });

    it('should pass session context when provided', async () => {
      const user = createValidatedUser();
      const tokens = createAuthTokens();

      tokenService.generateTokens.mockResolvedValue(ok(tokens));
      sessionRepository.create.mockResolvedValue(
        ok({
          id: 'session-1',
          userId: user.id,
          refreshTokenHash: 'hashed',
          userAgent: 'TestAgent',
          ipAddress: '10.0.0.1',
          expiresAt: new Date(),
          createdAt: new Date(),
        })
      );

      await handler.login(user, {
        userAgent: 'TestAgent',
        ipAddress: '10.0.0.1',
      });

      const sessionCall = sessionRepository.create.mock.calls[0][0];
      expect(sessionCall.userAgent).toBe('TestAgent');
      expect(sessionCall.ipAddress).toBe('10.0.0.1');
    });

    it('should handle token generation failure gracefully', async () => {
      const user = createValidatedUser();
      const tokenError = AuthErrors.internalError('token generation failed');

      tokenService.generateTokens.mockResolvedValue(err(tokenError));

      const result = await handler.login(user);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
        expect(result.error.message).toBe('token generation failed');
      }

      expect(sessionRepository.create).not.toHaveBeenCalled();
    });

    it('should handle session creation failure gracefully', async () => {
      const user = createValidatedUser();
      const tokens = createAuthTokens();
      const sessionError = AuthErrors.internalError('session creation failed');

      tokenService.generateTokens.mockResolvedValue(ok(tokens));
      sessionRepository.create.mockResolvedValue(err(sessionError));

      const result = await handler.login(user);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
        expect(result.error.message).toBe('session creation failed');
      }
    });
  });
});
