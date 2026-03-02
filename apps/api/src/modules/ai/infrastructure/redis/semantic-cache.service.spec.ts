import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import type { CachedResult } from '../../domain/ports/ai-cache.port';
import type { AIRedisProvider } from './ai-redis.provider';
import { SemanticCacheService } from './semantic-cache.service';

type TypedConfigService = ConfigService<EnvConfig, true>;

describe('SemanticCacheService', () => {
  let service: SemanticCacheService;
  let mockRedis: AIRedisProvider;
  let mockConfig: TypedConfigService;
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

    mockConfig = {
      get: vi.fn((key: string) => {
        const config: Record<string, unknown> = {
          AI_CACHE_TTL_SECONDS: 3600,
          AI_CACHE_ENABLED: 'true',
        };
        return config[key];
      }),
    } as unknown as TypedConfigService;

    service = new SemanticCacheService(mockRedis, mockConfig);
  });

  it('should identify cacheable actions', () => {
    expect(service.isCacheable('summarize')).toBe(true);
    expect(service.isCacheable('translate')).toBe(true);
    expect(service.isCacheable('outline')).toBe(true);
    expect(service.isCacheable('action-items')).toBe(true);
    expect(service.isCacheable('tone')).toBe(false);
    expect(service.isCacheable('grammar')).toBe(false);
  });

  it('should return null on cache miss', async () => {
    const result = await service.get('summarize', 'model-1', 'prompt text');
    expect(result).toBeNull();
  });

  it('should store and retrieve cached result', async () => {
    const cached: CachedResult = {
      text: 'Summary text',
      model: 'anthropic:claude-sonnet-4-5-20250929',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
    };

    await service.set(
      'summarize',
      'anthropic:claude-sonnet-4-5-20250929',
      'prompt text',
      cached
    );
    const result = await service.get(
      'summarize',
      'anthropic:claude-sonnet-4-5-20250929',
      'prompt text'
    );

    expect(result).toEqual(cached);
  });

  it('should return null when cache is disabled', async () => {
    vi.spyOn(mockConfig, 'get').mockImplementation((key: string) => {
      if (key === 'AI_CACHE_ENABLED') {return 'false';}
      return 3600;
    });

    await service.set('summarize', 'model-1', 'prompt text', {
      text: 'result',
      model: 'model-1',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
    });

    expect(store.size).toBe(0);
    const result = await service.get('summarize', 'model-1', 'prompt text');
    expect(result).toBeNull();
  });

  it('should return null gracefully on Redis error', async () => {
    vi.spyOn(mockRedis.client, 'get').mockRejectedValue(
      new Error('Redis down')
    );
    const result = await service.get('summarize', 'model-1', 'prompt text');
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

    await service.set('summarize', 'model-1', 'prompt A', cached);
    const resultA = await service.get('summarize', 'model-1', 'prompt A');
    const resultB = await service.get('summarize', 'model-1', 'prompt B');

    expect(resultA).toEqual(cached);
    expect(resultB).toBeNull();
  });
});
