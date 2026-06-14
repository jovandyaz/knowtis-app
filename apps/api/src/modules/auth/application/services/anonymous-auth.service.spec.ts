import type { SessionRepository, TokenService } from '@jovandyaz/auth-nestjs';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsersService } from '../../../users/users.service';
import { AnonymousAuthService } from './anonymous-auth.service';

describe('AnonymousAuthService', () => {
  let usersService: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };
  let tokenService: { generateTokens: ReturnType<typeof vi.fn> };
  let sessionRepository: { create: ReturnType<typeof vi.fn> };
  let service: AnonymousAuthService;

  beforeEach(() => {
    usersService = {
      create: vi.fn().mockResolvedValue({
        id: 'new-anon',
        email: 'anon-x@anonymous.knowtis.local',
        isAnonymous: true,
      }),
      findById: vi.fn().mockResolvedValue(null),
    };
    jwtService = { verifyAsync: vi.fn() };
    tokenService = {
      generateTokens: vi
        .fn()
        .mockResolvedValue(ok({ accessToken: 'at', refreshToken: 'rt' })),
    };
    sessionRepository = {
      create: vi.fn().mockResolvedValue(ok({ id: 's1' })),
    };
    service = new AnonymousAuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      {
        getOrThrow: vi.fn().mockReturnValue('secret'),
      } as unknown as ConfigService,
      tokenService as unknown as TokenService,
      sessionRepository as unknown as SessionRepository
    );
  });

  it('creates a fresh anonymous user with a refresh-token session', async () => {
    const session = await service.createAnonymousSession();

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ isAnonymous: true })
    );
    expect(tokenService.generateTokens).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'new-anon' }),
      expect.any(String),
      expect.objectContaining({ isAnonymous: true })
    );
    expect(sessionRepository.create).toHaveBeenCalledOnce();
    expect(session).toEqual({
      user: { id: 'new-anon', name: 'Anonymous', isAnonymous: true },
      accessToken: 'at',
      refreshToken: 'rt',
    });
  });

  it('reuses the existing anonymous user when a valid long-lived legacy token is presented', async () => {
    const now = Math.floor(Date.now() / 1000);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'legacy-anon',
      isAnonymous: true,
      iat: now,
      exp: now + 30 * 24 * 60 * 60,
    });
    usersService.findById.mockResolvedValue({
      id: 'legacy-anon',
      email: 'anon-y@anonymous.knowtis.local',
      isAnonymous: true,
    });

    const session = await service.createAnonymousSession('legacy-token');

    expect(usersService.create).not.toHaveBeenCalled();
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('legacy-token', {
      secret: 'secret',
      algorithms: ['HS256'],
    });
    expect(session.user.id).toBe('legacy-anon');
    expect(session.refreshToken).toBe('rt');
  });

  it('falls back to a fresh user when the legacy token is invalid', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('expired'));

    const session = await service.createAnonymousSession('bad-token');

    expect(usersService.create).toHaveBeenCalledOnce();
    expect(session.user.id).toBe('new-anon');
  });

  it('falls back to a fresh user when the legacy token is not anonymous', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'real-user' });

    const session = await service.createAnonymousSession('registered-token');

    expect(usersService.findById).not.toHaveBeenCalled();
    expect(usersService.create).toHaveBeenCalledOnce();
    expect(session.user.id).toBe('new-anon');
  });

  it('falls back to a fresh user when the referenced user no longer exists', async () => {
    const now = Math.floor(Date.now() / 1000);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'gone-anon',
      isAnonymous: true,
      iat: now,
      exp: now + 30 * 24 * 60 * 60,
    });
    usersService.findById.mockResolvedValue(null);

    const session = await service.createAnonymousSession('orphan-token');

    expect(usersService.create).toHaveBeenCalledOnce();
    expect(session.user.id).toBe('new-anon');
  });

  it('falls back to a fresh user when the token lifetime is 15 minutes (access token, not legacy)', async () => {
    const now = Math.floor(Date.now() / 1000);
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'leaked-anon',
      isAnonymous: true,
      iat: now,
      exp: now + 15 * 60,
    });
    usersService.findById.mockResolvedValue({
      id: 'leaked-anon',
      email: 'anon-z@anonymous.knowtis.local',
      isAnonymous: true,
    });

    const session = await service.createAnonymousSession('leaked-access-token');

    expect(usersService.create).toHaveBeenCalledOnce();
    expect(session.user.id).toBe('new-anon');
  });

  it('falls back to a fresh user when the token carries no iat/exp lifetime claims', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'no-lifetime-anon',
      isAnonymous: true,
    });
    usersService.findById.mockResolvedValue({
      id: 'no-lifetime-anon',
      email: 'anon-w@anonymous.knowtis.local',
      isAnonymous: true,
    });

    const session = await service.createAnonymousSession('claimless-token');

    expect(usersService.create).toHaveBeenCalledOnce();
    expect(session.user.id).toBe('new-anon');
  });

  describe('verifyMigrationProof', () => {
    it('accepts an expired token with a valid signature (verifies with ignoreExpiration)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'anon-1',
        isAnonymous: true,
      });
      usersService.findById.mockResolvedValue({
        id: 'anon-1',
        email: 'anon-1@anonymous.knowtis.local',
        isAnonymous: true,
      });

      const result = await service.verifyMigrationProof(
        'expired-token',
        'anon-1'
      );

      expect(result).toBe(true);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('expired-token', {
        secret: 'secret',
        algorithms: ['HS256'],
        ignoreExpiration: true,
      });
    });

    it('rejects the proof when the signature verification fails', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      const result = await service.verifyMigrationProof(
        'forged-token',
        'anon-1'
      );

      expect(result).toBe(false);
    });

    it('rejects the proof when the token sub does not match the claimed anonymous user', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'other-anon',
        isAnonymous: true,
      });

      const result = await service.verifyMigrationProof('token', 'anon-1');

      expect(result).toBe(false);
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('rejects the proof when the token lacks the isAnonymous claim', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'anon-1' });

      const result = await service.verifyMigrationProof('token', 'anon-1');

      expect(result).toBe(false);
    });

    it('rejects the proof when the DB user is missing or not anonymous', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'anon-1',
        isAnonymous: true,
      });
      usersService.findById.mockResolvedValue({
        id: 'anon-1',
        email: 'real@example.com',
        isAnonymous: false,
      });

      const result = await service.verifyMigrationProof('token', 'anon-1');

      expect(result).toBe(false);
    });
  });
});
