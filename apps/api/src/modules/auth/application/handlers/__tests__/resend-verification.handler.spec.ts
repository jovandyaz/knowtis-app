import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthErrorCodes } from '../../../domain/errors/auth.errors';
import type { UserEntity } from '../../../domain/ports/user.repository';
import { ResendVerificationHandler } from '../resend-verification.handler';

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
    sendEmailVerification: vi.fn(),
  };
}

function createMockVerificationTokenRepository() {
  return {
    create: vi.fn(),
    findByTokenHash: vi.fn(),
    deleteAllByUserId: vi.fn(),
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

describe('ResendVerificationHandler', () => {
  let handler: ResendVerificationHandler;
  let userRepository: ReturnType<typeof createMockUserRepository>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let verificationTokenRepository: ReturnType<
    typeof createMockVerificationTokenRepository
  >;

  beforeEach(() => {
    userRepository = createMockUserRepository();
    emailService = createMockEmailService();
    verificationTokenRepository = createMockVerificationTokenRepository();

    handler = new ResendVerificationHandler(
      userRepository,
      emailService,
      verificationTokenRepository
    );
  });

  it('should generate a verification token and send email', async () => {
    const user = createUserEntity();

    userRepository.findById.mockResolvedValue(user);
    verificationTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    verificationTokenRepository.create.mockResolvedValue(
      ok({
        id: 'token-1',
        userId: user.id,
        tokenHash: 'hashed_token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      })
    );
    emailService.sendEmailVerification.mockResolvedValue(ok(undefined));

    const result = await handler.execute({ userId: 'user-123' });

    expect(result.isOk()).toBe(true);
    expect(userRepository.findById).toHaveBeenCalledOnce();
    expect(verificationTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(
      user.id
    );
    expect(verificationTokenRepository.create).toHaveBeenCalledOnce();

    const createCall = verificationTokenRepository.create.mock.calls[0][0];
    expect(createCall.userId).toBe(user.id);
    expect(createCall.tokenHash).toBeDefined();
    expect(createCall.tokenHash).toHaveLength(64); // SHA-256 hex
    expect(createCall.expiresAt).toBeInstanceOf(Date);

    expect(emailService.sendEmailVerification).toHaveBeenCalledOnce();
    const emailCall = emailService.sendEmailVerification.mock.calls[0];
    expect(emailCall[0]).toBe(user.email);
    expect(emailCall[1]).toHaveLength(64); // raw token = 32 bytes hex
    expect(emailCall[2]).toBe(user.name);
  });

  it('should reject if user is not found', async () => {
    userRepository.findById.mockResolvedValue(null);

    const result = await handler.execute({ userId: 'nonexistent-user' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.USER_NOT_FOUND);
    }

    expect(verificationTokenRepository.create).not.toHaveBeenCalled();
    expect(emailService.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('should reject if email is already verified', async () => {
    const user = createUserEntity({
      emailVerifiedAt: new Date(),
    });

    userRepository.findById.mockResolvedValue(user);

    const result = await handler.execute({ userId: 'user-123' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.EMAIL_ALREADY_VERIFIED);
    }

    expect(verificationTokenRepository.create).not.toHaveBeenCalled();
    expect(emailService.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('should delete existing verification tokens before creating a new one', async () => {
    const user = createUserEntity();

    userRepository.findById.mockResolvedValue(user);
    verificationTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    verificationTokenRepository.create.mockResolvedValue(
      ok({
        id: 'token-1',
        userId: user.id,
        tokenHash: 'hashed_token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      })
    );
    emailService.sendEmailVerification.mockResolvedValue(ok(undefined));

    await handler.execute({ userId: 'user-123' });

    const deleteOrder =
      verificationTokenRepository.deleteAllByUserId.mock.invocationCallOrder[0];
    const createOrder =
      verificationTokenRepository.create.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it('should return error if token creation fails', async () => {
    const user = createUserEntity();
    const { err } = await import('neverthrow');

    userRepository.findById.mockResolvedValue(user);
    verificationTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    verificationTokenRepository.create.mockResolvedValue(
      err({ code: 'INTERNAL_ERROR', message: 'db error' })
    );

    const result = await handler.execute({ userId: 'user-123' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
    }

    expect(emailService.sendEmailVerification).not.toHaveBeenCalled();
  });

  it('should return error if email sending fails', async () => {
    const user = createUserEntity();
    const { err } = await import('neverthrow');

    userRepository.findById.mockResolvedValue(user);
    verificationTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    verificationTokenRepository.create.mockResolvedValue(
      ok({
        id: 'token-1',
        userId: user.id,
        tokenHash: 'hashed_token',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      })
    );
    emailService.sendEmailVerification.mockResolvedValue(
      err({ code: 'EMAIL_SEND_FAILED', message: 'smtp error' })
    );

    const result = await handler.execute({ userId: 'user-123' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.EMAIL_SEND_FAILED);
    }
  });
});
