import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { TOKEN_EXPIRY_GRACE_MS } from '../websocket/socket-expiry';
import { AIGateway } from './ai.gateway';
import type { StreamTextCallbacks } from './application/commands/stream-text.handler';
import { StreamTextHandler } from './application/commands/stream-text.handler';

function createMockAISocket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'socket-1',
    connected: true,
    data: {} as Record<string, unknown>,
    emit: vi.fn(),
    disconnect: vi.fn(),
    handshake: { auth: {}, headers: {} },
    ...overrides,
  } as unknown as Parameters<AIGateway['handleConnection']>[0];
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt', {
        algorithms: ['HS256'],
      });
      expect(client.data.userId).toBe('user-123');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect the client when the verified token expiry passes', async () => {
      vi.useFakeTimers();
      try {
        const exp = Math.floor((Date.now() + 60_000) / 1000);
        vi.spyOn(mockJwtService, 'verify').mockReturnValue({
          sub: 'user-123',
          exp,
        } as never);
        const client = createMockAISocket({
          handshake: { auth: { token: 'valid-jwt' }, headers: {} },
        });

        await gateway.handleConnection(client);
        expect(client.disconnect).not.toHaveBeenCalled();

        vi.advanceTimersByTime(60_000 + 5_000 + 1_000);

        expect(client.emit).toHaveBeenCalledWith(
          'ai:error',
          expect.objectContaining({ code: 'AUTH_REQUIRED' })
        );
        expect(client.disconnect).toHaveBeenCalledWith(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not arm the expiry timer when the client disconnects during the flag check', async () => {
      vi.useFakeTimers();
      try {
        const exp = Math.floor((Date.now() + 60_000) / 1000);
        vi.spyOn(mockJwtService, 'verify').mockReturnValue({
          sub: 'user-123',
          exp,
        } as never);
        const client = createMockAISocket({
          handshake: { auth: { token: 'valid-jwt' }, headers: {} },
        });
        vi.mocked(mockFeatureFlags.isEnabled).mockImplementation(async () => {
          (client as unknown as { connected: boolean }).connected = false;
          return true;
        });

        await gateway.handleConnection(client);

        vi.advanceTimersByTime(120_000);

        expect(client.disconnect).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should clear the expiry timer when the client disconnects early', async () => {
      vi.useFakeTimers();
      try {
        const exp = Math.floor((Date.now() + 60_000) / 1000);
        vi.spyOn(mockJwtService, 'verify').mockReturnValue({
          sub: 'user-123',
          exp,
        } as never);
        const client = createMockAISocket({
          handshake: { auth: { token: 'valid-jwt' }, headers: {} },
        });

        await gateway.handleConnection(client);
        gateway.handleDisconnect(client);

        vi.advanceTimersByTime(120_000);

        expect(client.disconnect).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
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
    it('never starts a completion for a client that left during the flag check', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';
      vi.mocked(mockFeatureFlags.isEnabled).mockImplementationOnce(async () => {
        (client as unknown as { connected: boolean }).connected = false;
        return true;
      });

      await gateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      });

      expect(mockStreamHandler.execute).not.toHaveBeenCalled();
    });

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

    it('should forward the client IP to the stream handler', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';
      client.data.clientIp = '203.0.113.7';

      await gateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some note content to summarize',
      });

      expect(mockStreamHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({ clientIp: '203.0.113.7' }),
        expect.anything(),
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

    it('should emit validation error for an artifact-only action', async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: AI_ACTION.GENERATE_QUIZ,
        content: 'Some content',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'VALIDATION_ERROR' })
      );
      expect(mockStreamHandler.execute).not.toHaveBeenCalled();
    });

    it('should emit featureDisabled and not start a stream when the flag turns off after connect', async () => {
      vi.mocked(mockFeatureFlags.isEnabled).mockResolvedValue(false);
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some note content to summarize',
      });

      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AI_FEATURE_DISABLED' })
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

      const p1 = singleStreamGateway.handleComplete(client1, {
        action: AI_ACTION.SUMMARIZE,
        content: 'First request',
      });

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

      expect(
        singleStreamGateway['streamTextHandler'].execute
      ).toHaveBeenCalledTimes(2);
    });

    it('should emit a generic provider error without leaking internal error detail', async () => {
      const singleStreamGateway = new AIGateway(
        {
          execute: vi
            .fn()
            .mockRejectedValue(
              new Error('connection to 10.0.0.5:5432 refused')
            ),
        } as unknown as StreamTextHandler,
        mockJwtService,
        mockFeatureFlags,
        createMockConfigService(1)
      );

      const client = createMockAISocket({ id: 'socket-1' });
      client.data.userId = 'user-123';

      await singleStreamGateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      });

      const errorEmit = vi
        .mocked(client.emit)
        .mock.calls.find(([event]) => event === 'ai:error');
      expect(JSON.stringify(errorEmit?.[1])).not.toContain('10.0.0.5');
      expect(errorEmit?.[1]).toEqual({
        code: 'AI_PROVIDER_ERROR',
        message: 'AI provider error: AI streaming failed',
      });
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
      await flushAsync();

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
      await flushAsync();

      singleStreamGateway.handleCancel(client);
      await p1;

      const client2 = createMockAISocket({ id: 'socket-2' });
      client2.data.userId = 'user-123';

      const p2 = singleStreamGateway.handleComplete(client2, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Second request after cancel',
      });
      await flushAsync();

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
      await flushAsync();

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
      await flushAsync();

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
      await flushAsync();

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

      blocking.resolveAll();
      await Promise.all([p2, p3]);
    });
  });

  describe('a socket whose token expires', () => {
    const TOKEN_LIFETIME_MS = 60_000;
    const PAST_EXPIRY_MS = TOKEN_LIFETIME_MS + TOKEN_EXPIRY_GRACE_MS + 1_000;
    const USAGE = { inputTokens: 1, outputTokens: 1 };

    function streamingCompletion() {
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const execute = vi.fn(
        async (
          _input: unknown,
          callbacks: StreamTextCallbacks,
          signal?: AbortSignal
        ) => {
          callbacks.onChunk('Half a ');
          await Promise.race([
            gate,
            new Promise<void>((resolve) =>
              signal?.addEventListener('abort', () => resolve())
            ),
          ]);
          if (!signal?.aborted) {
            callbacks.onChunk('summary.');
            callbacks.onDone(USAGE as never);
          }
        }
      );
      return { execute, finish };
    }

    async function connected(execute: StreamTextHandler['execute']) {
      const exp = Math.floor((Date.now() + TOKEN_LIFETIME_MS) / 1000);
      vi.spyOn(mockJwtService, 'verify').mockReturnValue({
        sub: 'user-123',
        exp,
      } as never);
      const gw = new AIGateway(
        { execute } as unknown as StreamTextHandler,
        mockJwtService,
        mockFeatureFlags,
        createMockConfigService()
      );
      const client = createMockAISocket({
        handshake: { auth: { token: 'valid-jwt' }, headers: {} },
      });
      await gw.handleConnection(client);
      return { gw, client };
    }

    const complete = (
      gw: AIGateway,
      client: ReturnType<typeof createMockAISocket>
    ) =>
      gw.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      });

    const emitted = (client: ReturnType<typeof createMockAISocket>) =>
      vi
        .mocked(client.emit)
        .mock.calls.map(([event, payload]) =>
          event === 'ai:error'
            ? `${event}:${(payload as { code: string }).code}`
            : event
        );

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('lets the running completion finish, then asks for a fresh token and disconnects', async () => {
      const completion = streamingCompletion();
      const { gw, client } = await connected(completion.execute as never);

      const running = complete(gw, client);
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(emitted(client)).toEqual(['ai:chunk']);

      completion.finish();
      await running;

      expect(emitted(client)).toEqual([
        'ai:chunk',
        'ai:chunk',
        'ai:done',
        'ai:error:AUTH_REQUIRED',
      ]);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('lets a completion that started before expiry run even when expiry lands before its slot', async () => {
      let flagRead!: () => void;
      const flagGate = new Promise<void>((resolve) => {
        flagRead = resolve;
      });
      const execute = vi.fn(
        async (_input: unknown, callbacks: StreamTextCallbacks) => {
          callbacks.onChunk('A summary.');
          callbacks.onDone(USAGE as never);
        }
      );
      const { gw, client } = await connected(execute as never);
      vi.mocked(mockFeatureFlags.isEnabled).mockImplementationOnce(
        async () => (await flagGate, true)
      );

      const running = complete(gw, client);
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);
      expect(client.disconnect).not.toHaveBeenCalled();

      flagRead();
      await running;

      expect(execute).toHaveBeenCalledOnce();
      expect(emitted(client)).toEqual([
        'ai:chunk',
        'ai:done',
        'ai:error:AUTH_REQUIRED',
      ]);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('logs the deferred expiry', async () => {
      const log = vi
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      const completion = streamingCompletion();
      const { gw, client } = await connected(completion.execute as never);

      const running = complete(gw, client);
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ai.client.expiry_deferred',
          clientId: 'socket-1',
          userId: 'user-123',
        })
      );
      completion.finish();
      await running;
      log.mockRestore();
    });

    it('refuses a new completion on the expired socket without running it', async () => {
      const completion = streamingCompletion();
      const { gw, client } = await connected(completion.execute as never);
      const running = complete(gw, client);
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);

      await complete(gw, client);

      expect(emitted(client)).toEqual(['ai:chunk', 'ai:error:AUTH_REQUIRED']);
      expect(completion.execute).toHaveBeenCalledOnce();
      completion.finish();
      await running;
    });

    it('still lets the user stop the running completion, and then disconnects', async () => {
      const completion = streamingCompletion();
      const { gw, client } = await connected(completion.execute as never);
      const running = complete(gw, client);
      await vi.advanceTimersByTimeAsync(PAST_EXPIRY_MS);

      gw.handleCancel(client);
      await running;

      expect(emitted(client)).toEqual(['ai:chunk', 'ai:error:AUTH_REQUIRED']);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });
});
