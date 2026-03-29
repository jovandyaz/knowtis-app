import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIConfigService } from './ai-config.service';

describe('AIConfigService', () => {
  let service: AIConfigService;
  let mockRepo: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    getAll: ReturnType<typeof vi.fn>;
  };
  let mockCache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepo = {
      get: vi.fn(),
      set: vi.fn(),
      getAll: vi.fn(),
    };
    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      del: vi.fn(),
    };
    mockConfigService = {
      get: vi.fn((key: string) => {
        const defaults: Record<string, string> = {
          AI_DEFAULT_MODEL: 'anthropic:claude-sonnet-4-20250514',
          AI_FAST_MODEL: 'anthropic:claude-haiku-4-5-20251001',
          AI_FALLBACK_MODEL: 'anthropic:claude-haiku-4-5-20251001',
        };
        return defaults[key];
      }),
    };
    service = new AIConfigService(
      mockRepo as any,
      mockCache as any,
      mockConfigService as any
    );
  });

  it('should return DB value when set', async () => {
    mockRepo.get.mockResolvedValue('anthropic:claude-sonnet-4-20250514');
    const model = await service.getDefaultModel();
    expect(model).toBe('anthropic:claude-sonnet-4-20250514');
  });

  it('should fall back to env when DB has no value', async () => {
    mockRepo.get.mockResolvedValue(null);
    const model = await service.getDefaultModel();
    expect(model).toBe('anthropic:claude-sonnet-4-20250514');
  });

  it('should use cache on second call', async () => {
    mockRepo.get.mockResolvedValue('anthropic:claude-sonnet-4-20250514');
    await service.getDefaultModel();

    mockCache.get.mockResolvedValue('anthropic:claude-sonnet-4-20250514');
    await service.getDefaultModel();

    expect(mockRepo.get).toHaveBeenCalledTimes(1);
  });

  it('should invalidate cache on set', async () => {
    await service.setConfig(
      'ai_default_model',
      'anthropic:claude-sonnet-4-20250514'
    );
    expect(mockCache.del).toHaveBeenCalled();
    expect(mockRepo.set).toHaveBeenCalled();
  });

  it('should fall back to env on DB error', async () => {
    mockRepo.get.mockRejectedValue(new Error('DB down'));
    const model = await service.getDefaultModel();
    expect(model).toBe('anthropic:claude-sonnet-4-20250514');
  });

  it('should throw on unknown config key', async () => {
    await expect(
      service.setConfig('ai_unknown_key', 'some-value')
    ).rejects.toThrow("Unknown AI config key: 'ai_unknown_key'");
    expect(mockRepo.set).not.toHaveBeenCalled();
  });
});
