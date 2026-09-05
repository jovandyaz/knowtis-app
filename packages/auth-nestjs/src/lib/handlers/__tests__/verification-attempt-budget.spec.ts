import {
  AuthErrorCodes,
  VERIFICATION_CODE_MAX_ATTEMPTS,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from '@jovandyaz/auth/server';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateEmailVerificationTokenData,
  EmailVerificationTokenEntity,
  EmailVerificationTokenRepository,
} from '../../ports/email-verification-token.repository';
import type { EmailService } from '../../ports/email.service';
import type { SessionRepository } from '../../ports/session.repository';
import type { UserEntity, UserRepository } from '../../ports/user.repository';
import { TokenHasher } from '../../services/token-hasher.service';
import { VerificationEmailIssuer } from '../../services/verification-email-issuer.service';
import { ResendVerificationHandler } from '../resend-verification.handler';
import { VerifyEmailCodeHandler } from '../verify-email-code.handler';
import { VerifyEmailHandler } from '../verify-email.handler';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const FAMILY_ID = '00000000-0000-4000-8000-0000000000c1';
const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const FIRST_WRONG_CODE = '111111';
const SECOND_WRONG_CODE = '222222';
const tokenHasher = new TokenHasher(TEST_KEY);

class InMemoryVerificationTokenRepository implements EmailVerificationTokenRepository {
  private rows: EmailVerificationTokenEntity[] = [];
  private sequence = 0;

  create(data: CreateEmailVerificationTokenData) {
    this.sequence += 1;
    const row: EmailVerificationTokenEntity = {
      id: `verification-${this.sequence}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      codeHash: data.codeHash,
      codeExpiresAt: data.codeExpiresAt,
      attempts: 0,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(ok(row));
  }

  replaceIfOlderThan(data: CreateEmailVerificationTokenData, minAgeMs: number) {
    const index = this.rows.findIndex((row) => row.userId === data.userId);
    if (index === -1) {
      return this.create(data);
    }
    const current = this.rows[index];
    if (current.createdAt.getTime() > Date.now() - minAgeMs) {
      return Promise.resolve(ok(null));
    }
    const replaced: EmailVerificationTokenEntity = {
      ...current,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      codeHash: data.codeHash,
      codeExpiresAt: data.codeExpiresAt,
      attempts: 0,
      createdAt: new Date(),
    };
    this.rows[index] = replaced;
    return Promise.resolve(ok(replaced));
  }

  findByTokenHash(tokenHash: string) {
    return Promise.resolve(
      this.rows.find((row) => row.tokenHash === tokenHash) ?? null
    );
  }

  findByUserId(userId: string) {
    return Promise.resolve(
      this.rows.find((row) => row.userId === userId) ?? null
    );
  }

  incrementAttempts(id: string) {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index === -1) {
      return Promise.resolve(null);
    }
    const attempts = this.rows[index].attempts + 1;
    this.rows[index] = { ...this.rows[index], attempts };
    return Promise.resolve(attempts);
  }

  deleteAllByUserId(userId: string) {
    this.rows = this.rows.filter((row) => row.userId !== userId);
    return Promise.resolve();
  }

  deleteExpired(cutoff: Date) {
    this.rows = this.rows.filter((row) => row.expiresAt >= cutoff);
    return Promise.resolve();
  }
}

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: USER_ID,
    email: 'budget@test.local',
    name: 'Budget',
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

describe('verification attempt budget', () => {
  let tokenRepository: InMemoryVerificationTokenRepository;
  let userRepository: UserRepository;
  let sessionRepository: SessionRepository;
  let emailService: EmailService;
  let resendHandler: ResendVerificationHandler;
  let verifyCodeHandler: VerifyEmailCodeHandler;
  let verifyLinkHandler: VerifyEmailHandler;
  let emailed: { token: string; code: string };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));

    tokenRepository = new InMemoryVerificationTokenRepository();

    userRepository = {
      findById: vi.fn().mockResolvedValue(makeUser()),
      markEmailVerified: vi.fn().mockResolvedValue(ok(undefined)),
    } as unknown as UserRepository;

    sessionRepository = {
      deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
      deleteAllByUserIdExceptFamily: vi.fn().mockResolvedValue(undefined),
    } as unknown as SessionRepository;

    emailService = {
      sendEmailVerification: vi.fn().mockResolvedValue(ok(undefined)),
      sendPasswordReset: vi.fn().mockResolvedValue(ok(undefined)),
    };

    resendHandler = new ResendVerificationHandler(
      userRepository,
      new VerificationEmailIssuer(tokenRepository, emailService, tokenHasher)
    );
    const eventEmitter = { emit: vi.fn() } as unknown as EventEmitter2;

    verifyCodeHandler = new VerifyEmailCodeHandler(
      tokenRepository,
      userRepository,
      sessionRepository,
      tokenHasher,
      eventEmitter
    );
    verifyLinkHandler = new VerifyEmailHandler(
      tokenRepository,
      userRepository,
      tokenHasher,
      sessionRepository,
      eventEmitter
    );

    const seeded = await resendHandler.execute({ userId: USER_ID });
    expect(seeded.isOk()).toBe(true);
    const [, payload] = vi.mocked(emailService.sendEmailVerification).mock
      .calls[0];
    emailed = payload;
    vi.mocked(emailService.sendEmailVerification).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function exhaustAttempts(): Promise<void> {
    const wrongCode =
      emailed.code === FIRST_WRONG_CODE ? SECOND_WRONG_CODE : FIRST_WRONG_CODE;

    for (
      let attempt = 0;
      attempt <= VERIFICATION_CODE_MAX_ATTEMPTS;
      attempt++
    ) {
      const result = await verifyCodeHandler.execute({
        userId: USER_ID,
        code: wrongCode,
        familyId: FAMILY_ID,
      });
      expect(result.isErr()).toBe(true);
    }

    const lastResult = await verifyCodeHandler.execute({
      userId: USER_ID,
      code: emailed.code,
      familyId: FAMILY_ID,
    });
    expect(lastResult._unsafeUnwrapErr().code).toBe(
      AuthErrorCodes.TOO_MANY_VERIFICATION_ATTEMPTS
    );
  }

  it('keeps the spent row so a burnt attempt budget cannot be reset by resending', async () => {
    await exhaustAttempts();

    const spentRow = await tokenRepository.findByUserId(USER_ID);
    expect(spentRow).not.toBeNull();
    expect(spentRow?.attempts).toBeGreaterThan(VERIFICATION_CODE_MAX_ATTEMPTS);

    const resend = await resendHandler.execute({ userId: USER_ID });

    expect(resend._unsafeUnwrapErr().code).toBe(AuthErrorCodes.RESEND_COOLDOWN);
    expect(emailService.sendEmailVerification).not.toHaveBeenCalled();
    expect((await tokenRepository.findByUserId(USER_ID))?.id).toBe(
      spentRow?.id
    );
  });

  it('lets the user resend a fresh budget once the cooldown has elapsed', async () => {
    await exhaustAttempts();
    vi.advanceTimersByTime(VERIFICATION_RESEND_COOLDOWN_MS);

    const resend = await resendHandler.execute({ userId: USER_ID });

    expect(resend.isOk()).toBe(true);
    const replacement = await tokenRepository.findByUserId(USER_ID);
    expect(replacement?.attempts).toBe(0);
    expect(emailService.sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it('keeps answering "too many attempts" on every guess after the budget is spent', async () => {
    await exhaustAttempts();

    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await verifyCodeHandler.execute({
        userId: USER_ID,
        code: emailed.code,
        familyId: FAMILY_ID,
      });

      expect(result._unsafeUnwrapErr().code).toBe(
        AuthErrorCodes.TOO_MANY_VERIFICATION_ATTEMPTS
      );
    }
  });

  it('points a spent budget at the moment a resend becomes possible', async () => {
    await exhaustAttempts();
    vi.advanceTimersByTime(20_000);

    const error = (
      await verifyCodeHandler.execute({
        userId: USER_ID,
        code: emailed.code,
        familyId: FAMILY_ID,
      })
    )._unsafeUnwrapErr();

    expect(error.code).toBe(AuthErrorCodes.TOO_MANY_VERIFICATION_ATTEMPTS);
    expect(error.retryAfterMs).toBe(VERIFICATION_RESEND_COOLDOWN_MS - 20_000);
  });

  it('reports no wait once a resend is already possible', async () => {
    await exhaustAttempts();
    vi.advanceTimersByTime(VERIFICATION_RESEND_COOLDOWN_MS);

    const error = (
      await verifyCodeHandler.execute({
        userId: USER_ID,
        code: emailed.code,
        familyId: FAMILY_ID,
      })
    )._unsafeUnwrapErr();

    expect(error.retryAfterMs).toBe(0);
  });

  it('quotes a wait the resend endpoint actually honours', async () => {
    await exhaustAttempts();
    const error = (
      await verifyCodeHandler.execute({
        userId: USER_ID,
        code: emailed.code,
        familyId: FAMILY_ID,
      })
    )._unsafeUnwrapErr();

    const { retryAfterMs } = error;
    if (retryAfterMs === undefined) {
      throw new Error('the refusal must quote the wait it expects');
    }
    expect(retryAfterMs).toBeGreaterThan(0);
    vi.advanceTimersByTime(retryAfterMs);

    expect((await resendHandler.execute({ userId: USER_ID })).isOk()).toBe(
      true
    );
  });

  it('leaves the emailed link usable after the code budget is spent', async () => {
    await exhaustAttempts();

    const result = await verifyLinkHandler.execute({ token: emailed.token });

    expect(result.isOk()).toBe(true);
    expect(userRepository.markEmailVerified).toHaveBeenCalledTimes(1);
  });
});
