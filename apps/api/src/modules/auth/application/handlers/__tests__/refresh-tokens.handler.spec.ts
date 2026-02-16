import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthErrorCodes, AuthErrors } from '../../../domain/errors/auth.errors';
import { hashToken } from '../../../domain/hash-token';
import type { SessionEntity } from '../../../domain/ports/session.repository';
import type { AuthTokens } from '../../../domain/ports/token.service';
import type { UserEntity } from '../../../domain/ports/user.repository';
import { RefreshTokensHandler } from '../refresh-tokens.handler';

function createMockUserRepository() {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    emailExists: vi.fn(),
    updatePasswordHash: vi.fn(),
    markEmailVerified: vi.fn(),
  };
}

function createMockTokenService() {
  return {
    generateTokens: vi.fn(),
    verifyRefreshToken: vi.fn(),
  };
}

function createMockSessionRepository() {
  return {
    create: vi.fn(),
    findByRefreshTokenHash: vi.fn(),
    deleteById: vi.fn(),
    deleteAllByUserId: vi.fn(),
  };
}

function createUserEntity(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-123',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    passwordHash: 'hashed_password',
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createAuthTokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    ...overrides,
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

describe('RefreshTokensHandler', () => {
  let handler: RefreshTokensHandler;
  let userRepository: ReturnType<typeof createMockUserRepository>;
  let tokenService: ReturnType<typeof createMockTokenService>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let eventEmitter: EventEmitter2;

  const validRefreshToken = 'valid-refresh-token';
  const jwtPayload = { sub: 'user-123', email: 'user@example.com' };

  beforeEach(() => {
    userRepository = createMockUserRepository();
    tokenService = createMockTokenService();
    sessionRepository = createMockSessionRepository();
    eventEmitter = { emit: vi.fn() } as unknown as EventEmitter2;

    handler = new RefreshTokensHandler(
      userRepository,
      tokenService,
      sessionRepository,
      eventEmitter
    );
  });

  it('should refresh tokens successfully with token rotation', async () => {
    const user = createUserEntity();
    const newTokens = createAuthTokens();
    const session = createSessionEntity(validRefreshToken);

    tokenService.verifyRefreshToken.mockResolvedValue(ok(jwtPayload));
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(session);
    userRepository.findById.mockResolvedValue(user);
    sessionRepository.deleteById.mockResolvedValue(undefined);
    tokenService.generateTokens.mockResolvedValue(ok(newTokens));
    sessionRepository.create.mockResolvedValue(
      ok({
        id: 'new-session-456',
        userId: user.id,
        refreshTokenHash: hashToken(newTokens.refreshToken),
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      })
    );

    const result = await handler.execute(validRefreshToken);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(newTokens);
    }

    expect(tokenService.verifyRefreshToken).toHaveBeenCalledWith(
      validRefreshToken
    );
    expect(sessionRepository.findByRefreshTokenHash).toHaveBeenCalledWith(
      hashToken(validRefreshToken)
    );
    // Old session should be deleted
    expect(sessionRepository.deleteById).toHaveBeenCalledWith(session.id);
    expect(userRepository.findById).toHaveBeenCalledOnce();
    expect(tokenService.generateTokens).toHaveBeenCalledOnce();
    // New session should be created
    expect(sessionRepository.create).toHaveBeenCalledOnce();
  });

  it('should reject invalid/expired refresh token (JWT verification)', async () => {
    const tokenError = AuthErrors.invalidRefreshToken();

    tokenService.verifyRefreshToken.mockResolvedValue(err(tokenError));

    const result = await handler.execute('invalid-token');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INVALID_REFRESH_TOKEN);
    }

    expect(sessionRepository.findByRefreshTokenHash).not.toHaveBeenCalled();
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it('should detect token reuse and invalidate all user sessions', async () => {
    // Valid JWT but no matching session -> token reuse
    tokenService.verifyRefreshToken.mockResolvedValue(ok(jwtPayload));
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(null);

    const result = await handler.execute(validRefreshToken);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.TOKEN_REUSE_DETECTED);
    }

    // All user sessions should be invalidated
    expect(sessionRepository.deleteAllByUserId).toHaveBeenCalledWith(
      jwtPayload.sub
    );
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it('should reject expired session', async () => {
    const expiredSession = createSessionEntity(validRefreshToken, {
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    });

    tokenService.verifyRefreshToken.mockResolvedValue(ok(jwtPayload));
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(expiredSession);

    const result = await handler.execute(validRefreshToken);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.SESSION_EXPIRED);
    }

    expect(sessionRepository.deleteById).toHaveBeenCalledWith(
      expiredSession.id
    );
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it('should reject if user no longer exists', async () => {
    const session = createSessionEntity(validRefreshToken);

    tokenService.verifyRefreshToken.mockResolvedValue(ok(jwtPayload));
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(session);
    userRepository.findById.mockResolvedValue(null);

    const result = await handler.execute(validRefreshToken);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.USER_NOT_FOUND);
    }

    expect(sessionRepository.deleteById).toHaveBeenCalledWith(session.id);
    expect(tokenService.generateTokens).not.toHaveBeenCalled();
  });

  it('should handle token generation failure gracefully', async () => {
    const user = createUserEntity();
    const session = createSessionEntity(validRefreshToken);
    const tokenError = AuthErrors.internalError('token generation failed');

    tokenService.verifyRefreshToken.mockResolvedValue(ok(jwtPayload));
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(session);
    userRepository.findById.mockResolvedValue(user);
    tokenService.generateTokens.mockResolvedValue(err(tokenError));

    const result = await handler.execute(validRefreshToken);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
      expect(result.error.message).toBe('token generation failed');
    }
  });

  it('should handle session creation failure on rotation gracefully', async () => {
    const user = createUserEntity();
    const session = createSessionEntity(validRefreshToken);
    const newTokens = createAuthTokens();
    const sessionError = AuthErrors.internalError(
      'session creation failed on rotation'
    );

    tokenService.verifyRefreshToken.mockResolvedValue(ok(jwtPayload));
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(session);
    userRepository.findById.mockResolvedValue(user);
    tokenService.generateTokens.mockResolvedValue(ok(newTokens));
    sessionRepository.create.mockResolvedValue(err(sessionError));

    const result = await handler.execute(validRefreshToken);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(AuthErrorCodes.INTERNAL_ERROR);
    }
  });

  it('should pass correct userId and email to generateTokens', async () => {
    const user = createUserEntity();
    const session = createSessionEntity(validRefreshToken);
    const newTokens = createAuthTokens();

    tokenService.verifyRefreshToken.mockResolvedValue(ok(jwtPayload));
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(session);
    userRepository.findById.mockResolvedValue(user);
    tokenService.generateTokens.mockResolvedValue(ok(newTokens));
    sessionRepository.create.mockResolvedValue(
      ok({
        id: 'new-session',
        userId: user.id,
        refreshTokenHash: hashToken(newTokens.refreshToken),
        userAgent: null,
        ipAddress: null,
        expiresAt: new Date(),
        createdAt: new Date(),
      })
    );

    await handler.execute(validRefreshToken);

    const generateCall = tokenService.generateTokens.mock.calls[0];
    expect(generateCall[0].value).toBe(jwtPayload.sub);
    expect(generateCall[1]).toBe(jwtPayload.email);
  });

  it('should preserve userAgent and ipAddress from old session in new session', async () => {
    const user = createUserEntity();
    const session = createSessionEntity(validRefreshToken, {
      userAgent: 'Chrome/120',
      ipAddress: '192.168.1.1',
    });
    const newTokens = createAuthTokens();

    tokenService.verifyRefreshToken.mockResolvedValue(ok(jwtPayload));
    sessionRepository.findByRefreshTokenHash.mockResolvedValue(session);
    userRepository.findById.mockResolvedValue(user);
    tokenService.generateTokens.mockResolvedValue(ok(newTokens));
    sessionRepository.create.mockResolvedValue(
      ok({
        id: 'new-session',
        userId: user.id,
        refreshTokenHash: hashToken(newTokens.refreshToken),
        userAgent: 'Chrome/120',
        ipAddress: '192.168.1.1',
        expiresAt: new Date(),
        createdAt: new Date(),
      })
    );

    await handler.execute(validRefreshToken);

    const createCall = sessionRepository.create.mock.calls[0][0];
    expect(createCall.userAgent).toBe('Chrome/120');
    expect(createCall.ipAddress).toBe('192.168.1.1');
  });
});
