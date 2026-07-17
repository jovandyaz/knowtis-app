import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AIConfigService } from './ai-config.service';

const CURATED_DEFAULT = 'anthropic:claude-sonnet-5';
const CURATED_FAST = 'anthropic:claude-haiku-4-5-20251001';
const ENV_CHAIN = 'anthropic:claude-haiku-4-5-20251001,openai:gpt-4o-mini';
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
  let mockCatalog: { isSupported: ReturnType<typeof vi.fn> };

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
          AI_FALLBACK_CHAIN: ENV_CHAIN,
        };
        return defaults[key];
      }),
    };
    mockAudit = { record: vi.fn().mockResolvedValue(undefined) };
    mockRegistry = { isModelAvailable: vi.fn().mockReturnValue(true) };
    mockCatalog = { isSupported: vi.fn().mockReturnValue(true) };
    service = new AIConfigService(
      mockRepo as any,
      mockCache as any,
      mockConfigService as any,
      mockAudit as any,
      mockRegistry as any,
      mockCatalog as any
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

  it('should report success when cache invalidation fails after a persisted write', async () => {
    mockCache.del.mockRejectedValue(new Error('cache down'));
    await expect(
      service.setConfig('ai_default_model', CURATED_DEFAULT, ACTOR)
    ).resolves.toBeUndefined();
    expect(mockRepo.set).toHaveBeenCalled();
    expect(mockAudit.record).toHaveBeenCalled();
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
        kind: 'model',
        source: 'database',
        description: null,
        updatedAt,
      },
      {
        key: 'ai_fast_model',
        value: CURATED_FAST,
        kind: 'model',
        source: 'environment',
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_fallback_chain',
        value: ENV_CHAIN,
        kind: 'chain',
        source: 'environment',
        description: null,
        updatedAt: null,
      },
    ]);
  });

  it('should resolve every key from env when the DB is unavailable', async () => {
    mockRepo.getAllRows.mockRejectedValue(new Error('DB down'));
    const entries = await service.getEffectiveConfig();
    expect(entries).toEqual([
      {
        key: 'ai_default_model',
        value: CURATED_DEFAULT,
        kind: 'model',
        source: 'environment',
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_fast_model',
        value: CURATED_FAST,
        kind: 'model',
        source: 'environment',
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_fallback_chain',
        value: ENV_CHAIN,
        kind: 'chain',
        source: 'environment',
        description: null,
        updatedAt: null,
      },
    ]);
  });

  describe('fallback chain', () => {
    it('should parse the env chain into a trimmed list of model ids', async () => {
      const chain = await service.getFallbackChain();
      expect(chain).toEqual([
        'anthropic:claude-haiku-4-5-20251001',
        'openai:gpt-4o-mini',
      ]);
    });

    it('should return the DB chain over the env default', async () => {
      mockRepo.get.mockResolvedValue('google:gemini-2.0-flash');
      const chain = await service.getFallbackChain();
      expect(chain).toEqual(['google:gemini-2.0-flash']);
    });

    it('should drop chain models the catalog no longer supports', async () => {
      mockRepo.get.mockResolvedValue(
        'anthropic:claude-haiku-4-5-20251001,openai:ghost-model'
      );
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== 'openai:ghost-model'
      );

      const chain = await service.getFallbackChain();

      expect(chain).toEqual(['anthropic:claude-haiku-4-5-20251001']);
    });

    it('should persist a valid chain', async () => {
      await service.setConfig('ai_fallback_chain', ENV_CHAIN, ACTOR);
      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_fallback_chain',
        ENV_CHAIN,
        undefined
      );
    });

    it('should reject an empty chain', async () => {
      await expect(
        service.setConfig('ai_fallback_chain', '  ', ACTOR)
      ).rejects.toThrow('Fallback chain must list at least one model');
      expect(mockRepo.set).not.toHaveBeenCalled();
    });

    it('should reject a chain with a model missing from the catalog', async () => {
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== 'openai:ghost-model'
      );
      await expect(
        service.setConfig(
          'ai_fallback_chain',
          'anthropic:claude-haiku-4-5-20251001,openai:ghost-model',
          ACTOR
        )
      ).rejects.toThrow('openai:ghost-model');
      expect(mockRepo.set).not.toHaveBeenCalled();
    });

    it('should reject a chain with no model invocable by the server', async () => {
      mockRegistry.isModelAvailable.mockReturnValue(false);
      await expect(
        service.setConfig('ai_fallback_chain', ENV_CHAIN, ACTOR)
      ).rejects.toThrow('at least one must be routable');
      expect(mockRepo.set).not.toHaveBeenCalled();
    });
  });
});
