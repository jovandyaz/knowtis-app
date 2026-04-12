import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import type { AICompletionProvider } from '../../domain/ports/ai-provider.port';
import type { AIUsageRepository } from '../../domain/ports/ai-usage.repository';
import { createMockConfig } from '../../testing/create-mock-config';
import { AICompletionPipeline } from '../services/ai-completion-pipeline.service';
import type { AIConfigService } from '../services/ai-config.service';
import { AIOrchestrator } from '../services/ai-orchestrator.service';
import { AIRateLimitService } from '../services/ai-rate-limit.service';
import { PromptLoaderService } from '../services/prompt-loader.service';
import { CompleteTextHandler } from './complete-text.handler';

describe('CompleteTextHandler', () => {
  let handler: CompleteTextHandler;
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
      getAllConfig: vi.fn().mockResolvedValue({}),
      setConfig: vi.fn().mockResolvedValue(undefined),
    } as unknown as AIConfigService;
    const promptLoader = new PromptLoaderService(
      join(__dirname, '../../prompts')
    );
    promptLoader.onModuleInit();
    const orchestrator = new AIOrchestrator(mockAIConfigService, promptLoader);
    const rateLimitService = new AIRateLimitService(mockUsageRepo, mockConfig);
    const pipeline = new AICompletionPipeline(orchestrator, rateLimitService);
    handler = new CompleteTextHandler(mockProvider, pipeline, mockConfig);
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
});
