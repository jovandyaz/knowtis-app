import { EventEmitter2 } from '@nestjs/event-emitter';
import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PasswordHasher } from '../ports/password-hasher.port';
import type { SessionRepository } from '../ports/session.repository';
import type { TokenService } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';
import { LoginUserHandler } from './login-user.handler';

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
});
