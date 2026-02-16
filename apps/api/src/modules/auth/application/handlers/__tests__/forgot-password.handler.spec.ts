import { EventEmitter2 } from '@nestjs/event-emitter';
import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserEntity } from '../../../domain/ports/user.repository';
import { ForgotPasswordHandler } from '../forgot-password.handler';

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

function createMockResetTokenRepository() {
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

describe('ForgotPasswordHandler', () => {
  let handler: ForgotPasswordHandler;
  let userRepository: ReturnType<typeof createMockUserRepository>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let resetTokenRepository: ReturnType<typeof createMockResetTokenRepository>;
  let eventEmitter: EventEmitter2;

  beforeEach(() => {
    userRepository = createMockUserRepository();
    emailService = createMockEmailService();
    resetTokenRepository = createMockResetTokenRepository();
    eventEmitter = { emit: vi.fn() } as unknown as EventEmitter2;

    handler = new ForgotPasswordHandler(
      userRepository,
      emailService,
      resetTokenRepository,
      eventEmitter
    );
  });

  it('should generate a reset token and send email', async () => {
    const user = createUserEntity();

    userRepository.findByEmail.mockResolvedValue(user);
    resetTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    resetTokenRepository.create.mockResolvedValue(
      ok({
        id: 'token-1',
        userId: user.id,
        tokenHash: 'hashed_token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
      })
    );
    emailService.sendPasswordReset.mockResolvedValue(ok(undefined));

    const result = await handler.execute({ email: 'user@example.com' });

    expect(result.isOk()).toBe(true);
    expect(userRepository.findByEmail).toHaveBeenCalledOnce();
    expect(resetTokenRepository.deleteAllByUserId).toHaveBeenCalledWith(
      user.id
    );
    expect(resetTokenRepository.create).toHaveBeenCalledOnce();

    const createCall = resetTokenRepository.create.mock.calls[0][0];
    expect(createCall.userId).toBe(user.id);
    expect(createCall.tokenHash).toBeDefined();
    expect(createCall.tokenHash).toHaveLength(64); // SHA-256 hex
    expect(createCall.expiresAt).toBeInstanceOf(Date);

    expect(emailService.sendPasswordReset).toHaveBeenCalledOnce();
    const emailCall = emailService.sendPasswordReset.mock.calls[0];
    expect(emailCall[0]).toBe(user.email);
    expect(emailCall[1]).toHaveLength(64); // raw token = 32 bytes hex
    expect(emailCall[2]).toBe(user.name);
  });

  it('should NOT reveal if email exists (security)', async () => {
    userRepository.findByEmail.mockResolvedValue(null);

    const result = await handler.execute({
      email: 'nonexistent@example.com',
    });

    expect(result.isOk()).toBe(true);
    expect(resetTokenRepository.create).not.toHaveBeenCalled();
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('should return success for invalid email format', async () => {
    const result = await handler.execute({ email: 'not-an-email' });

    expect(result.isOk()).toBe(true);
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
    expect(resetTokenRepository.create).not.toHaveBeenCalled();
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('should delete existing reset tokens before creating a new one', async () => {
    const user = createUserEntity();

    userRepository.findByEmail.mockResolvedValue(user);
    resetTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    resetTokenRepository.create.mockResolvedValue(
      ok({
        id: 'token-1',
        userId: user.id,
        tokenHash: 'hashed_token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
      })
    );
    emailService.sendPasswordReset.mockResolvedValue(ok(undefined));

    await handler.execute({ email: 'user@example.com' });

    const deleteOrder =
      resetTokenRepository.deleteAllByUserId.mock.invocationCallOrder[0];
    const createOrder = resetTokenRepository.create.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it('should still return success even if token creation fails', async () => {
    const user = createUserEntity();
    const { err } = await import('neverthrow');

    userRepository.findByEmail.mockResolvedValue(user);
    resetTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    resetTokenRepository.create.mockResolvedValue(
      err({ code: 'INTERNAL_ERROR', message: 'db error' })
    );

    const result = await handler.execute({ email: 'user@example.com' });

    expect(result.isOk()).toBe(true);
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('should still return success even if email sending fails', async () => {
    const user = createUserEntity();
    const { err } = await import('neverthrow');

    userRepository.findByEmail.mockResolvedValue(user);
    resetTokenRepository.deleteAllByUserId.mockResolvedValue(undefined);
    resetTokenRepository.create.mockResolvedValue(
      ok({
        id: 'token-1',
        userId: user.id,
        tokenHash: 'hashed_token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
      })
    );
    emailService.sendPasswordReset.mockResolvedValue(
      err({ code: 'EMAIL_SEND_FAILED', message: 'smtp error' })
    );

    const result = await handler.execute({ email: 'user@example.com' });

    expect(result.isOk()).toBe(true);
  });
});
