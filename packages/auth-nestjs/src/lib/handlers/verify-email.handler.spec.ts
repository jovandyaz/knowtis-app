import {
  AuthErrorCodes,
  AuthErrors,
  AuthEventName,
  EMAIL_VERIFICATION_SOURCE,
  EmailVerifiedEvent,
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
import { VerifyEmailHandler } from './verify-email.handler';

const USER_ID = '00000000-0000-4000-8000-0000000000d1';
const TOKEN_ROW_ID = '00000000-0000-4000-8000-0000000000e1';
const RAW_TOKEN = 'raw-verification-token';
const ONE_MINUTE_MS = 60_000;
const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const tokenHasher = new TokenHasher(TEST_KEY);

function makeTokenRow(
  overrides: Partial<EmailVerificationTokenEntity> = {}
): EmailVerificationTokenEntity {
  return {
    id: TOKEN_ROW_ID,
    userId: USER_ID,
    tokenHash: tokenHasher.hash(RAW_TOKEN),
    expiresAt: new Date(Date.now() + ONE_MINUTE_MS),
    codeHash: null,
    codeExpiresAt: null,
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

describe('VerifyEmailHandler', () => {
  let tokenRepository: EmailVerificationTokenRepository;
  let userRepository: UserRepository;
  let sessionRepository: SessionRepository;
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };
  let handler: VerifyEmailHandler;

  beforeEach(() => {
    tokenRepository = {
      findByTokenHash: vi.fn().mockResolvedValue(makeTokenRow()),
      deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailVerificationTokenRepository;

    userRepository = {
      findById: vi.fn().mockResolvedValue(makeUser()),
      markEmailVerified: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as UserRepository;

    sessionRepository = {
      deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionRepository;

    eventEmitter = { emit: vi.fn() };

    handler = new VerifyEmailHandler(
      tokenRepository,
      userRepository,
      tokenHasher,
      sessionRepository,
      eventEmitter as unknown as EventEmitter2
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('revokes every session for the user after a successful link verification', async () => {
    const result = await handler.execute({ token: RAW_TOKEN });

    expect(result.isOk()).toBe(true);
    expect(userRepository.markEmailVerified).toHaveBeenCalledTimes(1);
    expect(sessionRepository.deleteAllByUserId).toHaveBeenCalledWith(USER_ID);
  });

  it('announces the verification so the funnel can count it', async () => {
    await handler.execute({ token: RAW_TOKEN });

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      AuthEventName.EMAIL_VERIFIED,
      expect.objectContaining({
        userId: USER_ID,
        source: EMAIL_VERIFICATION_SOURCE.LINK,
        verifiedAt: expect.any(Date),
      })
    );
    expect(eventEmitter.emit.mock.calls[0]?.[1]).toBeInstanceOf(
      EmailVerifiedEvent
    );
  });

  it('announces nothing when the token is invalid', async () => {
    vi.mocked(tokenRepository.findByTokenHash).mockResolvedValue(null);

    await handler.execute({ token: RAW_TOKEN });

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('does not revoke sessions when the token is invalid', async () => {
    vi.mocked(tokenRepository.findByTokenHash).mockResolvedValue(null);

    const result = await handler.execute({ token: RAW_TOKEN });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.INVALID_VERIFICATION_TOKEN
    );
    expect(sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });

  it('does not revoke sessions when the token has expired', async () => {
    vi.mocked(tokenRepository.findByTokenHash).mockResolvedValue(
      makeTokenRow({ expiresAt: new Date(Date.now() - ONE_MINUTE_MS) })
    );

    const result = await handler.execute({ token: RAW_TOKEN });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.VERIFICATION_TOKEN_EXPIRED
    );
    expect(sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });

  it('does not revoke sessions when the email is already verified', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(
      makeUser({ emailVerifiedAt: new Date() })
    );

    const result = await handler.execute({ token: RAW_TOKEN });

    expect(result._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.EMAIL_ALREADY_VERIFIED
    );
    expect(sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });

  it('does not revoke sessions when marking the email verified fails', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.mocked(userRepository.markEmailVerified).mockResolvedValue(
      err(AuthErrors.internalError('User not found'))
    );

    const result = await handler.execute({ token: RAW_TOKEN });

    expect(result._unsafeUnwrapErr().code).toBe(AuthErrorCodes.INTERNAL_ERROR);
    expect(sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });
});
