import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WsAuthService } from '../ws-auth.service';

function createMockSocket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'socket-1',
    handshake: {
      auth: {},
      headers: {},
      query: {},
      ...overrides,
    },
  } as any;
}

describe('WsAuthService', () => {
  const mockJwtService = {
    verify: vi.fn(),
  };

  let service: WsAuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WsAuthService(mockJwtService as any);
  });

  describe('extractUser', () => {
    it('should authenticate user when auth.token is valid JWT', () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-123',
        email: 'user@test.com',
      });

      const client = createMockSocket({
        auth: { token: 'valid-jwt' },
      });

      const result = service.extractUser(client);

      expect(result.user).toEqual({
        type: 'authenticated',
        userId: 'user-123',
        email: 'user@test.com',
      });
      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt');
    });

    it('should authenticate user when Authorization header is present', () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-123',
        email: 'user@test.com',
      });

      const client = createMockSocket({
        auth: {},
        headers: { authorization: 'Bearer valid-jwt' },
      });

      const result = service.extractUser(client);

      expect(result.user.type).toBe('authenticated');
    });

    it('should prefer auth.token over Authorization header', () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-123',
        email: 'user@test.com',
      });

      const client = createMockSocket({
        auth: { token: 'auth-token' },
        headers: { authorization: 'Bearer header-token' },
      });

      service.extractUser(client);

      expect(mockJwtService.verify).toHaveBeenCalledWith('auth-token');
    });

    it('should fall back to anonymous when no token is provided', () => {
      const client = createMockSocket();

      const result = service.extractUser(client);

      expect(result.user.type).toBe('anonymous');
      expect(result.user).toHaveProperty('odUserId', 'anon-socket-1');
    });

    it('should fall back to anonymous when JWT verification fails', () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const client = createMockSocket({
        auth: { token: 'invalid-jwt' },
      });

      const result = service.extractUser(client);

      expect(result.user.type).toBe('anonymous');
    });

    it('should extract shareToken from auth object', () => {
      const client = createMockSocket({
        auth: { shareToken: 'share-abc' },
      });

      const result = service.extractUser(client);

      expect(result.shareToken).toBe('share-abc');
    });

    it('should extract shareToken from query params', () => {
      const client = createMockSocket({
        query: { shareToken: 'share-query' },
      });

      const result = service.extractUser(client);

      expect(result.shareToken).toBe('share-query');
    });

    it('should prefer auth.shareToken over query.shareToken', () => {
      const client = createMockSocket({
        auth: { shareToken: 'share-auth' },
        query: { shareToken: 'share-query' },
      });

      const result = service.extractUser(client);

      expect(result.shareToken).toBe('share-auth');
    });
  });
});
