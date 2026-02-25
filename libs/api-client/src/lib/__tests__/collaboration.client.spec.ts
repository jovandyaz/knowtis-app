import { io } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CollaborationClient } from '../collaboration.client';

vi.mock('socket.io-client', () => ({
  io: vi.fn().mockReturnValue({
    connected: false,
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

describe('CollaborationClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should pass JWT in auth.token when token is available', () => {
      const client = new CollaborationClient(
        'http://localhost:3333/collaboration'
      );
      client.setTokenProvider({
        getAccessToken: () => 'my-jwt-token',
        clearTokens: () => {},
      });

      client.connect();

      expect(io).toHaveBeenCalledWith(
        'http://localhost:3333/collaboration',
        expect.objectContaining({
          withCredentials: true,
          auth: expect.objectContaining({
            token: 'my-jwt-token',
          }),
        })
      );
      // Should NOT have extraHeaders
      const callArgs = vi.mocked(io).mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(callArgs['extraHeaders']).toBeUndefined();
    });

    it('should NOT pass token in auth when user is anonymous', () => {
      const client = new CollaborationClient(
        'http://localhost:3333/collaboration'
      );
      client.setTokenProvider({
        getAccessToken: () => null,
        clearTokens: () => {},
      });

      client.connect();

      const callArgs = vi.mocked(io).mock.calls[0][1] as Record<
        string,
        unknown
      >;
      const auth = callArgs['auth'] as Record<string, unknown>;
      expect(auth['token']).toBeUndefined();
      expect(auth['userId']).toMatch(/^anon-/);
    });

    it('should include shareToken in auth when provided', () => {
      const client = new CollaborationClient(
        'http://localhost:3333/collaboration'
      );
      client.setTokenProvider({
        getAccessToken: () => 'my-jwt-token',
        clearTokens: () => {},
      });

      client.connect({ shareToken: 'share-abc' });

      expect(io).toHaveBeenCalledWith(
        'http://localhost:3333/collaboration',
        expect.objectContaining({
          auth: expect.objectContaining({
            token: 'my-jwt-token',
            shareToken: 'share-abc',
          }),
        })
      );
    });
  });
});
