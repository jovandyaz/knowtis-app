import {
  AuthErrorCodes,
  AuthErrors,
  AuthEventName,
  EMAIL_VERIFICATION_SOURCE,
  EmailVerifiedEvent,
  UserId,
} from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PasswordHasher } from '../ports/password-hasher.port';
import type {
  PasswordResetTokenEntity,
  PasswordResetTokenRepository,
} from '../ports/password-reset-token.repository';
import type { SessionRepository } from '../ports/session.repository';
import type { UserEntity, UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';
import { ResetPasswordHandler } from './reset-password.handler';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const RESET_ROW_ID = '00000000-0000-4000-8000-0000000000b1';
const RESET_TOKEN = 'plain-reset-token';
const NEW_PASSWORD = 'Str0ng-Passw0rd!';
const ONE_MINUTE_MS = 60_000;
const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const tokenHasher = new TokenHasher(TEST_KEY);

function makeResetRow(
  overrides: Partial<PasswordResetTokenEntity> = {}
): PasswordResetTokenEntity {
  return {
    id: RESET_ROW_ID,
    userId: USER_ID,
    tokenHash: tokenHasher.hash(RESET_TOKEN),
    expiresAt: new Date(Date.now() + ONE_MINUTE_MS),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: USER_ID,
    email: 'resetter@test.local',
    name: 'Resetter',
    avatarUrl: null,
    passwordHash: 'old-hash',
    emailVerifiedAt: null,
    locale: 'en',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ResetPasswordHandler', () => {
  let resetTokenRepository: PasswordResetTokenRepository;
  let userRepository: UserRepository;
  let passwordHasher: PasswordHasher;
  let sessionRepository: SessionRepository;
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };
  let handler: ResetPasswordHandler;

  beforeEach(() => {
    resetTokenRepository = {
      findByTokenHash: vi.fn().mockResolvedValue(makeResetRow()),
      deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    } as unknown as PasswordResetTokenRepository;

    userRepository = {
      findById: vi.fn().mockResolvedValue(makeUser()),
      updatePasswordHash: vi.fn().mockResolvedValue(ok(undefined)),
      markEmailVerified: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as UserRepository;

    passwordHasher = {
      hash: vi.fn().mockResolvedValue(ok('new-hash')),
    } as unknown as PasswordHasher;

    sessionRepository = {
      deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionRepository;

    eventEmitter = { emit: vi.fn() };

    handler = new ResetPasswordHandler(
      resetTokenRepository,
      userRepository,
      passwordHasher,
      sessionRepository,
      tokenHasher,
      eventEmitter as unknown as EventEmitter2
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function reset() {
    return handler.execute({
      token: RESET_TOKEN,
      newPassword: NEW_PASSWORD,
    });
  }

  it('marks the email verified once the reset completes', async () => {
    const result = await reset();

    expect(result.isOk()).toBe(true);
    expect(userRepository.markEmailVerified).toHaveBeenCalledWith(
      UserId.fromTrusted(USER_ID)
    );
  });

  it('announces the incidental verification with its own source', async () => {
    await reset();

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      AuthEventName.EMAIL_VERIFIED,
      expect.objectContaining({
        userId: USER_ID,
        source: EMAIL_VERIFICATION_SOURCE.PASSWORD_RESET,
        verifiedAt: expect.any(Date),
      })
    );
    expect(
      eventEmitter.emit.mock.calls.find(
        ([name]) => name === AuthEventName.EMAIL_VERIFIED
      )?.[1]
    ).toBeInstanceOf(EmailVerifiedEvent);
  });

  it('revokes the sessions before marking the email verified', async () => {
    await reset();

    const revokedAt = vi.mocked(sessionRepository.deleteAllByUserId).mock
      .invocationCallOrder[0];
    const verifiedAt = vi.mocked(userRepository.markEmailVerified).mock
      .invocationCallOrder[0];
    expect(revokedAt).toBeLessThan(verifiedAt);
  });

  it('leaves an already verified email untouched', async () => {
    const verifiedAt = new Date(Date.now() - ONE_MINUTE_MS);
    vi.mocked(userRepository.findById).mockResolvedValue(
      makeUser({ emailVerifiedAt: verifiedAt })
    );

    const result = await reset();

    expect(result.isOk()).toBe(true);
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      AuthEventName.EMAIL_VERIFIED,
      expect.anything()
    );
  });

  it('still reports success when the verification flag cannot be written', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.mocked(userRepository.markEmailVerified).mockResolvedValue(
      err(AuthErrors.internalError('User not found'))
    );

    const result = await reset();

    expect(result.isOk()).toBe(true);
    expect(userRepository.updatePasswordHash).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      AuthEventName.EMAIL_VERIFIED,
      expect.anything()
    );
  });

  it('does not verify the email when the reset token is unknown', async () => {
    vi.mocked(resetTokenRepository.findByTokenHash).mockResolvedValue(null);

    const result = await reset();

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.INVALID_RESET_TOKEN
    );
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('does not verify the email when the reset token has expired', async () => {
    vi.mocked(resetTokenRepository.findByTokenHash).mockResolvedValue(
      makeResetRow({ expiresAt: new Date(Date.now() - ONE_MINUTE_MS) })
    );

    const result = await reset();

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.RESET_TOKEN_EXPIRED
    );
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('does not verify the email when the user no longer exists', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(null);

    const result = await reset();

    expect(result._unsafeUnwrapErr().code).toBe(AuthErrorCodes.USER_NOT_FOUND);
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
    expect(userRepository.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('does not verify the email when the password update fails', async () => {
    vi.mocked(userRepository.updatePasswordHash).mockResolvedValue(
      err(AuthErrors.internalError('User not found'))
    );

    const result = await reset();

    expect(result._unsafeUnwrapErr().code).toBe(AuthErrorCodes.INTERNAL_ERROR);
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
    expect(sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });
});
