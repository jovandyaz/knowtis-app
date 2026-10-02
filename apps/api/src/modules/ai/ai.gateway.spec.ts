import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ok } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { ShutdownDrain } from '../websocket/shutdown-drain';
import { TOKEN_EXPIRY_GRACE_MS } from '../websocket/socket-expiry';
import { AIGateway } from './ai.gateway';
import type { StreamTextCallbacks } from './application/commands/stream-text.handler';
import { StreamTextHandler } from './application/commands/stream-text.handler';
import type { AICompletionPipeline } from './application/services/ai-completion-pipeline.service';
import type { TierResolver } from './application/services/tier-resolver.service';
import { AIErrors } from './domain/errors/ai.errors';
import type { AiCaller } from './domain/execution-context/ai-execution-context';
import type { AICompletionProvider } from './domain/ports/ai-provider.port';
import { createExecutionContext } from './testing/create-execution-context';
import { createMockConfig } from './testing/create-mock-config';
import { createTestCatalog } from './testing/create-test-catalog';

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

function makeTierResolver() {
  return {
    resolve: vi.fn(async (caller: AiCaller) =>
      createExecutionContext({
        userId: caller.userId,
        tier: caller.isAnonymous ? 'anonymous' : 'free',
        ...(caller.clientIp ? { clientIp: caller.clientIp } : {}),
      })
    ),
  } as unknown as TierResolver;
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

const STREAM_MODEL = 'anthropic:claude-sonnet-4-20250514';

/** Streams one chunk, then closes without throwing once the signal aborts, as the AI SDK does. */
function createAbortClosedProvider(): AICompletionProvider {
  return {
    generateCompletion: vi.fn(),
    streamCompletion: vi.fn(
      (_prompt: string, options: { signal?: AbortSignal }) => ({
        textStream: (async function* () {
          yield 'partial';
          await new Promise<void>((resolve) =>
            options.signal?.addEventListener('abort', () => resolve(), {
              once: true,
            })
          );
        })(),
        usage: Promise.resolve({
          promptTokens: 0,
          completionTokens: 0,
          model: STREAM_MODEL,
        }),
      })
    ),
  } as unknown as AICompletionProvider;
}

function createReadyPipeline(
  recordCompletion: () => Promise<void>
): AICompletionPipeline {
  return {
    preflight: vi.fn(async () =>
      ok({
        kind: 'ready',
        context: {
          requestId: 'req-1',
          startTime: Date.now(),
          action: AI_ACTION.SUMMARIZE,
          model: STREAM_MODEL,
          systemPrompt: 'system',
          userPrompt: 'user',
          reservation: { estimate: { tokens: 10, costUsd: 0 } },
        },
      })
    ),
    recordCompletion: vi.fn(recordCompletion),
    releaseReservation: vi.fn(),
  } as unknown as AICompletionPipeline;
}

function emittedEvents(
  client: ReturnType<typeof createMockAISocket>
): string[] {
  return vi.mocked(client.emit).mock.calls.map(([event]) => String(event));
}

describe('AIGateway', () => {
  let gateway: AIGateway;
  let mockStreamHandler: StreamTextHandler;
  let mockJwtService: JwtService;
  let mockFeatureFlags: FeatureFlagsService;
  let tierResolver: TierResolver;

  beforeEach(() => {
    tierResolver = makeTierResolver();

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
      tierResolver,
      mockJwtService,
      mockFeatureFlags,
      new ShutdownDrain(),
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

    it('disconnects with AI_INTERNAL_ERROR and logs why when the ai_enabled check throws', async () => {
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      vi.mocked(mockFeatureFlags.isEnabled).mockRejectedValue(
        new Error('database down')
      );
      const client = createMockAISocket({
        handshake: { auth: { token: 'valid-jwt' }, headers: {} },
      });

      await gateway.handleConnection(client);

      expect(vi.mocked(client.emit).mock.calls).toEqual([
        [
          'ai:error',
          {
            code: 'AI_INTERNAL_ERROR',
            message: 'AI internal error: AI connection failed',
          },
        ],
      ]);
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith({
        event: 'ai.client.connect_failed',
        clientId: 'socket-1',
        userId: 'user-123',
        error: 'database down',
      });
      log.mockRestore();
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
          execution: expect.objectContaining({
            subject: { userId: 'user-123' },
            tier: 'free',
          }),
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

    it("streams on the anonymous caller's resolved execution context", async () => {
      const client = createMockAISocket();
      client.data.userId = 'user-123';
      client.data.isAnonymous = true;
      client.data.clientIp = '203.0.113.7';

      await gateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some note content to summarize',
      });

      expect(tierResolver.resolve).toHaveBeenCalledWith({
        userId: 'user-123',
        isAnonymous: true,
        clientIp: '203.0.113.7',
      });
      const resolved = await vi.mocked(tierResolver.resolve).mock.results[0]
        ?.value;
      expect(mockStreamHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({ execution: resolved }),
        expect.anything(),
        expect.any(AbortSignal)
      );
    });

    it('emits a provider error and never streams when tier resolution fails', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      vi.mocked(tierResolver.resolve).mockRejectedValue(new Error('db down'));
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some note content to summarize',
      });

      expect(client.emit).toHaveBeenCalledWith('ai:error', {
        code: 'AI_PROVIDER_ERROR',
        message: 'AI provider error: Model resolution failed',
      });
      expect(warn).toHaveBeenCalledWith({
        event: 'ai.tier.resolve_failed',
        userId: 'user-123',
        error: 'db down',
      });
      expect(mockStreamHandler.execute).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('frees the stream slot when tier resolution fails', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      vi.mocked(tierResolver.resolve)
        .mockRejectedValueOnce(new Error('db down'))
        .mockImplementation(async () => createExecutionContext());
      const singleStreamGateway = new AIGateway(
        mockStreamHandler,
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
        createMockConfigService(1)
      );
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await singleStreamGateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'first',
      });
      await singleStreamGateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'second',
      });

      expect(mockStreamHandler.execute).toHaveBeenCalledTimes(1);
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

    it('answers once with AI_INTERNAL_ERROR, logs why and never streams when the ai_enabled check throws', async () => {
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      vi.mocked(mockFeatureFlags.isEnabled).mockRejectedValue(
        new Error('database down')
      );
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      await gateway.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some note content to summarize',
      });

      expect(vi.mocked(client.emit).mock.calls).toEqual([
        [
          'ai:error',
          {
            code: 'AI_INTERNAL_ERROR',
            message: 'AI internal error: AI completion failed',
          },
        ],
      ]);
      expect(log).toHaveBeenCalledWith({
        event: 'ai.complete.flag_check_failed',
        clientId: 'socket-1',
        userId: 'user-123',
        error: 'database down',
      });
      expect(mockStreamHandler.execute).not.toHaveBeenCalled();
      log.mockRestore();
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
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
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
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
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
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
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
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
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
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
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
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
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

    it('ends a cancelled stream with neither ai:done nor ai:error', async () => {
      const gw = new AIGateway(
        new StreamTextHandler(
          createAbortClosedProvider(),
          createTestCatalog(),
          createReadyPipeline(async () => undefined),
          createMockConfig()
        ),
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
        createMockConfigService()
      );
      const client = createMockAISocket();
      client.data.userId = 'user-123';

      const running = gw.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      });
      await vi.waitFor(() =>
        expect(client.emit).toHaveBeenCalledWith('ai:chunk', {
          text: 'partial',
        })
      );
      gw.handleCancel(client);
      await running;

      expect(emittedEvents(client)).toEqual(['ai:chunk']);
    });
  });

  describe('handleDisconnect', () => {
    it('should abort active stream on disconnect', async () => {
      const blocking = createBlockingExecute();
      const gw = new AIGateway(
        { execute: blocking.fn } as unknown as StreamTextHandler,
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
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
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
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
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        new ShutdownDrain(),
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

  describe('shutdown drain', () => {
    function signedInClient() {
      const client = createMockAISocket();
      client.data.userId = 'user-123';
      return client;
    }

    it('refuses a stream that arrives while draining with the retryable provider error', async () => {
      const drain = new ShutdownDrain();
      const gw = new AIGateway(
        mockStreamHandler,
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        drain,
        createMockConfigService()
      );
      await drain.beforeApplicationShutdown();
      const client = signedInClient();

      await gw.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      });

      expect(mockStreamHandler.execute).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith(
        'ai:error',
        expect.objectContaining({ code: 'AI_PROVIDER_ERROR' })
      );
    });

    it('resolves only after the aborted stream has written its usage, then tells the client to retry', async () => {
      const order: string[] = [];
      let finishWrite!: () => void;
      const provider = createAbortClosedProvider();
      const pipeline = createReadyPipeline(
        () =>
          new Promise<void>((resolve) => {
            finishWrite = () => {
              order.push('usage written');
              resolve();
            };
          })
      );
      const drain = new ShutdownDrain();
      const gw = new AIGateway(
        new StreamTextHandler(
          provider,
          createTestCatalog(),
          pipeline,
          createMockConfig()
        ),
        tierResolver,
        mockJwtService,
        mockFeatureFlags,
        drain,
        createMockConfigService()
      );

      const client = signedInClient();
      const running = gw.handleComplete(client, {
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      });
      await vi.waitFor(() =>
        expect(provider.streamCompletion).toHaveBeenCalled()
      );
      const draining = drain.beforeApplicationShutdown().then(() => {
        order.push('drained');
      });
      await vi.waitFor(() =>
        expect(pipeline.recordCompletion).toHaveBeenCalled()
      );
      await flushAsync();
      finishWrite();
      await Promise.all([draining, running]);

      expect(order).toEqual(['usage written', 'drained']);
      expect(emittedEvents(client)).toEqual(['ai:chunk', 'ai:error']);
      expect(client.emit).toHaveBeenLastCalledWith(
        'ai:error',
        AIErrors.providerError('server restarting')
      );
    });

    it.each([
      [
        'ai:done',
        (callbacks?: StreamTextCallbacks) =>
          callbacks?.onDone({
            inputTokens: 1,
            outputTokens: 1,
            model: STREAM_MODEL,
            costUsd: 0,
          }),
      ],
      [
        'ai:error',
        (callbacks?: StreamTextCallbacks) =>
          callbacks?.onError(AIErrors.providerError('AI streaming failed')),
      ],
    ])(
      'sends nothing more for a stream that already sent %s when the drain aborts it',
      async (event, end) => {
        const blocking = createBlockingExecute();
        const drain = new ShutdownDrain();
        const gw = new AIGateway(
          { execute: blocking.fn } as unknown as StreamTextHandler,
          tierResolver,
          mockJwtService,
          mockFeatureFlags,
          drain,
          createMockConfigService()
        );
        const client = signedInClient();
        const running = gw.handleComplete(client, {
          action: AI_ACTION.SUMMARIZE,
          content: 'Some content',
        });
        await vi.waitFor(() => expect(blocking.callbacks).toBeDefined());

        end(blocking.callbacks);
        await drain.beforeApplicationShutdown();
        await running;

        expect(emittedEvents(client)).toEqual([event]);
      }
    );
  });
});
