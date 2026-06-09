import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AIGateway } from './ai.gateway';
import type { StreamTextCallbacks } from './application/commands/stream-text.handler';
import { StreamTextHandler } from './application/commands/stream-text.handler';

function createMockAISocket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'socket-1',
    data: {} as Record<string, unknown>,
    emit: vi.fn(),
    disconnect: vi.fn(),
    handshake: { auth: {}, headers: {} },
    ...overrides,
  } as unknown as Parameters<AIGateway['handleConnection']>[0];
}

function createMockConfigService(maxConcurrentStreams = 2) {
  return {
    get: vi.fn((key: string) => {
      if (key === 'AI_MAX_CONCURRENT_STREAMS') {
        return maxConcurrentStreams;
      }
      return undefined;
    }),
  } as unknown as ConfigService<Record<string, unknown>, true>;
}

/**
 * Creates an execute mock that blocks until manually resolved or the
 * AbortSignal fires. Tracks all pending promises so resolveAll() can
 * unblock every in-flight stream at once.
 */
function createBlockingExecute() {
  const pending: Array<() => void> = [];
  let capturedCallbacks: StreamTextCallbacks | undefined;

  const fn = vi
    .fn()
    .mockImplementation(
      (
        _input: unknown,
        callbacks: StreamTextCallbacks,
        signal?: AbortSignal
      ) => {
        capturedCallbacks = callbacks;
        return new Promise<void>((resolve) => {
          pending.push(resolve);
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      }
    );

  return {
    fn,
    get callbacks() {
      return capturedCallbacks;
    },
    resolveAll() {
      for (const resolve of pending) {
        resolve();
      }
      pending.length = 0;
    },
  };
}

describe('AIGateway', () => {
  let gateway: AIGateway;
  let mockStreamHandler: StreamTextHandler;
  let mockJwtService: JwtService;
  let mockFeatureFlags: FeatureFlagsService;

  beforeEach(() => {
    mockStreamHandler = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as StreamTextHandler;

    mockJwtService = {
      verify: vi.fn().mockReturnValue({ sub: 'user-123' }),
    } as unknown as JwtService;

    mockFeatureFlags = {
      isEnabled: vi.fn().mockResolvedValue(true),
    } as unknown as FeatureFlagsService;

    gateway = new AIGateway(
      mockStreamHandler,
      mockJwtService,
      mockFeatureFlags,
      createMockConfigService()
    );
  });

  describe('handleConnection', () => {
    it('should authenticate client with valid token', async () => {
      const client = createMockAISocket({
        handshake: { auth: { token: 'valid-jwt' }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt');
      expect(client.data.userId).toBe('user-123');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect when no token provided', async () => {
      const client = createMockAISocket();

      await gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect on invalid token', async () => {
      vi.spyOn(mockJwtService, 'verify').mockImplementation(() => {
        throw new Error('invalid');
      });

      const client = createMockAISocket({
        handshake: { auth: { token: 'bad-jwt' }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should disconnect MCP-source tokens', async () => {
      vi.spyOn(mockJwtService, 'verify').mockReturnValue({
        sub: 'user-123',
        source: 'mcp',
      } as never);

      const client = createMockAISocket({
        handshake: { auth: { token: 'mcp-jwt' }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.data).not.toHaveProperty('userId');
    });

    it('should disconnect when AI is disabled', async () => {
      vi.mocked(mockFeatureFlags.isEnabled).mockResolvedValue(false);

      const client = createMockAISocket({
        handshake: { auth: { token: 'valid-jwt' }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(mockFeatureFlags.isEnabled).toHaveBeenCalledWith('ai_enabled');
      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AI_FEATURE_DISABLED' })
      );
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleComplete', () => {
    it('should call streamTextHandler with valid payload', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some note content to summarize',
      });

      expect(mockStreamHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          action: AI_ACTION.SUMMARIZE,
          content: 'Some note content to summarize',
        }),
        expect.objectContaining({
          onChunk: expect.any(Function),
          onDone: expect.any(Function),
          onError: expect.any(Function),
        }),
        expect.any(AbortSignal)
      );
    });

    it('should emit validation error for invalid action', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: 'invalid-action',
        content: 'Some content',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
      expect(mockStreamHandler.execute).not.toHaveBeenCalled();
    });

    it('should emit AUTH_REQUIRED when no userId', async () => {
      const client = createMockAISocket();

      await gateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AUTH_REQUIRED' })
      );
    });

    it('should emit validation error for missing content', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
    });

    it('should pass targetLanguage for translate action', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: AI_ACTION.TRANSLATE,
        content: 'Hello world',
        targetLanguage: 'Spanish',
      });

      expect(mockStreamHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AI_ACTION.TRANSLATE,
          targetLanguage: 'Spanish',
        }),
        expect.any(Object),
        expect.any(AbortSignal)
      );
    });

    it('should reject when max concurrent streams reached', async () => {
      const blocking = createBlockingExecute();
      const singleStreamGateway = new AIGateway(
        { execute: blocking.fn } as unknown as StreamTextHandler,
        mockJwtService,
        mockFeatureFlags,
        createMockConfigService(1)
      );

      const client1 = createMockAISocket({ id: 'socket-1' });
      client1.data.userId = 'user-123';
      const client2 = createMockAISocket({ id: 'socket-2' });
      client2.data.userId = 'user-123';

      // Start first stream (hangs until resolved)
      const p1 = singleStreamGateway.handleComplete(client1, {
        action: AI_ACTION.SUMMARIZE,
        content: 'First request',
      });

      // Second request should be rejected (slot occupied)
      await singleStreamGateway.handleComplete(client2, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Second request',
      });

      expect(client2.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AI_RATE_LIMIT_EXCEEDED' })
      );
      expect(blocking.fn).toHaveBeenCalledTimes(1);

      blocking.resolveAll();
      await p1;
    });

    it('should reject same socket sending multiple concurrent requests', async () => {
      const blocking = createBlockingExecute();
      const singleStreamGateway = new AIGateway(
        { execute: blocking.fn } as unknown as StreamTextHandler,
        mockJwtService,
        mockFeatureFlags,
        createMockConfigService(1)
      );

      const client = createMockAISocket({ id: 'socket-1' });
      client.data.userId = 'user-123';

      const p1 = singleStreamGateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'First request',
      });

      await singleStreamGateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Second request from same socket',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AI_RATE_LIMIT_EXCEEDED' })
      );
      expect(blocking.fn).toHaveBeenCalledTimes(1);

      blocking.resolveAll();
      await p1;
    });

    it('should release stream slot when execute rejects', async () => {
      const singleStreamGateway = new AIGateway(
        {
          execute: vi
            .fn()
            .mockRejectedValueOnce(new Error('unexpected failure'))
            .mockResolvedValue(undefined),
        } as unknown as StreamTextHandler,
        mockJwtService,
        mockFeatureFlags,
        createMockConfigService(1)
      );

      const client = createMockAISocket({ id: 'socket-1' });
      client.data.userId = 'user-123';

      // First request fails — slot should be freed by try/finally
      await singleStreamGateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Request that will fail',
      });

      const client2 = createMockAISocket({ id: 'socket-2' });
      client2.data.userId = 'user-123';

      await singleStreamGateway.handleComplete(client2, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Should succeed after slot freed',
      });

      // Both execute calls should have been made (second wasn't blocked)
      expect(
        singleStreamGateway['streamTextHandler'].execute
      ).toHaveBeenCalledTimes(2);
    });

    it('should emit validation error for invalid targetLanguage', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: AI_ACTION.TRANSLATE,
        content: 'Hello world',
        targetLanguage: 'Klingon',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
    });
  });

  describe('handleCancel', () => {
    it('should abort an active stream', async () => {
      const blocking = createBlockingExecute();
      const gw = new AIGateway(
        { execute: blocking.fn } as unknown as StreamTextHandler,
        mockJwtService,
        mockFeatureFlags,
        createMockConfigService()
      );

      const client = createMockAISocket();
      client.data.userId = 'user-123';

      const p = gw.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      });

      const signal = blocking.fn.mock.calls[0]?.[2] as AbortSignal;
      expect(signal?.aborted).toBe(false);

      gw.handleCancel(client);

      expect(signal?.aborted).toBe(true);
      await p; // resolves because abort listener fires
    });

    it('should release user stream slot on cancel', async () => {
      const blocking = createBlockingExecute();
      const singleStreamGateway = new AIGateway(
        { execute: blocking.fn } as unknown as StreamTextHandler,
        mockJwtService,
        mockFeatureFlags,
        createMockConfigService(1)
      );

      const client = createMockAISocket({ id: 'socket-1' });
      client.data.userId = 'user-123';

      const p1 = singleStreamGateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'First request',
      });

      singleStreamGateway.handleCancel(client);
      await p1;

      const client2 = createMockAISocket({ id: 'socket-2' });
      client2.data.userId = 'user-123';

      const p2 = singleStreamGateway.handleComplete(client2, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Second request after cancel',
      });

      expect(blocking.fn).toHaveBeenCalledTimes(2);
      blocking.resolveAll();
      await p2;
    });
  });

  describe('handleDisconnect', () => {
    it('should abort active stream on disconnect', async () => {
      const blocking = createBlockingExecute();
      const gw = new AIGateway(
        { execute: blocking.fn } as unknown as StreamTextHandler,
        mockJwtService,
        mockFeatureFlags,
        createMockConfigService()
      );

      const client = createMockAISocket();
      client.data.userId = 'user-123';

      const p = gw.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      });

      const signal = blocking.fn.mock.calls[0]?.[2] as AbortSignal;

      gw.handleDisconnect(client);

      expect(signal?.aborted).toBe(true);
      await p;
    });

    it('should not wipe stream counter for other tabs on disconnect', async () => {
      const blocking = createBlockingExecute();
      const twoStreamGateway = new AIGateway(
        { execute: blocking.fn } as unknown as StreamTextHandler,
        mockJwtService,
        mockFeatureFlags,
        createMockConfigService(2)
      );

      const client1 = createMockAISocket({ id: 'socket-1' });
      client1.data.userId = 'user-123';
      const client2 = createMockAISocket({ id: 'socket-2' });
      client2.data.userId = 'user-123';

      const p1 = twoStreamGateway.handleComplete(client1, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Tab 1 request',
      });
      const p2 = twoStreamGateway.handleComplete(client2, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Tab 2 request',
      });

      expect(blocking.fn).toHaveBeenCalledTimes(2);

      // Disconnect tab 1 — tab 2's slot should still be tracked
      twoStreamGateway.handleDisconnect(client1);
      await p1; // resolves because abort listener fires

      // A third request should succeed since one slot freed up
      const client3 = createMockAISocket({ id: 'socket-3' });
      client3.data.userId = 'user-123';

      const p3 = twoStreamGateway.handleComplete(client3, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Tab 3 request',
      });

      expect(blocking.fn).toHaveBeenCalledTimes(3);

      // But a fourth concurrent request should be rejected (2 active: socket-2 + socket-3)
      const client4 = createMockAISocket({ id: 'socket-4' });
      client4.data.userId = 'user-123';

      await twoStreamGateway.handleComplete(client4, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Tab 4 request',
      });

      expect(client4.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AI_RATE_LIMIT_EXCEEDED' })
      );
      expect(blocking.fn).toHaveBeenCalledTimes(3);

      // Cleanup
      blocking.resolveAll();
      await Promise.all([p2, p3]);
    });
  });
});
