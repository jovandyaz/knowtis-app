import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIConfigService } from './ai-config.service';

const CURATED_DEFAULT = 'anthropic:claude-sonnet-5';
const CURATED_FAST = 'anthropic:claude-haiku-4-5-20251001';
const ACTOR = 'admin-user-id';

describe('AIConfigService', () => {
  let service: AIConfigService;
  let mockRepo: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    getAllRows: ReturnType<typeof vi.fn>;
  };
  let mockCache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };
  let mockConfigService: { get: ReturnType<typeof vi.fn> };
  let mockAudit: { record: ReturnType<typeof vi.fn> };
  let mockRegistry: { isModelAvailable: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepo = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      getAllRows: vi.fn().mockResolvedValue([]),
    };
    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      del: vi.fn(),
    };
    mockConfigService = {
      get: vi.fn((key: string) => {
        const defaults: Record<string, string> = {
          AI_DEFAULT_MODEL: CURATED_DEFAULT,
          AI_FAST_MODEL: CURATED_FAST,
        };
        return defaults[key];
      }),
    };
    mockAudit = { record: vi.fn().mockResolvedValue(undefined) };
    mockRegistry = { isModelAvailable: vi.fn().mockReturnValue(true) };
    service = new AIConfigService(
      mockRepo as any,
      mockCache as any,
      mockConfigService as any,
      mockAudit as any,
      mockRegistry as any
    );
  });

  it('should return DB value when set', async () => {
    mockRepo.get.mockResolvedValue(CURATED_DEFAULT);
    const model = await service.getDefaultModel();
    expect(model).toBe(CURATED_DEFAULT);
  });

  it('should fall back to env when DB has no value', async () => {
    mockRepo.get.mockResolvedValue(null);
    const model = await service.getDefaultModel();
    expect(model).toBe(CURATED_DEFAULT);
  });

  it('should use cache on second call', async () => {
    mockRepo.get.mockResolvedValue(CURATED_DEFAULT);
    await service.getDefaultModel();

    mockCache.get.mockResolvedValue(CURATED_DEFAULT);
    await service.getDefaultModel();

    expect(mockRepo.get).toHaveBeenCalledTimes(1);
  });

  it('should invalidate cache on set', async () => {
    await service.setConfig('ai_default_model', CURATED_DEFAULT, ACTOR);
    expect(mockCache.del).toHaveBeenCalled();
    expect(mockRepo.set).toHaveBeenCalled();
  });

  it('should fall back to env on DB error', async () => {
    mockRepo.get.mockRejectedValue(new Error('DB down'));
    const model = await service.getDefaultModel();
    expect(model).toBe(CURATED_DEFAULT);
  });

  it('should throw on unknown config key', async () => {
    await expect(
      service.setConfig('ai_unknown_key', CURATED_DEFAULT, ACTOR)
    ).rejects.toThrow("Unknown AI config key: 'ai_unknown_key'");
    expect(mockRepo.set).not.toHaveBeenCalled();
  });

  it('should reject a value that is not a curated model id', async () => {
    await expect(
      service.setConfig('ai_default_model', 'anthropic:not-a-model', ACTOR)
    ).rejects.toThrow("'anthropic:not-a-model' is not a curated model id");
    expect(mockRepo.set).not.toHaveBeenCalled();
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('should reject a curated model the server cannot invoke', async () => {
    mockRegistry.isModelAvailable.mockReturnValue(false);
    await expect(
      service.setConfig('ai_default_model', CURATED_DEFAULT, ACTOR)
    ).rejects.toThrow('is not invocable');
    expect(mockRepo.set).not.toHaveBeenCalled();
  });

  it('should reject prototype-chain keys that are not own config keys', async () => {
    await expect(
      service.setConfig('toString', CURATED_DEFAULT, ACTOR)
    ).rejects.toThrow("Unknown AI config key: 'toString'");
    expect(mockRepo.set).not.toHaveBeenCalled();
  });

  it('should record an audit entry with before/after values on set', async () => {
    mockRepo.get.mockResolvedValue(CURATED_FAST);
    await service.setConfig('ai_default_model', CURATED_DEFAULT, ACTOR);
    expect(mockAudit.record).toHaveBeenCalledWith({
      actorId: ACTOR,
      action: 'ai_config.updated',
      targetType: 'ai_config',
      targetId: 'ai_default_model',
      before: { value: CURATED_FAST },
      after: { value: CURATED_DEFAULT },
    });
  });

  it('should omit before when no previous value exists', async () => {
    mockRepo.get.mockResolvedValue(null);
    await service.setConfig('ai_default_model', CURATED_DEFAULT, ACTOR);
    expect(mockAudit.record).toHaveBeenCalledWith({
      actorId: ACTOR,
      action: 'ai_config.updated',
      targetType: 'ai_config',
      targetId: 'ai_default_model',
      after: { value: CURATED_DEFAULT },
    });
  });

  it('should resolve effective config from DB rows and env fallbacks', async () => {
    const updatedAt = new Date('2026-07-15T00:00:00Z');
    mockRepo.getAllRows.mockResolvedValue([
      {
        key: 'ai_default_model',
        value: CURATED_DEFAULT,
        description: null,
        updatedAt,
      },
    ]);
    const entries = await service.getEffectiveConfig();
    expect(entries).toEqual([
      {
        key: 'ai_default_model',
        value: CURATED_DEFAULT,
        source: 'database',
        description: null,
        updatedAt,
      },
      {
        key: 'ai_fast_model',
        value: CURATED_FAST,
        source: 'environment',
        description: null,
        updatedAt: null,
      },
    ]);
  });
});
