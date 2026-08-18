import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN,
  REASONING_EFFORTS,
} from '@knowtis/shared-types';

import { AI_SETTING_DEFAULTS } from '../../domain/ai-settings';
import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import { CompositeModelCatalog } from '../../infrastructure/catalog/composite-model-catalog';
import { ModelCatalogAdapter } from '../../infrastructure/catalog/model-catalog.adapter';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { createCatalogModel } from '../../testing/create-catalog-model';
import { createCatalogRepositoryStub } from '../../testing/create-catalog-repository-stub';
import { createMockConfig } from '../../testing/create-mock-config';
import { AIConfigService, InvalidAIConfigError } from './ai-config.service';

const CUSTOM_MODEL = 'anthropic:claude-sonnet-5';
const CUSTOM_FAST = 'anthropic:claude-haiku-4-5-20251001';
const A_VALID_CHAIN = 'anthropic:claude-haiku-4-5-20251001,openai:gpt-4o-mini';
const ACTOR = 'admin-user-id';
const PROMOTED_ID = 'openrouter:vendor/promoted-one';
const UNKNOWN_ID = 'openrouter:vendor/unknown-one';

function deletedRow(value: string) {
  return {
    key: 'ai_default_model',
    value,
    description: null,
    updatedAt: new Date('2026-07-15T00:00:00Z'),
  };
}

describe('AIConfigService', () => {
  let service: AIConfigService;
  let mockRepo: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    getAllRows: ReturnType<typeof vi.fn>;
  };
  let mockCache: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };
  let mockAudit: { record: ReturnType<typeof vi.fn> };
  let mockRegistry: { isModelAvailable: ReturnType<typeof vi.fn> };
  let mockCatalog: { isSupported: ReturnType<typeof vi.fn> };
  let mockPromoted: { snapshot: ReturnType<typeof vi.fn> };

  /** Wires the real promoted cache and composite catalog so promoted models reach validation exactly as they do at runtime. */
  async function serviceWith(models: readonly CatalogModel[]) {
    const promoted = new PromotedModelsCache(
      createCatalogRepositoryStub(async () => [...models])
    );
    await promoted.onModuleInit();
    const catalog = new CompositeModelCatalog(
      promoted,
      new ModelCatalogAdapter(
        createMockConfig({ AI_PRICING_REFRESH_ENABLED: false })
      )
    );
    return new AIConfigService(
      mockRepo as never,
      mockCache as never,
      mockAudit as never,
      mockRegistry as never,
      catalog,
      promoted
    );
  }

  beforeEach(() => {
    mockRepo = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      delete: vi.fn().mockResolvedValue(null),
      getAllRows: vi.fn().mockResolvedValue([]),
    };
    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      del: vi.fn(),
    };
    mockAudit = { record: vi.fn().mockResolvedValue(undefined) };
    mockRegistry = { isModelAvailable: vi.fn().mockReturnValue(true) };
    mockCatalog = { isSupported: vi.fn().mockReturnValue(true) };
    mockPromoted = { snapshot: vi.fn().mockReturnValue([]) };
    service = new AIConfigService(
      mockRepo as never,
      mockCache as never,
      mockAudit as never,
      mockRegistry as never,
      mockCatalog as never,
      mockPromoted as never
    );
  });

  it('should return DB value when set', async () => {
    mockRepo.get.mockResolvedValue(CUSTOM_MODEL);
    const model = await service.getDefaultModel();
    expect(model).toBe(CUSTOM_MODEL);
  });

  it('should fall back to the code default when no row exists', async () => {
    mockRepo.get.mockResolvedValue(null);
    expect(await service.getDefaultModel()).toBe(
      AI_SETTING_DEFAULTS.ai_default_model
    );
  });

  it('should use cache on second call', async () => {
    mockRepo.get.mockResolvedValue(CUSTOM_MODEL);
    await service.getDefaultModel();

    mockCache.get.mockResolvedValue(CUSTOM_MODEL);
    await service.getDefaultModel();

    expect(mockRepo.get).toHaveBeenCalledTimes(1);
  });

  it('should invalidate cache on set', async () => {
    await service.setConfig('ai_default_model', CUSTOM_MODEL, ACTOR);
    expect(mockCache.del).toHaveBeenCalled();
    expect(mockRepo.set).toHaveBeenCalled();
  });

  it('should fall back to the code default on DB error', async () => {
    mockRepo.get.mockRejectedValue(new Error('DB down'));
    expect(await service.getDefaultModel()).toBe(
      AI_SETTING_DEFAULTS.ai_default_model
    );
  });

  it('should throw on unknown config key', async () => {
    await expect(
      service.setConfig('ai_unknown_key', CUSTOM_MODEL, ACTOR)
    ).rejects.toThrow("Unknown AI config key: 'ai_unknown_key'");
    expect(mockRepo.set).not.toHaveBeenCalled();
  });

  it('should reject a value that is neither curated nor promoted', async () => {
    await expect(
      service.setConfig('ai_default_model', 'anthropic:not-a-model', ACTOR)
    ).rejects.toThrow("'anthropic:not-a-model' is not a selectable model id");
    expect(mockRepo.set).not.toHaveBeenCalled();
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('should reject a curated model the server cannot invoke', async () => {
    mockRegistry.isModelAvailable.mockReturnValue(false);
    await expect(
      service.setConfig('ai_default_model', CUSTOM_MODEL, ACTOR)
    ).rejects.toThrow('is not invocable');
    expect(mockRepo.set).not.toHaveBeenCalled();
  });

  it('should reject prototype-chain keys that are not own config keys', async () => {
    await expect(
      service.setConfig('toString', CUSTOM_MODEL, ACTOR)
    ).rejects.toThrow("Unknown AI config key: 'toString'");
    expect(mockRepo.set).not.toHaveBeenCalled();
  });

  it('should record an audit entry with before/after values on set', async () => {
    mockRepo.get.mockResolvedValue(CUSTOM_FAST);
    await service.setConfig('ai_default_model', CUSTOM_MODEL, ACTOR);
    expect(mockAudit.record).toHaveBeenCalledWith({
      actorId: ACTOR,
      action: 'ai_config.updated',
      targetType: 'ai_config',
      targetId: 'ai_default_model',
      before: { value: CUSTOM_FAST },
      after: { value: CUSTOM_MODEL },
    });
  });

  it('should omit before when no previous value exists', async () => {
    mockRepo.get.mockResolvedValue(null);
    await service.setConfig('ai_default_model', CUSTOM_MODEL, ACTOR);
    expect(mockAudit.record).toHaveBeenCalledWith({
      actorId: ACTOR,
      action: 'ai_config.updated',
      targetType: 'ai_config',
      targetId: 'ai_default_model',
      after: { value: CUSTOM_MODEL },
    });
  });

  it('should report success when cache invalidation fails after a persisted write', async () => {
    mockCache.del.mockRejectedValue(new Error('cache down'));
    await expect(
      service.setConfig('ai_default_model', CUSTOM_MODEL, ACTOR)
    ).resolves.toBeUndefined();
    expect(mockRepo.set).toHaveBeenCalled();
    expect(mockAudit.record).toHaveBeenCalled();
  });

  it('should throw when resetting an unknown config key', async () => {
    await expect(service.resetConfig('ai_unknown_key', ACTOR)).rejects.toThrow(
      "Unknown AI config key: 'ai_unknown_key'"
    );
    expect(mockRepo.delete).not.toHaveBeenCalled();
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('should delete the row and invalidate the cache on reset', async () => {
    mockRepo.delete.mockResolvedValue(deletedRow(CUSTOM_MODEL));
    await service.resetConfig('ai_default_model', ACTOR);
    expect(mockRepo.delete).toHaveBeenCalledWith('ai_default_model');
    expect(mockCache.del).toHaveBeenCalledWith('ai:config:ai_default_model');
  });

  it('should audit the atomically deleted value without a preliminary read', async () => {
    mockRepo.delete.mockResolvedValue(deletedRow(CUSTOM_MODEL));
    await service.resetConfig('ai_default_model', ACTOR);
    expect(mockRepo.get).not.toHaveBeenCalled();
    expect(mockAudit.record).toHaveBeenCalledWith({
      actorId: ACTOR,
      action: 'ai_config.reset',
      targetType: 'ai_config',
      targetId: 'ai_default_model',
      before: { value: CUSTOM_MODEL },
    });
  });

  it('should neither audit nor error when resetting a key with no stored row', async () => {
    mockRepo.delete.mockResolvedValue(null);
    await expect(
      service.resetConfig('ai_default_model', ACTOR)
    ).resolves.toBeUndefined();
    expect(mockAudit.record).not.toHaveBeenCalled();
    expect(mockCache.del).not.toHaveBeenCalled();
  });

  it('should report a rowless key as default and a stored one as custom', async () => {
    mockRepo.getAllRows.mockResolvedValue([
      {
        key: 'ai_default_model',
        value: 'openrouter:minimax/minimax-m2.5',
        description: null,
        updatedAt: new Date('2026-07-15T00:00:00Z'),
      },
    ]);
    const entries = await service.getEffectiveConfig();
    expect(entries.find((e) => e.key === 'ai_default_model')?.source).toBe(
      'custom'
    );
    expect(entries.find((e) => e.key === 'ai_fast_model')?.source).toBe(
      'default'
    );
  });

  it('should report a stored model the catalog dropped as the code default the runtime serves', async () => {
    mockRepo.getAllRows.mockResolvedValue([
      {
        key: 'ai_default_model',
        value: UNKNOWN_ID,
        description: 'promoted then retired',
        updatedAt: new Date('2026-07-15T00:00:00Z'),
      },
    ]);
    mockCatalog.isSupported.mockImplementation(
      (id: string) => id !== UNKNOWN_ID
    );

    const entries = await service.getEffectiveConfig();

    expect(entries.find((e) => e.key === 'ai_default_model')).toEqual({
      key: 'ai_default_model',
      value: AI_SETTING_DEFAULTS.ai_default_model,
      kind: 'model',
      source: 'stale',
      storedValue: UNKNOWN_ID,
      description: 'promoted then retired',
      updatedAt: new Date('2026-07-15T00:00:00Z'),
    });
  });

  it('should mark a chain whose members the catalog dropped as stale', async () => {
    const row = {
      key: 'ai_fallback_chain',
      value: UNKNOWN_ID,
      description: null,
      updatedAt: new Date('2026-07-15T00:00:00Z'),
    };
    mockRepo.getAllRows.mockResolvedValue([row]);
    mockRepo.get.mockImplementation(async (key: string) =>
      key === 'ai_fallback_chain' ? row.value : null
    );
    mockCatalog.isSupported.mockImplementation(
      (id: string) => id !== UNKNOWN_ID
    );

    const entries = await service.getEffectiveConfig();

    expect(entries.find((e) => e.key === 'ai_fallback_chain')).toMatchObject({
      source: 'stale',
      value: AI_SETTING_DEFAULTS.ai_fallback_chain,
      storedValue: UNKNOWN_ID,
    });
    expect(await service.getFallbackChain()).toEqual([]);
  });

  it('should report the members that still route when only some survived the catalog', async () => {
    const survivor = 'anthropic:claude-sonnet-5';
    const row = {
      key: 'ai_fallback_chain',
      value: `${survivor},${UNKNOWN_ID}`,
      description: null,
      updatedAt: null,
    };
    mockRepo.getAllRows.mockResolvedValue([row]);
    mockRepo.get.mockImplementation(async (key: string) =>
      key === 'ai_fallback_chain' ? row.value : null
    );
    mockCatalog.isSupported.mockImplementation(
      (id: string) => id !== UNKNOWN_ID
    );

    const entries = await service.getEffectiveConfig();

    expect(entries.find((e) => e.key === 'ai_fallback_chain')).toMatchObject({
      source: 'stale',
      value: survivor,
      storedValue: `${survivor},${UNKNOWN_ID}`,
    });
    expect(await service.getFallbackChain()).toEqual([survivor]);
  });

  it('should not call a chain stale over whitespace the parser already ignores', async () => {
    const chain =
      'anthropic:claude-sonnet-5, anthropic:claude-haiku-4-5-20251001';
    mockRepo.getAllRows.mockResolvedValue([
      {
        key: 'ai_fallback_chain',
        value: chain,
        description: null,
        updatedAt: null,
      },
    ]);

    const entries = await service.getEffectiveConfig();

    expect(entries.find((e) => e.key === 'ai_fallback_chain')).toMatchObject({
      source: 'custom',
      storedValue: null,
    });
  });

  it('should mark a reasoning effort the runtime rejects as stale', async () => {
    mockRepo.getAllRows.mockResolvedValue([
      {
        key: 'ai_reasoning_effort',
        value: 'ludicrous',
        description: null,
        updatedAt: null,
      },
    ]);

    const entries = await service.getEffectiveConfig();

    expect(entries.find((e) => e.key === 'ai_reasoning_effort')).toMatchObject({
      source: 'stale',
      value: AI_SETTING_DEFAULTS.ai_reasoning_effort,
      storedValue: 'ludicrous',
    });
  });

  it('should mark an unparseable provider allowlist as stale', async () => {
    mockRepo.getAllRows.mockResolvedValue([
      {
        key: 'ai_openrouter_providers',
        value: 'NOT A SLUG!!',
        description: null,
        updatedAt: null,
      },
    ]);

    const entries = await service.getEffectiveConfig();

    expect(
      entries.find((e) => e.key === 'ai_openrouter_providers')
    ).toMatchObject({ source: 'stale', storedValue: 'NOT A SLUG!!' });
  });

  it('should keep an empty provider allowlist custom, since it means no preference', async () => {
    mockRepo.getAllRows.mockResolvedValue([
      {
        key: 'ai_openrouter_providers',
        value: '',
        description: null,
        updatedAt: null,
      },
    ]);

    const entries = await service.getEffectiveConfig();

    expect(
      entries.find((e) => e.key === 'ai_openrouter_providers')
    ).toMatchObject({ source: 'custom', value: '', storedValue: null });
  });

  it('should resolve effective config from DB rows and code defaults', async () => {
    const updatedAt = new Date('2026-07-15T00:00:00Z');
    mockRepo.getAllRows.mockResolvedValue([
      {
        key: 'ai_default_model',
        value: CUSTOM_MODEL,
        description: null,
        updatedAt,
      },
    ]);
    const entries = await service.getEffectiveConfig();
    expect(entries).toEqual([
      {
        key: 'ai_default_model',
        value: CUSTOM_MODEL,
        kind: 'model',
        source: 'custom',
        storedValue: null,
        description: null,
        updatedAt,
      },
      {
        key: 'ai_fast_model',
        value: AI_SETTING_DEFAULTS.ai_fast_model,
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_deep_model',
        value: AI_SETTING_DEFAULTS.ai_deep_model,
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_fallback_chain',
        value: AI_SETTING_DEFAULTS.ai_fallback_chain,
        kind: 'chain',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_reasoning_effort',
        value: AI_SETTING_DEFAULTS.ai_reasoning_effort,
        kind: 'choice',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_openrouter_providers',
        value: AI_SETTING_DEFAULTS.ai_openrouter_providers,
        kind: 'list',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_free_tier_ceiling',
        value: AI_SETTING_DEFAULTS.ai_free_tier_ceiling,
        kind: 'money',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
    ]);
  });

  it('should resolve every key from the code defaults when the DB is unavailable', async () => {
    mockRepo.getAllRows.mockRejectedValue(new Error('DB down'));
    const entries = await service.getEffectiveConfig();
    expect(entries).toEqual([
      {
        key: 'ai_default_model',
        value: AI_SETTING_DEFAULTS.ai_default_model,
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_fast_model',
        value: AI_SETTING_DEFAULTS.ai_fast_model,
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_deep_model',
        value: AI_SETTING_DEFAULTS.ai_deep_model,
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_fallback_chain',
        value: AI_SETTING_DEFAULTS.ai_fallback_chain,
        kind: 'chain',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_reasoning_effort',
        value: AI_SETTING_DEFAULTS.ai_reasoning_effort,
        kind: 'choice',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_openrouter_providers',
        value: AI_SETTING_DEFAULTS.ai_openrouter_providers,
        kind: 'list',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_free_tier_ceiling',
        value: AI_SETTING_DEFAULTS.ai_free_tier_ceiling,
        kind: 'money',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
    ]);
  });

  describe('free-tier ceiling', () => {
    it('should serve the code default as a per-token rate', async () => {
      mockRepo.get.mockResolvedValue(null);

      expect(await service.getFreeTierMaxOutputCostPerToken()).toBe(
        FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN
      );
    });

    it('should convert the stored dollars per million into a per-token rate', async () => {
      mockRepo.get.mockResolvedValue('2.50');

      expect(await service.getFreeTierMaxOutputCostPerToken()).toBe(0.0000025);
    });

    it('should fall back to the code default rather than widen the tier on a bad row', async () => {
      mockRepo.get.mockResolvedValue('not-a-price');

      expect(await service.getFreeTierMaxOutputCostPerToken()).toBe(
        FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN
      );
    });

    it('should reject a ceiling that is not a two-decimal dollar amount', async () => {
      for (const value of ['-1', '1.234', 'abc', '', '1e3', '101']) {
        await expect(
          service.setConfig('ai_free_tier_ceiling', value, ACTOR)
        ).rejects.toThrow(InvalidAIConfigError);
      }
    });

    it('should persist a valid ceiling', async () => {
      await service.setConfig('ai_free_tier_ceiling', '2.50', ACTOR);

      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_free_tier_ceiling',
        '2.50',
        undefined
      );
    });
  });

  describe('fallback chain', () => {
    it('should parse the code-default chain into a trimmed list of model ids', async () => {
      const chain = await service.getFallbackChain();
      expect(chain).toEqual(AI_SETTING_DEFAULTS.ai_fallback_chain.split(','));
    });

    it('should return the DB chain over the code default', async () => {
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
      await service.setConfig('ai_fallback_chain', A_VALID_CHAIN, ACTOR);
      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_fallback_chain',
        A_VALID_CHAIN,
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
        service.setConfig('ai_fallback_chain', A_VALID_CHAIN, ACTOR)
      ).rejects.toThrow('at least one must be routable');
      expect(mockRepo.set).not.toHaveBeenCalled();
    });
  });

  describe('promoted catalog models', () => {
    it('accepts a promoted model as a global default', async () => {
      const withPromoted = await serviceWith([
        createCatalogModel({ id: PROMOTED_ID }),
      ]);

      await expect(
        withPromoted.setConfig('ai_default_model', PROMOTED_ID, ACTOR)
      ).resolves.toBeUndefined();
      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_default_model',
        PROMOTED_ID,
        undefined
      );
    });

    it('accepts a fallback chain naming a promoted model', async () => {
      const withPromoted = await serviceWith([
        createCatalogModel({ id: PROMOTED_ID }),
      ]);

      await expect(
        withPromoted.setConfig(
          'ai_fallback_chain',
          `${CUSTOM_FAST},${PROMOTED_ID}`,
          ACTOR
        )
      ).resolves.toBeUndefined();
      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_fallback_chain',
        `${CUSTOM_FAST},${PROMOTED_ID}`,
        undefined
      );
    });

    it('rejects a chain naming a model that was never promoted', async () => {
      const withPromoted = await serviceWith([
        createCatalogModel({ id: PROMOTED_ID }),
      ]);

      await expect(
        withPromoted.setConfig(
          'ai_fallback_chain',
          `${CUSTOM_FAST},${UNKNOWN_ID}`,
          ACTOR
        )
      ).rejects.toThrow(UNKNOWN_ID);
      expect(mockRepo.set).not.toHaveBeenCalled();
    });

    it('rejects a promoted model the server cannot invoke as a global default', async () => {
      mockRegistry.isModelAvailable.mockReturnValue(false);
      const withPromoted = await serviceWith([
        createCatalogModel({ id: PROMOTED_ID }),
      ]);

      await expect(
        withPromoted.setConfig('ai_default_model', PROMOTED_ID, ACTOR)
      ).rejects.toThrow('is not invocable');
      expect(mockRepo.set).not.toHaveBeenCalled();
    });
  });

  describe('reasoning effort', () => {
    it('accepts a curated reasoning effort', async () => {
      await service.setConfig('ai_reasoning_effort', 'low', ACTOR);
      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_reasoning_effort',
        'low',
        undefined
      );
    });

    it('rejects a value outside the effort union', async () => {
      await expect(
        service.setConfig('ai_reasoning_effort', 'ultra', ACTOR)
      ).rejects.toThrow(InvalidAIConfigError);
      await expect(
        service.setConfig('ai_reasoning_effort', 'ultra', ACTOR)
      ).rejects.toThrow('is not one of');
      expect(mockRepo.set).not.toHaveBeenCalled();
    });

    it('resolves the code default when no override row exists', async () => {
      await expect(service.getReasoningEffort()).resolves.toBe('medium');
    });

    it('falls back to the default on an out-of-band row value', async () => {
      mockRepo.get.mockResolvedValueOnce('turbo');
      await expect(service.getReasoningEffort()).resolves.toBe('medium');
    });
  });

  describe('openrouter provider allowlist', () => {
    it('accepts a comma-separated pair of provider slugs', async () => {
      await service.setConfig(
        'ai_openrouter_providers',
        'fireworks,baseten',
        ACTOR
      );
      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_openrouter_providers',
        'fireworks,baseten',
        undefined
      );
    });

    it('accepts a slug carrying a variant suffix', async () => {
      await service.setConfig('ai_openrouter_providers', 'novita/fp8', ACTOR);
      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_openrouter_providers',
        'novita/fp8',
        undefined
      );
    });

    it('accepts an empty string as "no preference"', async () => {
      await service.setConfig('ai_openrouter_providers', '', ACTOR);
      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_openrouter_providers',
        '',
        undefined
      );
    });

    it('rejects a duplicated slug', async () => {
      await expect(
        service.setConfig(
          'ai_openrouter_providers',
          'fireworks,fireworks',
          ACTOR
        )
      ).rejects.toThrow(InvalidAIConfigError);
      expect(mockRepo.set).not.toHaveBeenCalled();
    });

    it('rejects an uppercase slug', async () => {
      await expect(
        service.setConfig('ai_openrouter_providers', 'Fireworks', ACTOR)
      ).rejects.toThrow(InvalidAIConfigError);
      expect(mockRepo.set).not.toHaveBeenCalled();
    });

    it('rejects more than eight providers', async () => {
      await expect(
        service.setConfig('ai_openrouter_providers', 'a,b,c,d,e,f,g,h,i', ACTOR)
      ).rejects.toThrow(InvalidAIConfigError);
      expect(mockRepo.set).not.toHaveBeenCalled();
    });

    it('rejects an empty entry from a double comma', async () => {
      await expect(
        service.setConfig(
          'ai_openrouter_providers',
          'fireworks,,baseten',
          ACTOR
        )
      ).rejects.toThrow(InvalidAIConfigError);
      expect(mockRepo.set).not.toHaveBeenCalled();
    });

    it('parses the code default into an ordered slug array', async () => {
      await expect(service.getOpenRouterProviderOrder()).resolves.toEqual([
        'fireworks',
        'baseten',
      ]);
    });

    it('parses a custom stored allowlist', async () => {
      mockRepo.get.mockResolvedValue('novita,cerebras');
      await expect(service.getOpenRouterProviderOrder()).resolves.toEqual([
        'novita',
        'cerebras',
      ]);
    });

    it('resolves a stored empty string to no preference', async () => {
      mockRepo.get.mockResolvedValue('');
      await expect(service.getOpenRouterProviderOrder()).resolves.toEqual([]);
    });

    it('falls back to the code default on an out-of-band row value', async () => {
      mockRepo.get.mockResolvedValue('BAD SLUG!');
      await expect(service.getOpenRouterProviderOrder()).resolves.toEqual([
        'fireworks',
        'baseten',
      ]);
    });
  });

  describe('getIntentModel', () => {
    it('maps each intent to its config key default', async () => {
      expect(await service.getIntentModel('fast')).toBe(
        AI_SETTING_DEFAULTS.ai_fast_model
      );
      expect(await service.getIntentModel('balanced')).toBe(
        AI_SETTING_DEFAULTS.ai_default_model
      );
      expect(await service.getIntentModel('powerful')).toBe(
        AI_SETTING_DEFAULTS.ai_deep_model
      );
    });
  });

  describe('models that left the catalog', () => {
    it('should fall back to the code default when the stored default model is gone', async () => {
      mockRepo.get.mockResolvedValue(PROMOTED_ID);
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== PROMOTED_ID
      );

      expect(await service.getDefaultModel()).toBe(
        AI_SETTING_DEFAULTS.ai_default_model
      );
    });

    it('should fall back to the code default when a stored intent model is gone', async () => {
      mockRepo.get.mockResolvedValue(PROMOTED_ID);
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== PROMOTED_ID
      );

      expect(await service.getIntentModel('powerful')).toBe(
        AI_SETTING_DEFAULTS.ai_deep_model
      );
      expect(await service.getFastModel()).toBe(
        AI_SETTING_DEFAULTS.ai_fast_model
      );
    });

    it('should serve a stored model the catalog still supports', async () => {
      mockRepo.get.mockResolvedValue(PROMOTED_ID);

      expect(await service.getDefaultModel()).toBe(PROMOTED_ID);
      expect(await service.getIntentModel('fast')).toBe(PROMOTED_ID);
    });

    it('should serve a retired promoted default from the code default through the real catalog', async () => {
      const retired = await serviceWith([]);
      mockRepo.get.mockResolvedValue(PROMOTED_ID);

      expect(await retired.getDefaultModel()).toBe(
        AI_SETTING_DEFAULTS.ai_default_model
      );
    });

    it('should serve a promoted default while the model is still promoted', async () => {
      const promoted = await serviceWith([
        createCatalogModel({ id: PROMOTED_ID }),
      ]);
      mockRepo.get.mockResolvedValue(PROMOTED_ID);

      expect(await promoted.getDefaultModel()).toBe(PROMOTED_ID);
    });
  });
});

describe('AI_SETTING_DEFAULTS', () => {
  it('names only curated model ids so a typo fails CI, not prod', () => {
    const curatedIds = new Set(CURATED_MODELS.map((m) => m.id));
    const referenced = [
      AI_SETTING_DEFAULTS.ai_default_model,
      AI_SETTING_DEFAULTS.ai_fast_model,
      AI_SETTING_DEFAULTS.ai_deep_model,
      ...AI_SETTING_DEFAULTS.ai_fallback_chain
        .split(',')
        .map((id) => id.trim()),
    ];
    for (const id of referenced) {
      expect(curatedIds.has(id)).toBe(true);
    }
  });

  it('every reasoning default is a member of the effort union', () => {
    expect(REASONING_EFFORTS).toContain(
      AI_SETTING_DEFAULTS.ai_reasoning_effort
    );
  });
});
