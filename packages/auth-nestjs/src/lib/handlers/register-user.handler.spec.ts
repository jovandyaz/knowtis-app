import { VERIFICATION_CODE_LENGTH } from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmailVerificationTokenRepository } from '../ports/email-verification-token.repository';
import type { EmailService } from '../ports/email.service';
import type { PasswordHasher } from '../ports/password-hasher.port';
import type { SessionRepository } from '../ports/session.repository';
import type { TokenService } from '../ports/token.service';
import type { UserEntity, UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';
import { VerificationEmailIssuer } from '../services/verification-email-issuer.service';
import { RegisterUserHandler } from './register-user.handler';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const tokenHasher = new TokenHasher(TEST_KEY);

const INPUT = {
  email: 'new@test.local',
  name: 'Newcomer',
  password: 'Str0ng-Passw0rd!',
};

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: USER_ID,
    email: INPUT.email,
    name: INPUT.name,
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

describe('RegisterUserHandler', () => {
  let userRepository: UserRepository;
  let passwordHasher: PasswordHasher;
  let tokenService: TokenService;
  let sessionRepository: SessionRepository;
  let emailService: EmailService;
  let tokenRepository: EmailVerificationTokenRepository;
  let handler: RegisterUserHandler;

  beforeEach(() => {
    userRepository = {
      emailExists: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockResolvedValue(ok(makeUser())),
    } as unknown as UserRepository;

    passwordHasher = {
      hash: vi.fn().mockResolvedValue(ok('password-hash')),
    } as unknown as PasswordHasher;

    tokenService = {
      generateTokens: vi
        .fn()
        .mockResolvedValue(
          ok({ accessToken: 'access', refreshToken: 'refresh' })
        ),
    } as unknown as TokenService;

    sessionRepository = {
      create: vi.fn().mockResolvedValue(ok({ id: 'session-1' })),
    } as unknown as SessionRepository;

    emailService = {
      sendEmailVerification: vi.fn().mockResolvedValue(ok(undefined)),
      sendPasswordReset: vi.fn().mockResolvedValue(ok(undefined)),
    };

    tokenRepository = {
      create: vi.fn().mockResolvedValue(ok({ id: 'verification-1' })),
    } as unknown as EmailVerificationTokenRepository;

    handler = new RegisterUserHandler(
      userRepository,
      passwordHasher,
      tokenService,
      sessionRepository,
      tokenHasher,
      new VerificationEmailIssuer(tokenRepository, emailService, tokenHasher),
      { emit: vi.fn() } as unknown as EventEmitter2
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function registerAndAwaitEmail(): Promise<{
    token: string;
    code: string;
  }> {
    const result = await handler.execute(INPUT);
    expect(result.isOk()).toBe(true);

    await vi.waitFor(() =>
      expect(emailService.sendEmailVerification).toHaveBeenCalledTimes(1)
    );

    const [, payload] = vi.mocked(emailService.sendEmailVerification).mock
      .calls[0];
    return payload;
  }

  it('delivers the freshly minted code and link token that it stored hashed', async () => {
    const payload = await registerAndAwaitEmail();

    expect(payload.code).toMatch(CODE_PATTERN);

    const [stored] = vi.mocked(tokenRepository.create).mock.calls[0];
    expect(stored.codeHash).toBe(tokenHasher.hash(payload.code));
    expect(stored.tokenHash).toBe(tokenHasher.hash(payload.token));
  });

  it('addresses the email to the registered user', async () => {
    await registerAndAwaitEmail();

    expect(emailService.sendEmailVerification).toHaveBeenCalledWith(
      INPUT.email,
      expect.objectContaining({ token: expect.any(String) }),
      INPUT.name,
      'en'
    );
  });

  it('sends the email in the locale stored on the user', async () => {
    vi.mocked(userRepository.create).mockResolvedValue(
      ok(makeUser({ locale: 'es' }))
    );

    await registerAndAwaitEmail();

    expect(emailService.sendEmailVerification).toHaveBeenCalledWith(
      INPUT.email,
      expect.anything(),
      INPUT.name,
      'es'
    );
  });

  it('falls back to no locale when the user has none', async () => {
    vi.mocked(userRepository.create).mockResolvedValue(
      ok(makeUser({ locale: null }))
    );

    await registerAndAwaitEmail();

    expect(emailService.sendEmailVerification).toHaveBeenCalledWith(
      INPUT.email,
      expect.anything(),
      INPUT.name,
      undefined
    );
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

    const payload = await registerAndAwaitEmail();

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
