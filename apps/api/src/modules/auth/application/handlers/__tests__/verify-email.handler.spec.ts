import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthErrorCodes } from '../../../domain/errors/auth.errors';
import { hashToken } from '../../../domain/hash-token';
import type { EmailVerificationTokenEntity } from '../../../domain/ports/email-verification-token.repository';
import { VerifyEmailHandler } from '../verify-email.handler';

function createMockVerificationTokenRepository() {
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

function createVerificationTokenEntity(
  plainToken: string,
  overrides: Partial<EmailVerificationTokenEntity> = {}
): EmailVerificationTokenEntity {
  return {
    id: 'verification-token-123',
    userId: 'user-123',
    tokenHash: hashToken(plainToken),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    createdAt: new Date(),
    ...overrides,
  };
}

describe('VerifyEmailHandler', () => {
  let handler: VerifyEmailHandler;
  let verificationTokenRepository: ReturnType<
    typeof createMockVerificationTokenRepository
  >;
  let userRepository: ReturnType<typeof createMockUserRepository>;

  const validToken = 'a'.repeat(64);

  beforeEach(() => {
    verificationTokenRepository = createMockVerificationTokenRepository();
    userRepository = createMockUserRepository();

    handler = new VerifyEmailHandler(
      verificationTokenRepository,
      userRepository
    );
  });

  const unverifiedUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test',
    avatarUrl: null,
    passwordHash: 'hash',
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should verify email with a valid token', async () => {
    const token = createVerificationTokenEntity(validToken);

    verificationTokenRepository.findByTokenHash.mockResolvedValue(token);
    userRepository.findById.mockResolvedValue(unverifiedUser);
    userRepository.markEmailVerified.mockResolvedValue(ok(undefined));
    verificationTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);

    const result = await handler.execute({ token: validToken });

    expect(result.isOk()).toBe(true);

    expect(verificationTokenRepository.findByTokenHash).toHaveBeenCalledWith(
      hashToken(validToken)
    );
    expect(userRepository.markEmailVerified).toHaveBeenCalledOnce();
    expect(verificationTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(
      token.userId
    );
  });

  it('should reject invalid token (not found in DB)', async () => {
    verificationTokenRepository.findByTokenHash.mockResolvedValue(null);

    const result = await handler.execute({ token: validToken });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INVALID_VERIFICATION_TOKEN);
    }

    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('should reject expired token', async () => {
    const token = createVerificationTokenEntity(validToken, {
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    });

    verificationTokenRepository.findByTokenHash.mockResolvedValue(token);
    verificationTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);

    const result = await handler.execute({ token: validToken });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.VERIFICATION_TOKEN_EXPIRED);
    }

    expect(verificationTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(
      token.userId
    );
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('should reject if email is already verified', async () => {
    const token = createVerificationTokenEntity(validToken);

    verificationTokenRepository.findByTokenHash.mockResolvedValue(token);
    userRepository.findById.mockResolvedValue({
      ...unverifiedUser,
      emailVerifiedAt: new Date(),
    });
    verificationTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);

    const result = await handler.execute({ token: validToken });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.EMAIL_ALREADY_VERIFIED);
    }
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
    expect(verificationTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(
      token.userId
    );
  });

  it('should delete all verification tokens after successful verification', async () => {
    const token = createVerificationTokenEntity(validToken);

    verificationTokenRepository.findByTokenHash.mockResolvedValue(token);
    userRepository.findById.mockResolvedValue(unverifiedUser);
    userRepository.markEmailVerified.mockResolvedValue(ok(undefined));
    verificationTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);

    await handler.execute({ token: validToken });

    expect(verificationTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(
      token.userId
    );
  });

  it('should handle markEmailVerified failure', async () => {
    const { err } = await import('neverthrow');
    const token = createVerificationTokenEntity(validToken);

    verificationTokenRepository.findByTokenHash.mockResolvedValue(token);
    userRepository.findById.mockResolvedValue(unverifiedUser);
    userRepository.markEmailVerified.mockResolvedValue(
      err({ code: 'INTERNAL_ERROR', message: 'db error' })
    );

    const result = await handler.execute({ token: validToken });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
    }

    expect(
      verificationTokenRepository.deleteAllByUserId
    ).not.toHaveBeenCalled();
  });
});
