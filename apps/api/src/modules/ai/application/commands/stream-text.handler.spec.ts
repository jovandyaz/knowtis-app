import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import type { AICompletionProvider } from '../../domain/ports/ai-provider.port';
import type { AIUsageRepository } from '../../domain/ports/ai-usage.repository';
import { createMockConfig } from '../../testing/create-mock-config';
import { AIOrchestrator } from '../services/ai-orchestrator.service';
import { AIRateLimitService } from '../services/ai-rate-limit.service';
import {
  StreamTextHandler,
  type StreamTextCallbacks,
} from './stream-text.handler';

function createAsyncStream(chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

describe('StreamTextHandler', () => {
  let handler: StreamTextHandler;
  let mockProvider: AICompletionProvider;
  let mockUsageRepo: AIUsageRepository;
  let callbacks: StreamTextCallbacks;
  let collectedChunks: string[];
  let doneResult: Parameters<StreamTextCallbacks['onDone']>[0] | null;
  let errorResult: Parameters<StreamTextCallbacks['onError']>[0] | null;

  beforeEach(() => {
    collectedChunks = [];
    doneResult = null;
    errorResult = null;

    callbacks = {
      onChunk: (text) => collectedChunks.push(text),
      onDone: (usage) => {
        doneResult = usage;
      },
      onError: (error) => {
        errorResult = error;
      },
    };

    mockProvider = {
      generateCompletion: vi.fn(),
      streamCompletion: vi.fn().mockReturnValue({
        textStream: createAsyncStream(['Hello', ' world']),
        usage: Promise.resolve({ promptTokens: 80, completionTokens: 30 }),
      }),
    };

    mockUsageRepo = {
      getDailyUsage: vi.fn().mockResolvedValue({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
      }),
      recordUsage: vi.fn(),
      getMetricsSummary: vi.fn(),
    };

    const mockConfig = createMockConfig();

    const orchestrator = new AIOrchestrator(mockConfig);
    const rateLimitService = new AIRateLimitService(mockUsageRepo, mockConfig);
    handler = new StreamTextHandler(
      mockProvider,
      orchestrator,
      rateLimitService,
      mockConfig
    );
  });

  it('should stream chunks and call onDone with usage', async () => {
    await handler.execute(
      {
        userId: 'user-123',
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      },
      callbacks
    );

    expect(collectedChunks).toEqual(['Hello', ' world']);
    expect(doneResult).toBeTruthy();
    expect(doneResult!.inputTokens).toBe(80);
    expect(doneResult!.outputTokens).toBe(30);
    expect(mockUsageRepo.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        action: AI_ACTION.SUMMARIZE,
        inputTokens: 80,
        outputTokens: 30,
      })
    );
  });

  it('should call onError for invalid action', async () => {
    await handler.execute(
      { userId: 'user-123', action: 'invalid', content: 'Some content' },
      callbacks
    );

    expect(errorResult).toBeTruthy();
    expect(errorResult!.code).toBe('AI_INVALID_ACTION');
    expect(collectedChunks).toHaveLength(0);
  });

  it('should call onError when rate limit exceeded', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 99999,
      totalOutputTokens: 99999,
      totalCostUsd: 2.0,
    });

    await handler.execute(
      {
        userId: 'user-123',
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      },
      callbacks
    );

    expect(errorResult).toBeTruthy();
    expect(errorResult!.code).toBe('AI_RATE_LIMIT_EXCEEDED');
  });

  it('should call onError when provider throws', async () => {
    vi.spyOn(mockProvider, 'streamCompletion').mockImplementation(() => {
      throw new Error('Provider connection failed');
    });

    await handler.execute(
      {
        userId: 'user-123',
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      },
      callbacks
    );

    expect(errorResult).toBeTruthy();
    expect(errorResult!.code).toBe('AI_PROVIDER_ERROR');
    expect(errorResult!.message).toContain('Provider connection failed');
  });

  it('should stop streaming when signal is aborted', async () => {
    const controller = new AbortController();

    vi.spyOn(mockProvider, 'streamCompletion').mockReturnValue({
      textStream: (async function* () {
        yield 'First';
        controller.abort();
        yield 'Second';
        yield 'Third';
      })(),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 5 }),
    });

    await handler.execute(
      {
        userId: 'user-123',
        action: AI_ACTION.SUMMARIZE,
        content: 'Some content',
      },
      callbacks,
      controller.signal
    );

    expect(collectedChunks).toEqual(['First']);
  });

  it('should build translate prompt correctly', async () => {
    await handler.execute(
      {
        userId: 'user-123',
        action: AI_ACTION.TRANSLATE,
        content: 'Hello world',
        targetLanguage: 'Spanish',
      },
      callbacks
    );

    expect(mockProvider.streamCompletion).toHaveBeenCalledWith(
      'Translate to Spanish:\n\nHello world',
      expect.any(Object)
    );
  });

  it('should build tone prompt correctly', async () => {
    vi.spyOn(mockProvider, 'streamCompletion').mockReturnValue({
      textStream: createAsyncStream(['Rewritten']),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 5 }),
    });

    await handler.execute(
      {
        userId: 'user-123',
        action: AI_ACTION.TONE,
        content: 'Hello world',
        targetTone: 'formal',
      },
      callbacks
    );

    expect(mockProvider.streamCompletion).toHaveBeenCalledWith(
      'Rewrite in a formal tone:\n\nHello world',
      expect.any(Object)
    );
  });
});
