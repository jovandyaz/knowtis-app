import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import type { AICache } from '../../domain/ports/ai-cache.port';
import type { AICompletionProvider } from '../../domain/ports/ai-provider.port';
import type { AIUsageRepository } from '../../domain/ports/ai-usage.repository';
import { createMockConfig } from '../../testing/create-mock-config';
import { createTestCatalog } from '../../testing/create-test-catalog';
import { AICompletionPipeline } from '../services/ai-completion-pipeline.service';
import type { AIConfigService } from '../services/ai-config.service';
import { AIOrchestrator } from '../services/ai-orchestrator.service';
import { AIRateLimitService } from '../services/ai-rate-limit.service';
import { PromptLoaderService } from '../services/prompt-loader.service';
import { CompleteTextHandler } from './complete-text.handler';

describe('CompleteTextHandler', () => {
  let handler: CompleteTextHandler;
  let pipeline: AICompletionPipeline;
  let mockProvider: AICompletionProvider;
  let mockUsageRepo: AIUsageRepository;

  beforeEach(() => {
    mockProvider = {
      generateCompletion: vi.fn().mockResolvedValue({
        text: 'AI generated summary',
        inputTokens: 100,
        outputTokens: 50,
        model: 'anthropic:claude-sonnet-4-20250514',
      }),
      streamCompletion: vi.fn(),
    };

    mockUsageRepo = {
      getDailyUsage: vi.fn().mockResolvedValue({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
        requestCount: 0,
      }),
      recordUsage: vi.fn(),
      getMetricsSummary: vi.fn(),
      getGlobalDailyUsage: vi.fn(),
      getGlobalMetricsSummary: vi.fn(),
    };

    handler = buildHandler();
  });

  function buildHandler(cache?: AICache): CompleteTextHandler {
    const mockConfig = createMockConfig();

    const mockAIConfigService = {
      getDefaultModel: vi
        .fn()
        .mockResolvedValue('anthropic:claude-sonnet-4-20250514'),
      getFastModel: vi
        .fn()
        .mockResolvedValue('anthropic:claude-haiku-4-5-20251001'),
      getFallbackModel: vi
        .fn()
        .mockResolvedValue('anthropic:claude-haiku-4-5-20251001'),
      setConfig: vi.fn().mockResolvedValue(undefined),
    } as unknown as AIConfigService;
    const promptLoader = new PromptLoaderService(
      join(__dirname, '../../prompts')
    );
    promptLoader.onModuleInit();
    const orchestrator = new AIOrchestrator(
      mockAIConfigService,
      promptLoader,
      createTestCatalog()
    );
    const rateLimitService = new AIRateLimitService(mockUsageRepo, mockConfig);
    pipeline = new AICompletionPipeline(
      orchestrator,
      rateLimitService,
      createTestCatalog(),
      cache
    );
    return new CompleteTextHandler(
      mockProvider,
      createTestCatalog(),
      pipeline,
      mockConfig
    );
  }

  it('should record zero cost for a cache hit while keeping token counts', async () => {
    const cache = {
      isCacheable: vi.fn().mockReturnValue(true),
      get: vi.fn().mockResolvedValue({
        text: 'cached summary',
        model: 'anthropic:claude-sonnet-4-20250514',
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.5,
      }),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as AICache;
    const cachedHandler = buildHandler(cache);

    const result = await cachedHandler.execute({
      userId: 'user-123',
      action: AI_ACTION.SUMMARIZE,
      content: 'Some content',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.text).toBe('cached summary');
    }
    expect(mockUsageRepo.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 10, outputTokens: 5, costUsd: 0 })
    );
    expect(mockProvider.generateCompletion).not.toHaveBeenCalled();
  });

  it('should generate a completion and record usage', async () => {
    const result = await handler.execute({
      userId: 'user-123',
      action: AI_ACTION.SUMMARIZE,
      content: 'Some long note content...',
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.text).toBe('AI generated summary');
    }
    expect(mockUsageRepo.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        action: AI_ACTION.SUMMARIZE,
        inputTokens: 100,
        outputTokens: 50,
      })
    );
  });

  it('should fail when rate limit exceeded', async () => {
    vi.spyOn(mockUsageRepo, 'getDailyUsage').mockResolvedValue({
      totalInputTokens: 99999,
      totalOutputTokens: 99999,
      totalCostUsd: 2.0,
      requestCount: 50,
    });
    const result = await handler.execute({
      userId: 'user-123',
      action: AI_ACTION.SUMMARIZE,
      content: 'Some content',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('AI_RATE_LIMIT_EXCEEDED');
    }
  });

  it('releases the reservation when the provider fails', async () => {
    vi.spyOn(mockProvider, 'generateCompletion').mockRejectedValue(
      new Error('provider exploded')
    );
    const releaseSpy = vi.spyOn(pipeline, 'releaseReservation');

    const result = await handler.execute({
      userId: 'user-123',
      action: AI_ACTION.SUMMARIZE,
      content: 'Some content',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('AI_PROVIDER_ERROR');
    }
    expect(releaseSpy).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedTokens: expect.any(Number) }),
      expect.objectContaining({ userId: 'user-123' })
    );
  });

  it('should fail for invalid action', async () => {
    const result = await handler.execute({
      userId: 'user-123',
      action: 'invalid-action',
      content: 'Some content',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('AI_INVALID_ACTION');
    }
  });

  it('should return a generic error message when the provider throws', async () => {
    vi.mocked(mockProvider.generateCompletion).mockRejectedValue(
      new Error('401 invalid x-api-key: sk-ant-...')
    );

    const result = await handler.execute({
      userId: 'user-1',
      action: AI_ACTION.SUMMARIZE,
      content: 'some text to summarize',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        'AI provider error: AI completion failed'
      );
      expect(result.error.message).not.toContain('sk-ant');
    }
  });
});
