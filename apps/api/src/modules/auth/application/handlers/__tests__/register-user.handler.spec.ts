import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthErrorCodes, AuthErrors } from '../../../domain/errors/auth.errors';
import type { AuthTokens } from '../../../domain/ports/token.service';
import type { UserEntity } from '../../../domain/ports/user.repository';
import { RegisterUserHandler } from '../register-user.handler';
import type { RegisterUserInput } from '../register-user.handler';

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

function createMockEmailService() {
  return {
    sendPasswordReset: vi.fn(),
    sendEmailVerification: vi.fn().mockResolvedValue(ok(undefined)),
  };
}

function createMockVerificationTokenRepository() {
  return {
    create: vi.fn().mockResolvedValue(
      ok({
        id: 'token-1',
        userId: 'user-123',
        tokenHash: 'hashed_token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      })
    ),
    findByTokenHash: vi.fn(),
    deleteAllByUserId: vi.fn(),
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
  overrides: Partial<RegisterUserInput> = {}
): RegisterUserInput {
  return {
    email: 'user@example.com',
    name: 'Test User',
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

function createAuthTokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-123',
    ...overrides,
  };
}

describe('RegisterUserHandler', () => {
  let handler: RegisterUserHandler;
  let userRepository: ReturnType<typeof createMockUserRepository>;
  let passwordHasher: ReturnType<typeof createMockPasswordHasher>;
  let tokenService: ReturnType<typeof createMockTokenService>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let verificationTokenRepository: ReturnType<
    typeof createMockVerificationTokenRepository
  >;
  let eventEmitter: EventEmitter2;

  beforeEach(() => {
    userRepository = createMockUserRepository();
    passwordHasher = createMockPasswordHasher();
    tokenService = createMockTokenService();
    sessionRepository = createMockSessionRepository();
    emailService = createMockEmailService();
    verificationTokenRepository = createMockVerificationTokenRepository();
    eventEmitter = { emit: vi.fn() } as unknown as EventEmitter2;

    handler = new RegisterUserHandler(
      userRepository,
      passwordHasher,
      tokenService,
      sessionRepository,
      emailService,
      verificationTokenRepository,
      eventEmitter
    );
  });

  it('should register a new user successfully and create a session', async () => {
    const input = createValidInput();
    const user = createUserEntity();
    const tokens = createAuthTokens();

    userRepository.emailExists.mockResolvedValue(false);
    passwordHasher.hash.mockResolvedValue(ok('hashed_password'));
    userRepository.create.mockResolvedValue(ok(user));
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

    const result = await handler.execute(input);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.user).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      });
      expect(result.value.tokens).toEqual(tokens);
    }

    expect(userRepository.emailExists).toHaveBeenCalledOnce();
    expect(passwordHasher.hash).toHaveBeenCalledWith(input.password);
    expect(userRepository.create).toHaveBeenCalledWith({
      email: input.email,
      name: input.name,
      passwordHash: 'hashed_password',
    });
    expect(tokenService.generateTokens).toHaveBeenCalledOnce();
    expect(sessionRepository.create).toHaveBeenCalledOnce();

    const sessionCall = sessionRepository.create.mock.calls[0][0];
    expect(sessionCall.userId).toBe(user.id);
    expect(sessionCall.refreshTokenHash).toBeDefined();
    expect(sessionCall.expiresAt).toBeInstanceOf(Date);
  });

  it('should pass session context (userAgent, ipAddress) when provided', async () => {
    const input = createValidInput();
    const user = createUserEntity();
    const tokens = createAuthTokens();

    userRepository.emailExists.mockResolvedValue(false);
    passwordHasher.hash.mockResolvedValue(ok('hashed_password'));
    userRepository.create.mockResolvedValue(ok(user));
    tokenService.generateTokens.mockResolvedValue(ok(tokens));
    sessionRepository.create.mockResolvedValue(
      ok({
        id: 'session-1',
        userId: user.id,
        refreshTokenHash: 'hashed',
        userAgent: 'Mozilla/5.0',
        ipAddress: '127.0.0.1',
        expiresAt: new Date(),
        createdAt: new Date(),
      })
    );

    await handler.execute(input, {
      userAgent: 'Mozilla/5.0',
      ipAddress: '127.0.0.1',
    });

    const sessionCall = sessionRepository.create.mock.calls[0][0];
    expect(sessionCall.userAgent).toBe('Mozilla/5.0');
    expect(sessionCall.ipAddress).toBe('127.0.0.1');
  });

  it('should reject duplicate email', async () => {
    const input = createValidInput();

    userRepository.emailExists.mockResolvedValue(true);

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.EMAIL_ALREADY_EXISTS);
    }

    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(userRepository.create).not.toHaveBeenCalled();
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
    expect(sessionRepository.create).not.toHaveBeenCalled();
  });

  it('should reject invalid email format', async () => {
    const input = createValidInput({ email: 'not-an-email' });

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INVALID_EMAIL);
    }

    expect(userRepository.emailExists).not.toHaveBeenCalled();
    expect(passwordHasher.hash).not.toHaveBeenCalled();
  });

  it('should reject weak password (less than 8 characters)', async () => {
    const input = createValidInput({ password: 'short' });

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
    }

    expect(userRepository.emailExists).not.toHaveBeenCalled();
    expect(passwordHasher.hash).not.toHaveBeenCalled();
  });

  it('should handle password hashing failure gracefully', async () => {
    const input = createValidInput();
    const hashError = AuthErrors.internalError('hashing failed');

    userRepository.emailExists.mockResolvedValue(false);
    passwordHasher.hash.mockResolvedValue(err(hashError));

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
      expect(result.error.message).toBe('hashing failed');
    }

    expect(userRepository.create).not.toHaveBeenCalled();
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
    expect(sessionRepository.create).not.toHaveBeenCalled();
  });

  it('should handle token generation failure gracefully', async () => {
    const input = createValidInput();
    const user = createUserEntity();
    const tokenError = AuthErrors.internalError('token generation failed');

    userRepository.emailExists.mockResolvedValue(false);
    passwordHasher.hash.mockResolvedValue(ok('hashed_password'));
    userRepository.create.mockResolvedValue(ok(user));
    tokenService.generateTokens.mockResolvedValue(err(tokenError));

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
      expect(result.error.message).toBe('token generation failed');
    }

    expect(sessionRepository.create).not.toHaveBeenCalled();
  });

  it('should handle user creation failure gracefully', async () => {
    const input = createValidInput();
    const createError = AuthErrors.internalError('database error');

    userRepository.emailExists.mockResolvedValue(false);
    passwordHasher.hash.mockResolvedValue(ok('hashed_password'));
    userRepository.create.mockResolvedValue(err(createError));

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
      expect(result.error.message).toBe('database error');
    }

    expect(tokenService.generateTokens).not.toHaveBeenCalled();
    expect(sessionRepository.create).not.toHaveBeenCalled();
  });

  it('should handle session creation failure gracefully', async () => {
    const input = createValidInput();
    const user = createUserEntity();
    const tokens = createAuthTokens();
    const sessionError = AuthErrors.internalError('session creation failed');

    userRepository.emailExists.mockResolvedValue(false);
    passwordHasher.hash.mockResolvedValue(ok('hashed_password'));
    userRepository.create.mockResolvedValue(ok(user));
    tokenService.generateTokens.mockResolvedValue(ok(tokens));
    sessionRepository.create.mockResolvedValue(err(sessionError));

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
      expect(result.error.message).toBe('session creation failed');
    }
  });

  it('should reject empty email', async () => {
    const input = createValidInput({ email: '' });

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INVALID_EMAIL);
    }
  });

  it('should reject empty password', async () => {
    const input = createValidInput({ password: '' });

    const result = await handler.execute(input);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
    }
  });
});
