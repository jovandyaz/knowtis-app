import { AuthErrors } from '@jovandyaz/auth/server';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import type {
  SessionEntity,
  SessionRepository,
} from '../ports/session.repository';
import type { TokenService } from '../ports/token.service';
import type { UserRepository } from '../ports/user.repository';
import { RefreshTokensHandler } from './refresh-tokens.handler';

function createSession(overrides: Partial<SessionEntity> = {}): SessionEntity {
  return {
    id: 's1',
    userId: 'user-1',
    familyId: 'fam-1',
    refreshTokenHash: 'hash',
    rotatedAt: null,
    userAgent: null,
    ipAddress: null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(Date.now() - 60_000),
    ...overrides,
  };
}

function createDeps(
  payload: Record<string, unknown>,
  session: SessionEntity | null = createSession({
    userId: (payload['sub'] as string) ?? 'user-1',
  })
) {
  const tokenService = {
    verifyRefreshToken: vi.fn().mockResolvedValue(ok(payload)),
    generateTokens: vi
      .fn()
      .mockResolvedValue(ok({ accessToken: 'at', refreshToken: 'rt' })),
  } as unknown as TokenService;

  const sessionRepository = {
    findByRefreshTokenHash: vi.fn().mockResolvedValue(session),
    markRotated: vi.fn().mockResolvedValue(undefined),
    deleteById: vi.fn().mockResolvedValue(undefined),
    deleteByFamilyId: vi.fn().mockResolvedValue(undefined),
    deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    deleteRotatedBefore: vi.fn().mockResolvedValue(undefined),
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

function createHandler(deps: ReturnType<typeof createDeps>) {
  return new RefreshTokensHandler(
    deps.userRepository,
    deps.tokenService,
    deps.sessionRepository,
    deps.eventEmitter
  );
}

describe('RefreshTokensHandler', () => {
  it('rotates an active session by marking it rotated and re-issuing in the same family', async () => {
    const deps = createDeps({
      sub: 'user-1',
      email: 'u@example.com',
      familyId: 'fam-1',
    });
    const handler = createHandler(deps);

    const result = await handler.execute('refresh-token');

    expect(result.isOk()).toBe(true);
    expect(deps.sessionRepository.markRotated).toHaveBeenCalledWith('s1');
    expect(deps.sessionRepository.deleteById).not.toHaveBeenCalled();
    expect(deps.sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
    expect(deps.sessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'fam-1' })
    );
  });

  it('treats a concurrent refresh within the grace window as benign and re-issues tokens', async () => {
    const deps = createDeps(
      { sub: 'user-1', email: 'u@example.com', familyId: 'fam-1' },
      createSession({ rotatedAt: new Date(Date.now() - 1_000) })
    );
    const handler = createHandler(deps);

    const result = await handler.execute('just-rotated-token');

    expect(result.isOk()).toBe(true);
    expect(deps.tokenService.generateTokens).toHaveBeenCalled();
    expect(deps.sessionRepository.deleteByFamilyId).not.toHaveBeenCalled();
    expect(deps.sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });

  it('invalidates only the token family when a rotated token is reused past the grace window', async () => {
    const deps = createDeps(
      { sub: 'user-1', email: 'u@example.com', familyId: 'fam-1' },
      createSession({
        familyId: 'fam-1',
        rotatedAt: new Date(Date.now() - 10 * 60_000),
      })
    );
    const handler = createHandler(deps);

    const result = await handler.execute('stale-rotated-token');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('TOKEN_REUSE_DETECTED');
    expect(deps.sessionRepository.deleteByFamilyId).toHaveBeenCalledWith(
      'fam-1'
    );
    expect(deps.sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
    expect(deps.tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it('invalidates the family from the token claim when no session row exists', async () => {
    const deps = createDeps(
      { sub: 'user-1', email: 'u@example.com', familyId: 'fam-7' },
      null
    );
    const handler = createHandler(deps);

    const result = await handler.execute('orphaned-token');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('TOKEN_REUSE_DETECTED');
    expect(deps.sessionRepository.deleteByFamilyId).toHaveBeenCalledWith(
      'fam-7'
    );
    expect(deps.sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });

  it('rejects a legacy token without a family claim and no session without cascading any deletes', async () => {
    const deps = createDeps({ sub: 'user-1', email: 'u@example.com' }, null);
    const handler = createHandler(deps);

    const result = await handler.execute('legacy-orphaned-token');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('INVALID_REFRESH_TOKEN');
    expect(deps.sessionRepository.deleteByFamilyId).not.toHaveBeenCalled();
    expect(deps.sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
  });

  it('propagates the isAnonymous claim into the rotated tokens', async () => {
    const deps = createDeps({
      sub: 'anon-1',
      email: 'anon@local',
      isAnonymous: true,
      familyId: 'fam-1',
    });
    const handler = createHandler(deps);

    const result = await handler.execute('refresh-token');

    expect(result.isOk()).toBe(true);
    expect(deps.tokenService.generateTokens).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'anon-1' }),
      'anon@local',
      expect.objectContaining({ isAnonymous: true })
    );
  });

  it('deletes an expired session and rejects without rotating tokens', async () => {
    const deps = createDeps(
      { sub: 'user-1', email: 'u@example.com', familyId: 'fam-1' },
      createSession({ expiresAt: new Date(Date.now() - 1_000) })
    );
    const handler = createHandler(deps);

    const result = await handler.execute('expired-session-token');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('SESSION_EXPIRED');
    expect(deps.sessionRepository.deleteById).toHaveBeenCalledWith('s1');
    expect(deps.sessionRepository.deleteByFamilyId).not.toHaveBeenCalled();
    expect(deps.sessionRepository.deleteAllByUserId).not.toHaveBeenCalled();
    expect(deps.tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it('succeeds even when pruning rotated sessions fails after re-issuing tokens', async () => {
    const deps = createDeps({
      sub: 'user-1',
      email: 'u@example.com',
      familyId: 'fam-1',
    });
    vi.mocked(deps.sessionRepository.deleteRotatedBefore).mockRejectedValue(
      new Error('db unavailable')
    );
    const handler = createHandler(deps);

    const result = await handler.execute('refresh-token');

    expect(result.isOk()).toBe(true);
    expect(deps.sessionRepository.create).toHaveBeenCalled();
  });

  it('creates the replacement session before marking the old one rotated', async () => {
    const deps = createDeps({
      sub: 'user-1',
      email: 'u@example.com',
      familyId: 'fam-1',
    });
    const callOrder: string[] = [];
    vi.mocked(deps.sessionRepository.create).mockImplementation(async () => {
      callOrder.push('create');
      return ok({ id: 's2' } as SessionEntity);
    });
    vi.mocked(deps.sessionRepository.markRotated).mockImplementation(
      async () => {
        callOrder.push('markRotated');
      }
    );
    const handler = createHandler(deps);

    const result = await handler.execute('refresh-token');

    expect(result.isOk()).toBe(true);
    expect(callOrder).toEqual(['create', 'markRotated']);
  });

  it('does not mark the session rotated when token generation fails', async () => {
    const deps = createDeps({
      sub: 'user-1',
      email: 'u@example.com',
      familyId: 'fam-1',
    });
    vi.mocked(deps.sessionRepository.create).mockResolvedValue(
      err(AuthErrors.internalError('db unavailable'))
    );
    const handler = createHandler(deps);

    const result = await handler.execute('refresh-token');

    expect(result.isErr()).toBe(true);
    expect(deps.sessionRepository.markRotated).not.toHaveBeenCalled();
  });

  it('does not flag registered users as anonymous', async () => {
    const deps = createDeps({
      sub: 'user-1',
      email: 'u@example.com',
      familyId: 'fam-1',
    });
    const handler = createHandler(deps);

    const result = await handler.execute('refresh-token');

    expect(result.isOk()).toBe(true);
    const call = vi.mocked(deps.tokenService.generateTokens).mock.calls[0];
    expect(call?.[2]).not.toHaveProperty('isAnonymous');
  });
});
