import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import type { SessionRepository } from '../ports/session.repository';
import type { TokenService } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';
import { RefreshTokensHandler } from './refresh-tokens.handler';

function createDeps(payload: Record<string, unknown>) {
  const tokenService = {
    verifyRefreshToken: vi.fn().mockResolvedValue(ok(payload)),
    generateTokens: vi
      .fn()
      .mockResolvedValue(ok({ accessToken: 'at', refreshToken: 'rt' })),
  } as unknown as TokenService;

  const sessionRepository = {
    findByRefreshTokenHash: vi.fn().mockResolvedValue({
      id: 's1',
      userId: payload['sub'],
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: null,
      ipAddress: null,
    }),
    deleteById: vi.fn().mockResolvedValue(undefined),
    deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(ok({ id: 's2' })),
  } as unknown as SessionRepository;

  const userRepository = {
    findById: vi
      .fn()
      .mockResolvedValue({ id: payload['sub'], email: payload['email'] }),
  } as unknown as UserRepository;

  const eventEmitter = { emit: vi.fn() } as unknown as EventEmitter2;

  return { tokenService, sessionRepository, userRepository, eventEmitter };
}

describe('RefreshTokensHandler', () => {
  it('propagates the isAnonymous claim into the rotated tokens', async () => {
    const deps = createDeps({
      sub: 'anon-1',
      email: 'anon@local',
      isAnonymous: true,
    });
    const handler = new RefreshTokensHandler(
      deps.userRepository,
      deps.tokenService,
      deps.sessionRepository,
      deps.eventEmitter
    );

    const result = await handler.execute('refresh-token');

    expect(result.isOk()).toBe(true);
    expect(deps.tokenService.generateTokens).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'anon-1' }),
      'anon@local',
      { isAnonymous: true }
    );
  });

  it('treats reuse of a rotated refresh token as theft and invalidates all sessions for the user', async () => {
    const deps = createDeps({ sub: 'user-1', email: 'u@example.com' });
    vi.mocked(deps.sessionRepository.findByRefreshTokenHash).mockResolvedValue(
      null
    );
    const handler = new RefreshTokensHandler(
      deps.userRepository,
      deps.tokenService,
      deps.sessionRepository,
      deps.eventEmitter
    );

    const result = await handler.execute('reused-rotated-token');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('TOKEN_REUSE_DETECTED');
    expect(deps.sessionRepository.deleteAllByUserId).toHaveBeenCalledWith(
      'user-1'
    );
    expect(deps.tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it('deletes an expired session and rejects without rotating tokens', async () => {
    const deps = createDeps({ sub: 'user-1', email: 'u@example.com' });
    vi.mocked(deps.sessionRepository.findByRefreshTokenHash).mockResolvedValue({
      id: 's1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1_000),
      userAgent: null,
      ipAddress: null,
    } as Awaited<ReturnType<SessionRepository['findByRefreshTokenHash']>>);
    const handler = new RefreshTokensHandler(
      deps.userRepository,
      deps.tokenService,
      deps.sessionRepository,
      deps.eventEmitter
    );

    const result = await handler.execute('expired-session-token');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('SESSION_EXPIRED');
    expect(deps.sessionRepository.deleteById).toHaveBeenCalledWith('s1');
    expect(deps.sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
    expect(deps.tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it('does not flag registered users as anonymous', async () => {
    const deps = createDeps({ sub: 'user-1', email: 'u@example.com' });
    const handler = new RefreshTokensHandler(
      deps.userRepository,
      deps.tokenService,
      deps.sessionRepository,
      deps.eventEmitter
    );

    const result = await handler.execute('refresh-token');

    expect(result.isOk()).toBe(true);
    expect(deps.tokenService.generateTokens).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'user-1' }),
      'u@example.com',
      undefined
    );
  });
});
