import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ACTION } from '@knowtis/shared-types';

import type { CachedResult } from '../../domain/ports/ai-cache.port';
import { createMockConfig } from '../../testing/create-mock-config';
import type { AIRedisProvider } from './ai-redis.provider';
import { ExactMatchCacheService } from './exact-match-cache.service';

describe('ExactMatchCacheService', () => {
  let service: ExactMatchCacheService;
  let mockRedis: AIRedisProvider;
  let mockConfig: ReturnType<typeof createMockConfig>;
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();

    mockRedis = {
      client: {
        get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        set: vi.fn((key: string, value: string) => {
          store.set(key, value);
          return Promise.resolve('OK');
        }),
      },
    } as unknown as AIRedisProvider;

    mockConfig = createMockConfig();

    service = new ExactMatchCacheService(mockRedis, mockConfig);
  });

  it('should identify cacheable actions', () => {
    expect(service.isCacheable(AI_ACTION.SUMMARIZE)).toBe(true);
    expect(service.isCacheable(AI_ACTION.TRANSLATE)).toBe(true);
    expect(service.isCacheable(AI_ACTION.OUTLINE)).toBe(true);
    expect(service.isCacheable(AI_ACTION.ACTION_ITEMS)).toBe(true);
    expect(service.isCacheable(AI_ACTION.TONE)).toBe(false);
    expect(service.isCacheable('grammar')).toBe(false);
  });

  it('should return null on cache miss', async () => {
    const result = await service.get(
      AI_ACTION.SUMMARIZE,
      'model-1',
      'prompt text'
    );
    expect(result).toBeNull();
  });

  it('should store and retrieve cached result', async () => {
    const cached: CachedResult = {
      text: 'Summary text',
      model: 'anthropic:claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
    };

    await service.set(
      AI_ACTION.SUMMARIZE,
      'anthropic:claude-sonnet-4-20250514',
      'prompt text',
      cached
    );
    const result = await service.get(
      AI_ACTION.SUMMARIZE,
      'anthropic:claude-sonnet-4-20250514',
      'prompt text'
    );

    expect(result).toEqual(cached);
  });

  it('should return null when cache is disabled', async () => {
    vi.spyOn(mockConfig, 'get').mockImplementation((key: string) => {
      if (key === 'AI_CACHE_ENABLED') {
        return false;
      }
      return 3600;
    });

    await service.set(AI_ACTION.SUMMARIZE, 'model-1', 'prompt text', {
      text: 'result',
      model: 'model-1',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    expect(store.size).toBe(0);
    const result = await service.get(
      AI_ACTION.SUMMARIZE,
      'model-1',
      'prompt text'
    );
    expect(result).toBeNull();
  });

  it('should return null gracefully on Redis error', async () => {
    vi.spyOn(mockRedis.client, 'get').mockRejectedValue(
      new Error('Redis down')
    );
    const result = await service.get(
      AI_ACTION.SUMMARIZE,
      'model-1',
      'prompt text'
    );
    expect(result).toBeNull();
  });

  it('should produce different keys for different prompts', async () => {
    const cached: CachedResult = {
      text: 'Result A',
      model: 'model-1',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    };

    await service.set(AI_ACTION.SUMMARIZE, 'model-1', 'prompt A', cached);
    const resultA = await service.get(
      AI_ACTION.SUMMARIZE,
      'model-1',
      'prompt A'
    );
    const resultB = await service.get(
      AI_ACTION.SUMMARIZE,
      'model-1',
      'prompt B'
    );

    expect(resultA).toEqual(cached);
    expect(resultB).toBeNull();
  });
});
