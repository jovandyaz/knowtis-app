import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthErrorCodes, AuthErrors } from '../../../domain/errors/auth.errors';
import { hashToken } from '../../../domain/hash-token';
import type { PasswordResetTokenEntity } from '../../../domain/ports/password-reset-token.repository';
import type { UserEntity } from '../../../domain/ports/user.repository';
import { ResetPasswordHandler } from '../reset-password.handler';

function createMockResetTokenRepository() {
  return {
    create: vi.fn(),
    findByTokenHash: vi.fn(),
    deleteAllByUserId: vi.fn(),
  };
}

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

function createMockSessionRepository() {
  return {
    create: vi.fn(),
    findByRefreshTokenHash: vi.fn(),
    deleteById: vi.fn(),
    deleteAllByUserId: vi.fn(),
  };
}

function createUserEntity(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-123',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    passwordHash: 'old_hashed_password',
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createResetTokenEntity(
  plainToken: string,
  overrides: Partial<PasswordResetTokenEntity> = {}
): PasswordResetTokenEntity {
  return {
    id: 'reset-token-123',
    userId: 'user-123',
    tokenHash: hashToken(plainToken),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ResetPasswordHandler', () => {
  let handler: ResetPasswordHandler;
  let resetTokenRepository: ReturnType<typeof createMockResetTokenRepository>;
  let userRepository: ReturnType<typeof createMockUserRepository>;
  let passwordHasher: ReturnType<typeof createMockPasswordHasher>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let eventEmitter: EventEmitter2;

  const validToken = 'a'.repeat(64);
  const validPassword = 'NewStrongP@ss1';

  beforeEach(() => {
    resetTokenRepository = createMockResetTokenRepository();
    userRepository = createMockUserRepository();
    passwordHasher = createMockPasswordHasher();
    sessionRepository = createMockSessionRepository();
    eventEmitter = { emit: vi.fn() } as unknown as EventEmitter2;

    handler = new ResetPasswordHandler(
      resetTokenRepository,
      userRepository,
      passwordHasher,
      sessionRepository,
      eventEmitter
    );
  });

  it('should reset password with valid token', async () => {
    const resetToken = createResetTokenEntity(validToken);
    const user = createUserEntity({ id: resetToken.userId });

    resetTokenRepository.findByTokenHash.mockResolvedValue(resetToken);
    userRepository.findById.mockResolvedValue(user);
    passwordHasher.hash.mockResolvedValue(ok('new_hashed_password'));
    userRepository.updatePasswordHash.mockResolvedValue(ok(undefined));
    resetTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    sessionRepository.deleteAllByUserId.mockResolvedValue(undefined);

    const result = await handler.execute({
      token: validToken,
      newPassword: validPassword,
    });

    expect(result.isOk()).toBe(true);

    expect(resetTokenRepository.findByTokenHash).toHaveBeenCalledWith(
      hashToken(validToken)
    );
    expect(passwordHasher.hash).toHaveBeenCalledWith(validPassword);
    expect(userRepository.updatePasswordHash).toHaveBeenCalledOnce();
    expect(resetTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(
      resetToken.userId
    );
    expect(sessionRepository.deleteAllByUserId).toHaveBeenCalledWith(
      resetToken.userId
    );
  });

  it('should reject expired token', async () => {
    const resetToken = createResetTokenEntity(validToken, {
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    });

    resetTokenRepository.findByTokenHash.mockResolvedValue(resetToken);
    resetTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);

    const result = await handler.execute({
      token: validToken,
      newPassword: validPassword,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.RESET_TOKEN_EXPIRED);
    }

    expect(resetTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(
      resetToken.userId
    );
    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
    expect(sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });

  it('should reject invalid token (not found in DB)', async () => {
    resetTokenRepository.findByTokenHash.mockResolvedValue(null);

    const result = await handler.execute({
      token: validToken,
      newPassword: validPassword,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INVALID_RESET_TOKEN);
    }

    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('should reject weak password', async () => {
    const result = await handler.execute({
      token: validToken,
      newPassword: 'weak',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.WEAK_PASSWORD);
    }

    expect(resetTokenRepository.findByTokenHash).not.toHaveBeenCalled();
  });

  it('should handle user not found after token validation', async () => {
    const resetToken = createResetTokenEntity(validToken);

    resetTokenRepository.findByTokenHash.mockResolvedValue(resetToken);
    userRepository.findById.mockResolvedValue(null);
    resetTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);

    const result = await handler.execute({
      token: validToken,
      newPassword: validPassword,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.USER_NOT_FOUND);
    }

    expect(resetTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(
      resetToken.userId
    );
    expect(passwordHasher.hash).not.toHaveBeenCalled();
  });

  it('should handle password hashing failure', async () => {
    const resetToken = createResetTokenEntity(validToken);
    const user = createUserEntity({ id: resetToken.userId });

    resetTokenRepository.findByTokenHash.mockResolvedValue(resetToken);
    userRepository.findById.mockResolvedValue(user);
    passwordHasher.hash.mockResolvedValue(
      err(AuthErrors.internalError('hashing failed'))
    );

    const result = await handler.execute({
      token: validToken,
      newPassword: validPassword,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
    }

    expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('should handle password update failure', async () => {
    const resetToken = createResetTokenEntity(validToken);
    const user = createUserEntity({ id: resetToken.userId });

    resetTokenRepository.findByTokenHash.mockResolvedValue(resetToken);
    userRepository.findById.mockResolvedValue(user);
    passwordHasher.hash.mockResolvedValue(ok('new_hashed_password'));
    userRepository.updatePasswordHash.mockResolvedValue(
      err(AuthErrors.internalError('update failed'))
    );

    const result = await handler.execute({
      token: validToken,
      newPassword: validPassword,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
    }

    // Should not have cleaned up tokens or sessions since update failed
    expect(resetTokenRepository.deleteAllByUserId).not.toHaveBeenCalled();
    expect(sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });

  it('should invalidate all sessions after successful password reset', async () => {
    const resetToken = createResetTokenEntity(validToken);
    const user = createUserEntity({ id: resetToken.userId });

    resetTokenRepository.findByTokenHash.mockResolvedValue(resetToken);
    userRepository.findById.mockResolvedValue(user);
    passwordHasher.hash.mockResolvedValue(ok('new_hashed_password'));
    userRepository.updatePasswordHash.mockResolvedValue(ok(undefined));
    resetTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    sessionRepository.deleteAllByUserId.mockResolvedValue(undefined);

    await handler.execute({
      token: validToken,
      newPassword: validPassword,
    });

    expect(sessionRepository.deleteAllByUserId).toHaveBeenCalledWith(
      resetToken.userId
    );
  });

  it('should delete all reset tokens after successful password reset', async () => {
    const resetToken = createResetTokenEntity(validToken);
    const user = createUserEntity({ id: resetToken.userId });

    resetTokenRepository.findByTokenHash.mockResolvedValue(resetToken);
    userRepository.findById.mockResolvedValue(user);
    passwordHasher.hash.mockResolvedValue(ok('new_hashed_password'));
    userRepository.updatePasswordHash.mockResolvedValue(ok(undefined));
    resetTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    sessionRepository.deleteAllByUserId.mockResolvedValue(undefined);

    await handler.execute({
      token: validToken,
      newPassword: validPassword,
    });

    expect(resetTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(
      resetToken.userId
    );
  });
});
