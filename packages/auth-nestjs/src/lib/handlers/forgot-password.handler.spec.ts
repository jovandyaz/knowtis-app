import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmailService } from '../ports/email.service';
import type { PasswordResetTokenRepository } from '../ports/password-reset-token.repository';
import type { UserEntity, UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';
import { ForgotPasswordHandler } from './forgot-password.handler';

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const EMAIL = 'forgetful@test.local';
const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const tokenHasher = new TokenHasher(TEST_KEY);

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: USER_ID,
    email: EMAIL,
    name: 'Forgetful',
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

describe('ForgotPasswordHandler', () => {
  let userRepository: UserRepository;
  let emailService: EmailService;
  let resetTokenRepository: PasswordResetTokenRepository;
  let handler: ForgotPasswordHandler;

  beforeEach(() => {
    userRepository = {
      findByEmail: vi.fn().mockResolvedValue(makeUser()),
    } as unknown as UserRepository;

    emailService = {
      sendEmailVerification: vi.fn().mockResolvedValue(ok(undefined)),
      sendPasswordReset: vi.fn().mockResolvedValue(ok(undefined)),
    };

    resetTokenRepository = {
      create: vi.fn().mockResolvedValue(ok({ id: 'reset-1' })),
      deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    } as unknown as PasswordResetTokenRepository;

    handler = new ForgotPasswordHandler(
      userRepository,
      emailService,
      resetTokenRepository,
      tokenHasher,
      { emit: vi.fn() } as unknown as EventEmitter2
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the reset email in the locale stored on the user', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(
      makeUser({ locale: 'es' })
    );

    const result = await handler.execute({ email: EMAIL });

    expect(result.isOk()).toBe(true);
    expect(emailService.sendPasswordReset).toHaveBeenCalledWith(
      EMAIL,
      expect.any(String),
      'Forgetful',
      'es'
    );
  });

  it('falls back to no locale when the user has none', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(
      makeUser({ locale: null })
    );

    await handler.execute({ email: EMAIL });

    expect(emailService.sendPasswordReset).toHaveBeenCalledWith(
      EMAIL,
      expect.any(String),
      'Forgetful',
      undefined
    );
  });

  it('sends the token whose hash it stored', async () => {
    await handler.execute({ email: EMAIL });

    const [, plainToken] = vi.mocked(emailService.sendPasswordReset).mock
      .calls[0];
    const [stored] = vi.mocked(resetTokenRepository.create).mock.calls[0];
    expect(stored.tokenHash).toBe(tokenHasher.hash(plainToken));
  });
});
