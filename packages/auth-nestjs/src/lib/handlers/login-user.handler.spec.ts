import { AuthErrors } from '@jovandyaz/auth/server';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PasswordHasher } from '../ports/password-hasher.port';
import type { SessionRepository } from '../ports/session.repository';
import type { TokenService } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';
import { TokenHasher } from '../services/token-hasher.service';
import { LoginUserHandler } from './login-user.handler';

const TEST_KEY = 'PQV5tRVJdT2jlfeIfLDEUYt4RREaWnkTZuwZ1qGf5pI=';
const tokenHasher = new TokenHasher(TEST_KEY);

describe('LoginUserHandler.validateCredentials', () => {
  let userRepository: UserRepository;
  let passwordHasher: PasswordHasher;
  let handler: LoginUserHandler;

  beforeEach(() => {
    userRepository = {
      findByEmail: vi.fn().mockResolvedValue(null),
    } as unknown as UserRepository;
    passwordHasher = {
      hash: vi.fn().mockResolvedValue(ok('$2b$12$dummy-hash-value')),
      verify: vi.fn().mockResolvedValue(ok(false)),
    } as unknown as PasswordHasher;
    handler = new LoginUserHandler(
      userRepository,
      passwordHasher,
      {} as TokenService,
      {} as SessionRepository,
      tokenHasher,
      new EventEmitter2()
    );
  });

  it('should run a hash comparison even when the email is unknown', async () => {
    const result = await handler.validateCredentials({
      email: 'nobody@example.com',
      password: 'whatever-password',
    });
    expect(result.isErr()).toBe(true);
    expect(passwordHasher.verify).toHaveBeenCalledTimes(1);
    expect(passwordHasher.verify).toHaveBeenCalledWith(
      'whatever-password',
      '$2b$12$dummy-hash-value'
    );
  });

  it('should reuse the memoized dummy hash across attempts', async () => {
    await handler.validateCredentials({
      email: 'nobody@example.com',
      password: 'first',
    });
    await handler.validateCredentials({
      email: 'nobody@example.com',
      password: 'second',
    });
    expect(passwordHasher.hash).toHaveBeenCalledTimes(1);
    expect(passwordHasher.verify).toHaveBeenCalledTimes(2);
  });

  it('should compute the dummy hash only once under concurrent attempts', async () => {
    await Promise.all([
      handler.validateCredentials({
        email: 'nobody@example.com',
        password: 'first',
      }),
      handler.validateCredentials({
        email: 'nobody@example.com',
        password: 'second',
      }),
    ]);
    expect(passwordHasher.hash).toHaveBeenCalledTimes(1);
    expect(passwordHasher.verify).toHaveBeenCalledTimes(2);
  });

  it('should reset the dummy hash and skip verify when hashing fails', async () => {
    const failingHasher = {
      hash: vi.fn().mockResolvedValue(err(AuthErrors.invalidPassword())),
      verify: vi.fn().mockResolvedValue(ok(false)),
    } as unknown as PasswordHasher;
    const failingHandler = new LoginUserHandler(
      userRepository,
      failingHasher,
      {} as TokenService,
      {} as SessionRepository,
      tokenHasher,
      new EventEmitter2()
    );

    const first = await failingHandler.validateCredentials({
      email: 'nobody@example.com',
      password: 'whatever-password',
    });
    expect(first.isErr()).toBe(true);
    expect(failingHasher.verify).not.toHaveBeenCalled();

    failingHasher.hash = vi
      .fn()
      .mockResolvedValue(ok('$2b$12$dummy-hash-value'));
    await failingHandler.validateCredentials({
      email: 'nobody@example.com',
      password: 'retry-password',
    });
    expect(failingHasher.hash).toHaveBeenCalledTimes(1);
    expect(failingHasher.verify).toHaveBeenCalledTimes(1);
  });
});
