import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ValidatedUser } from '../../application/handlers/login-user.handler';
import { AuthErrors } from '../../domain/errors/auth.errors';
import { LocalStrategy } from '../local.strategy';

function createMockLoginHandler() {
  return {
    validateCredentials: vi.fn(),
    login: vi.fn(),
  };
}

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: '192.168.1.1',
    headers: { 'user-agent': 'TestAgent/1.0' },
    ...overrides,
  } as unknown as Request;
}

function createValidatedUser(
  overrides: Partial<ValidatedUser> = {}
): ValidatedUser {
  return {
    id: 'user-123',
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    ...overrides,
  };
}

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let loginHandler: ReturnType<typeof createMockLoginHandler>;
  let mockReq: Request;

  beforeEach(() => {
    loginHandler = createMockLoginHandler();
    strategy = new LocalStrategy(loginHandler as never);
    mockReq = createMockRequest();
  });

  describe('validate', () => {
    it('should return validated user on successful credential check', async () => {
      const user = createValidatedUser();
      loginHandler.validateCredentials.mockResolvedValue(ok(user));

      const result = await strategy.validate(
        mockReq,
        'user@example.com',
        'password123'
      );

      expect(result).toEqual(user);
      expect(loginHandler.validateCredentials).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
        ipAddress: '192.168.1.1',
        userAgent: 'TestAgent/1.0',
      });
    });

    it('should throw UnauthorizedException when credentials are invalid', async () => {
      loginHandler.validateCredentials.mockResolvedValue(
        err(AuthErrors.invalidCredentials())
      );

      await expect(
        strategy.validate(mockReq, 'user@example.com', 'wrong-password')
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        strategy.validate(mockReq, 'user@example.com', 'wrong-password')
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      loginHandler.validateCredentials.mockResolvedValue(
        err(AuthErrors.invalidCredentials())
      );

      await expect(
        strategy.validate(mockReq, 'nonexistent@example.com', 'password123')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should pass email, password, and request context to handler correctly', async () => {
      const user = createValidatedUser();
      loginHandler.validateCredentials.mockResolvedValue(ok(user));

      const req = createMockRequest({
        ip: '10.0.0.1',
        headers: { 'user-agent': 'CustomBrowser/2.0' } as never,
      });
      await strategy.validate(req, 'specific@email.com', 'specific-password');

      expect(loginHandler.validateCredentials).toHaveBeenCalledWith({
        email: 'specific@email.com',
        password: 'specific-password',
        ipAddress: '10.0.0.1',
        userAgent: 'CustomBrowser/2.0',
      });
    });

    it('should throw UnauthorizedException on any error result', async () => {
      loginHandler.validateCredentials.mockResolvedValue(
        err(AuthErrors.internalError('unexpected failure'))
      );

      await expect(
        strategy.validate(mockReq, 'user@example.com', 'password')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return user with all expected fields', async () => {
      const user = createValidatedUser({
        id: 'user-456',
        email: 'another@example.com',
        name: 'Another User',
        avatarUrl: 'https://example.com/avatar.png',
      });
      loginHandler.validateCredentials.mockResolvedValue(ok(user));

      const result = await strategy.validate(
        mockReq,
        'another@example.com',
        'password123'
      );

      expect(result).toEqual({
        id: 'user-456',
        email: 'another@example.com',
        name: 'Another User',
        avatarUrl: 'https://example.com/avatar.png',
      });
    });

    it('should handle missing user-agent header gracefully', async () => {
      const user = createValidatedUser();
      loginHandler.validateCredentials.mockResolvedValue(ok(user));

      const req = createMockRequest({
        headers: {} as never,
      });
      await strategy.validate(req, 'user@example.com', 'password123');

      expect(loginHandler.validateCredentials).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
        ipAddress: '192.168.1.1',
        userAgent: undefined,
      });
    });
  });
});
