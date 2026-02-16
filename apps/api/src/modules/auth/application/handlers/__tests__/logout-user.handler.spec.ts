import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashToken } from '../../../domain/hash-token';
import type { SessionEntity } from '../../../domain/ports/session.repository';
import { LogoutUserHandler } from '../logout-user.handler';

function createMockSessionRepository() {
  return {
    create: vi.fn(),
    findByRefreshTokenHash: vi.fn(),
    deleteById: vi.fn(),
    deleteAllByUserId: vi.fn(),
  };
}

function createSessionEntity(
  refreshToken: string,
  overrides: Partial<SessionEntity> = {}
): SessionEntity {
  return {
    id: 'session-123',
    userId: 'user-123',
    refreshTokenHash: hashToken(refreshToken),
    userAgent: 'Mozilla/5.0',
    ipAddress: '127.0.0.1',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('LogoutUserHandler', () => {
  let handler: LogoutUserHandler;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let eventEmitter: EventEmitter2;

  const refreshToken = 'valid-refresh-token';

  beforeEach(() => {
    sessionRepository = createMockSessionRepository();
    eventEmitter = { emit: vi.fn() } as unknown as EventEmitter2;
    handler = new LogoutUserHandler(sessionRepository, eventEmitter);
  });

  it('should delete the session matching the refresh token', async () => {
    const session = createSessionEntity(refreshToken);

    sessionRepository.findByRefreshTokenHash.mockResolvedValue(session);
    sessionRepository.deleteById.mockResolvedValue(undefined);

    const result = await handler.execute(refreshToken);

    expect(result.isOk()).toBe(true);
    expect(sessionRepository.findByRefreshTokenHash).toHaveBeenCalledWith(
      hashToken(refreshToken)
    );
    expect(sessionRepository.deleteById).toHaveBeenCalledWith(session.id);
  });

  it('should succeed gracefully even if no matching session exists', async () => {
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(null);

    const result = await handler.execute(refreshToken);

    expect(result.isOk()).toBe(true);
    expect(sessionRepository.deleteById).not.toHaveBeenCalled();
  });

  it('should hash the refresh token before looking up the session', async () => {
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(null);

    await handler.execute(refreshToken);

    expect(sessionRepository.findByRefreshTokenHash).toHaveBeenCalledWith(
      hashToken(refreshToken)
    );
  });
});
