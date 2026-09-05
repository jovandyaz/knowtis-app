import {
  AuthErrorCodes,
  VERIFICATION_CODE_EXPIRY_MS,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_RESEND_COOLDOWN_MS,
  VERIFICATION_TOKEN_EXPIRY_MS,
} from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EmailVerificationTokenEntity,
  EmailVerificationTokenRepository,
} from '../ports/email-verification-token.repository';
import type { EmailService } from '../ports/email.service';
import type { UserEntity, UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';
import { VerificationEmailIssuer } from '../services/verification-email-issuer.service';
import { ResendVerificationHandler } from './resend-verification.handler';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const TOKEN_ROW_ID = '00000000-0000-4000-8000-0000000000b1';
const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const tokenHasher = new TokenHasher(TEST_KEY);

function makeTokenRow(
  overrides: Partial<EmailVerificationTokenEntity> = {}
): EmailVerificationTokenEntity {
  return {
    id: TOKEN_ROW_ID,
    userId: USER_ID,
    tokenHash: 'link-token-hash',
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS),
    codeHash: 'code-hash',
    codeExpiresAt: new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MS),
    attempts: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: USER_ID,
    email: 'resender@test.local',
    name: 'Resender',
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

const CODE_PATTERN = new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`);

describe('ResendVerificationHandler', () => {
  let userRepository: UserRepository;
  let emailService: EmailService;
  let tokenRepository: EmailVerificationTokenRepository;
  let handler: ResendVerificationHandler;

  beforeEach(() => {
    userRepository = {
      findById: vi.fn().mockResolvedValue(makeUser()),
    } as unknown as UserRepository;

    emailService = {
      sendEmailVerification: vi.fn().mockResolvedValue(ok(undefined)),
      sendPasswordReset: vi.fn().mockResolvedValue(ok(undefined)),
    };

    tokenRepository = {
      findByUserId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(ok({ id: 'verification-1' })),
      replaceIfOlderThan: vi.fn().mockResolvedValue(ok(makeTokenRow())),
      deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    } as unknown as EmailVerificationTokenRepository;

    handler = new ResendVerificationHandler(
      userRepository,
      new VerificationEmailIssuer(tokenRepository, emailService, tokenHasher)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function sentPayload(): { token: string; code: string } {
    const [, payload] = vi.mocked(emailService.sendEmailVerification).mock
      .calls[0];
    return payload;
  }

  it('delivers a fresh code and link token matching the hashes it stored', async () => {
    const result = await handler.execute({ userId: USER_ID });

    expect(result.isOk()).toBe(true);
    const payload = sentPayload();
    expect(payload.code).toMatch(CODE_PATTERN);

    const [stored] = vi.mocked(tokenRepository.replaceIfOlderThan).mock
      .calls[0];
    expect(stored.codeHash).toBe(tokenHasher.hash(payload.code));
    expect(stored.tokenHash).toBe(tokenHasher.hash(payload.token));
  });

  it('sends the email in the locale stored on the user', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(
      makeUser({ locale: 'es' })
    );

    await handler.execute({ userId: USER_ID });

    expect(emailService.sendEmailVerification).toHaveBeenCalledWith(
      'resender@test.local',
      expect.anything(),
      'Resender',
      'es'
    );
  });

  it('falls back to no locale when the user has none', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue(
      makeUser({ locale: null })
    );

    await handler.execute({ userId: USER_ID });

    expect(emailService.sendEmailVerification).toHaveBeenCalledWith(
      'resender@test.local',
      expect.anything(),
      'Resender',
      undefined
    );
  });

  describe('resend cooldown', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
    });

    it('lets the database decide with the cooldown as the minimum row age', async () => {
      const result = await handler.execute({ userId: USER_ID });

      expect(result.isOk()).toBe(true);
      expect(tokenRepository.replaceIfOlderThan).toHaveBeenCalledTimes(1);
      const [, minAgeMs] = vi.mocked(tokenRepository.replaceIfOlderThan).mock
        .calls[0];
      expect(minAgeMs).toBe(VERIFICATION_RESEND_COOLDOWN_MS);
      expect(emailService.sendEmailVerification).toHaveBeenCalledTimes(1);
      expect(tokenRepository.deleteAllByUserId).not.toHaveBeenCalled();
      expect(tokenRepository.findByUserId).not.toHaveBeenCalled();
      expect(tokenRepository.create).not.toHaveBeenCalled();
    });

    it('reports the wait that is actually left when the database refuses the replacement', async () => {
      vi.mocked(tokenRepository.replaceIfOlderThan).mockResolvedValue(ok(null));
      vi.mocked(tokenRepository.findByUserId).mockResolvedValue(
        makeTokenRow({ createdAt: new Date() })
      );
      vi.advanceTimersByTime(15_000);

      const error = (
        await handler.execute({ userId: USER_ID })
      )._unsafeUnwrapErr();

      expect(error.code).toBe(AuthErrorCodes.RESEND_COOLDOWN);
      expect(error.retryAfterMs).toBe(VERIFICATION_RESEND_COOLDOWN_MS - 15_000);
      expect(emailService.sendEmailVerification).not.toHaveBeenCalled();
      expect(tokenRepository.deleteAllByUserId).not.toHaveBeenCalled();
    });

    it('quotes the whole cooldown when the refusing row vanished before it could be read', async () => {
      vi.mocked(tokenRepository.replaceIfOlderThan).mockResolvedValue(ok(null));
      vi.mocked(tokenRepository.findByUserId).mockResolvedValue(null);

      const error = (
        await handler.execute({ userId: USER_ID })
      )._unsafeUnwrapErr();

      expect(error.code).toBe(AuthErrorCodes.RESEND_COOLDOWN);
      expect(error.retryAfterMs).toBe(VERIFICATION_RESEND_COOLDOWN_MS);
      expect(emailService.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('regenerates both the code and the link token on an allowed resend', async () => {
      const previous = makeTokenRow({ createdAt: new Date() });
      vi.advanceTimersByTime(VERIFICATION_RESEND_COOLDOWN_MS);

      await handler.execute({ userId: USER_ID });

      const [stored] = vi.mocked(tokenRepository.replaceIfOlderThan).mock
        .calls[0];
      const payload = sentPayload();
      expect(stored.codeHash).toBe(tokenHasher.hash(payload.code));
      expect(stored.tokenHash).toBe(tokenHasher.hash(payload.token));
      expect(stored.codeHash).not.toBe(previous.codeHash);
      expect(stored.tokenHash).not.toBe(previous.tokenHash);
    });

    it('refuses an unknown user before touching the token store', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(null);

      const result = await handler.execute({ userId: USER_ID });

      expect(result._unsafeUnwrapErr().code).toBe(
        AuthErrorCodes.USER_NOT_FOUND
      );
      expect(tokenRepository.replaceIfOlderThan).not.toHaveBeenCalled();
      expect(emailService.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('refuses an already verified user before touching the token store', async () => {
      vi.mocked(userRepository.findById).mockResolvedValue(
        makeUser({ emailVerifiedAt: new Date() })
      );

      const result = await handler.execute({ userId: USER_ID });

      expect(result._unsafeUnwrapErr().code).toBe(
        AuthErrorCodes.EMAIL_ALREADY_VERIFIED
      );
      expect(tokenRepository.replaceIfOlderThan).not.toHaveBeenCalled();
      expect(emailService.sendEmailVerification).not.toHaveBeenCalled();
    });
  });

  it('never writes the code or its hash to the log', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    vi.mocked(emailService.sendEmailVerification).mockResolvedValue(
      err({ code: 'EMAIL_SEND_FAILED', message: 'nope' })
    );

    await handler.execute({ userId: USER_ID });

    const payload = sentPayload();
    const logged = JSON.stringify([
      ...errorSpy.mock.calls,
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
    ]);
    expect(logged).not.toContain(payload.code);
    expect(logged).not.toContain(tokenHasher.hash(payload.code));
    expect(logged).not.toContain(payload.token);
  });
});
