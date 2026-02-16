import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtStrategy, type JwtPayload } from '../jwt.strategy';

function createMockConfigService() {
  return {
    getOrThrow: vi.fn().mockReturnValue('test-jwt-secret'),
    get: vi.fn(),
  };
}

function createMockUsersService() {
  return {
    findById: vi.fn(),
    sanitizeUser: vi.fn(),
    findByEmail: vi.fn(),
    create: vi.fn(),
    validatePassword: vi.fn(),
    update: vi.fn(),
  };
}

function createJwtPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-123',
    email: 'user@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function createUserFromDb(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-123',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    passwordHash: 'hashed_password_abc123',
    provider: 'local',
    providerId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function createSanitizedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-123',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    provider: 'local',
    providerId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: ReturnType<typeof createMockUsersService>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(() => {
    configService = createMockConfigService();
    usersService = createMockUsersService();

    strategy = new JwtStrategy(configService as never, usersService as never);
  });

  describe('constructor', () => {
    it('should read JWT_SECRET from ConfigService', () => {
      expect(configService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
    });
  });

  describe('validate', () => {
    it('should extract user from valid JWT payload', async () => {
      const payload = createJwtPayload();
      const dbUser = createUserFromDb();
      const sanitized = createSanitizedUser();

      usersService.findById.mockResolvedValue(dbUser);
      usersService.sanitizeUser.mockReturnValue(sanitized);

      const result = await strategy.validate(payload);

      expect(result).toEqual(sanitized);
      expect(usersService.findById).toHaveBeenCalledWith(payload.sub);
      expect(usersService.sanitizeUser).toHaveBeenCalledWith(dbUser);
    });

    it('should return sanitized user without passwordHash', async () => {
      const payload = createJwtPayload();
      const dbUser = createUserFromDb();
      const sanitized = createSanitizedUser();

      usersService.findById.mockResolvedValue(dbUser);
      usersService.sanitizeUser.mockReturnValue(sanitized);

      const result = await strategy.validate(payload);

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toEqual(
        expect.objectContaining({
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
        })
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const payload = createJwtPayload({ sub: 'nonexistent-user' });

      usersService.findById.mockRejectedValue(
        new NotFoundException('User with id "nonexistent-user" not found')
      );

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(strategy.validate(payload)).rejects.toThrow('Invalid token');

      expect(usersService.findById).toHaveBeenCalledWith('nonexistent-user');
    });

    it('should throw UnauthorizedException when UsersService throws unexpected error', async () => {
      const payload = createJwtPayload();

      usersService.findById.mockRejectedValue(
        new Error('Database connection lost')
      );

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException
      );
      await expect(strategy.validate(payload)).rejects.toThrow('Invalid token');
    });

    it('should throw UnauthorizedException when sanitizeUser throws', async () => {
      const payload = createJwtPayload();
      const dbUser = createUserFromDb();

      usersService.findById.mockResolvedValue(dbUser);
      usersService.sanitizeUser.mockImplementation(() => {
        throw new Error('Unexpected sanitize error');
      });

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should use payload.sub to find user by id', async () => {
      const payload = createJwtPayload({ sub: 'specific-user-id' });
      const dbUser = createUserFromDb({ id: 'specific-user-id' });
      const sanitized = createSanitizedUser({ id: 'specific-user-id' });

      usersService.findById.mockResolvedValue(dbUser);
      usersService.sanitizeUser.mockReturnValue(sanitized);

      await strategy.validate(payload);

      expect(usersService.findById).toHaveBeenCalledWith('specific-user-id');
      expect(usersService.findById).not.toHaveBeenCalledWith(payload.email);
    });
  });
});
