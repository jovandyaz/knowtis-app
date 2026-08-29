import {
  AuthErrorCodes,
  AuthErrors,
  AuthEventName,
  EMAIL_VERIFICATION_SOURCE,
  EmailVerifiedEvent,
  VERIFICATION_CODE_MAX_ATTEMPTS,
} from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EmailVerificationTokenEntity,
  EmailVerificationTokenRepository,
} from '../ports/email-verification-token.repository';
import type { SessionRepository } from '../ports/session.repository';
import type { UserEntity, UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';
import { VerifyEmailCodeHandler } from './verify-email-code.handler';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const TOKEN_ROW_ID = '00000000-0000-4000-8000-0000000000b1';
const FAMILY_ID = '00000000-0000-4000-8000-0000000000c1';
const VALID_CODE = '123456';
const WRONG_CODE = '654321';
const ONE_MINUTE_MS = 60_000;
const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const tokenHasher = new TokenHasher(TEST_KEY);

function makeTokenRow(
  overrides: Partial<EmailVerificationTokenEntity> = {}
): EmailVerificationTokenEntity {
  return {
    id: TOKEN_ROW_ID,
    userId: USER_ID,
    tokenHash: 'link-token-hash',
    expiresAt: new Date(Date.now() + ONE_MINUTE_MS),
    codeHash: tokenHasher.hash(VALID_CODE),
    codeExpiresAt: new Date(Date.now() + ONE_MINUTE_MS),
    attempts: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: USER_ID,
    email: 'verifier@test.local',
    name: 'Verifier',
    avatarUrl: null,
    passwordHash: 'hash',
    emailVerifiedAt: null,
    locale: 'en',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('VerifyEmailCodeHandler', () => {
  let tokenRepository: EmailVerificationTokenRepository;
  let userRepository: UserRepository;
  let sessionRepository: SessionRepository;
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };
  let handler: VerifyEmailCodeHandler;

  beforeEach(() => {
    tokenRepository = {
      findByUserId: vi.fn().mockResolvedValue(makeTokenRow()),
      findByTokenHash: vi.fn().mockResolvedValue(null),
      incrementAttempts: vi.fn().mockResolvedValue(1),
      deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailVerificationTokenRepository;

    userRepository = {
      findById: vi.fn().mockResolvedValue(makeUser()),
      markEmailVerified: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as UserRepository;

    sessionRepository = {
      deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
      deleteAllByUserIdExceptFamily: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionRepository;

    eventEmitter = { emit: vi.fn() };

    handler = new VerifyEmailCodeHandler(
      tokenRepository,
      userRepository,
      sessionRepository,
      tokenHasher,
      eventEmitter as unknown as EventEmitter2
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks the email verified, clears the tokens and revokes the other session families', async () => {
    const result = await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(result.isOk()).toBe(true);
    expect(userRepository.markEmailVerified).toHaveBeenCalledTimes(1);
    expect(tokenRepository.deleteAllByUserId).toHaveBeenCalledWith(USER_ID);
    expect(
      sessionRepository.deleteAllByUserIdExceptFamily
    ).toHaveBeenCalledWith(USER_ID, FAMILY_ID);
    expect(sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });

  it('announces the verification so the funnel can count it', async () => {
    await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      AuthEventName.EMAIL_VERIFIED,
      expect.objectContaining({
        userId: USER_ID,
        source: EMAIL_VERIFICATION_SOURCE.CODE,
        verifiedAt: expect.any(Date),
      })
    );
    expect(eventEmitter.emit.mock.calls[0]?.[1]).toBeInstanceOf(
      EmailVerifiedEvent
    );
  });

  it('announces nothing when the code is wrong', async () => {
    await handler.execute({
      userId: USER_ID,
      code: WRONG_CODE,
      familyId: FAMILY_ID,
    });

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('looks the row up by user id, never by the submitted code', async () => {
    await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(tokenRepository.findByUserId).toHaveBeenCalledWith(USER_ID);
    expect(tokenRepository.findByTokenHash).not.toHaveBeenCalled();
  });

  it('burns an attempt before comparing, and rejects a wrong code', async () => {
    const result = await handler.execute({
      userId: USER_ID,
      code: WRONG_CODE,
      familyId: FAMILY_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.INVALID_VERIFICATION_CODE
    );
    expect(tokenRepository.incrementAttempts).toHaveBeenCalledWith(
      TOKEN_ROW_ID
    );
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
    expect(sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
    expect(
      sessionRepository.deleteAllByUserIdExceptFamily
    ).not.toHaveBeenCalled();
  });

  it('rejects even a correct code once the attempt cap is exceeded, and keeps the spent row', async () => {
    vi.mocked(tokenRepository.incrementAttempts).mockResolvedValue(
      VERIFICATION_CODE_MAX_ATTEMPTS + 1
    );

    const result = await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.TOO_MANY_VERIFICATION_ATTEMPTS
    );
    expect(tokenRepository.deleteAllByUserId).not.toHaveBeenCalled();
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('still accepts the attempt that lands exactly on the cap', async () => {
    vi.mocked(tokenRepository.incrementAttempts).mockResolvedValue(
      VERIFICATION_CODE_MAX_ATTEMPTS
    );

    const result = await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(result.isOk()).toBe(true);
    expect(userRepository.markEmailVerified).toHaveBeenCalledTimes(1);
  });

  it('rejects when the row vanished between the read and the increment', async () => {
    vi.mocked(tokenRepository.incrementAttempts).mockResolvedValue(null);

    const result = await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.INVALID_VERIFICATION_CODE
    );
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects an expired code', async () => {
    vi.mocked(tokenRepository.findByUserId).mockResolvedValue(
      makeTokenRow({ codeExpiresAt: new Date(Date.now() - ONE_MINUTE_MS) })
    );

    const result = await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.INVALID_VERIFICATION_CODE
    );
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects when no verification row exists for the user', async () => {
    vi.mocked(tokenRepository.findByUserId).mockResolvedValue(null);

    const result = await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.INVALID_VERIFICATION_CODE
    );
    expect(tokenRepository.incrementAttempts).not.toHaveBeenCalled();
  });

  it('rejects a code whose stored hash was keyed with a different secret', async () => {
    vi.mocked(tokenRepository.findByUserId).mockResolvedValue(
      makeTokenRow({
        codeHash: new TokenHasher(
          'JXe1kJhpqIu6RCbTvfNy4L4gCrpJfrjxwiHFBnhYyxk='
        ).hash(VALID_CODE),
      })
    );

    const result = await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.INVALID_VERIFICATION_CODE
    );
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects when the row carries no code', async () => {
    vi.mocked(tokenRepository.findByUserId).mockResolvedValue(
      makeTokenRow({ codeHash: null, codeExpiresAt: null })
    );

    const result = await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.INVALID_VERIFICATION_CODE
    );
    expect(tokenRepository.incrementAttempts).not.toHaveBeenCalled();
  });

  it('rejects a valid code for an already verified email and clears the tokens', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(
      makeUser({ emailVerifiedAt: new Date() })
    );

    const result = await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.EMAIL_ALREADY_VERIFIED
    );
    expect(tokenRepository.deleteAllByUserId).toHaveBeenCalledWith(USER_ID);
    expect(userRepository.markEmailVerified).not.toHaveBeenCalled();
    expect(
      sessionRepository.deleteAllByUserIdExceptFamily
    ).not.toHaveBeenCalled();
  });

  it('revokes the other families before marking the email verified', async () => {
    await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    const revokedAt = vi.mocked(sessionRepository.deleteAllByUserIdExceptFamily)
      .mock.invocationCallOrder[0];
    const verifiedAt = vi.mocked(userRepository.markEmailVerified).mock
      .invocationCallOrder[0];
    expect(revokedAt).toBeLessThan(verifiedAt);
  });

  it('propagates a failure to mark the email verified, sessions already revoked', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.mocked(userRepository.markEmailVerified).mockResolvedValue(
      err(AuthErrors.internalError('User not found'))
    );

    const result = await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    // Over-revoking is recoverable by signing in again; under-revoking is not,
    // because the retry answers EMAIL_ALREADY_VERIFIED and never revokes.
    expect(result._unsafeUnwrapErr().code).toBe(AuthErrorCodes.INTERNAL_ERROR);
    expect(
      sessionRepository.deleteAllByUserIdExceptFamily
    ).toHaveBeenCalledWith(USER_ID, FAMILY_ID);
  });

  it('never writes the submitted code or its hash to the log', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    vi.mocked(userRepository.markEmailVerified).mockResolvedValue(
      err(AuthErrors.internalError('User not found'))
    );

    await handler.execute({
      userId: USER_ID,
      code: VALID_CODE,
      familyId: FAMILY_ID,
    });

    const logged = JSON.stringify([
      ...errorSpy.mock.calls,
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
    ]);
    expect(logged).not.toContain(VALID_CODE);
    expect(logged).not.toContain(tokenHasher.hash(VALID_CODE));
  });
});
