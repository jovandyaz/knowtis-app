import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GLOBAL_REASONING_EFFORTS } from '@knowtis/shared-types';

import {
  AI_SETTING_DEFAULTS,
  AUTO_MODEL_SETTING,
} from '../../domain/ai-settings';
import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import {
  PLATFORM_SEED_MODELS,
  SEED_RESOLUTIONS,
} from '../../domain/model-catalog/platform-resolution';
import type { ModelResolutionRepository } from '../../domain/ports/model-resolution.repository';
import { PlatformResolutionsUnreadError } from '../../domain/ports/platform-models.port';
import { CompositeModelCatalog } from '../../infrastructure/catalog/composite-model-catalog';
import { ModelIndexCache } from '../../infrastructure/catalog/model-index.cache';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import { createCatalogModel } from '../../testing/create-catalog-model';
import { createCatalogRepositoryStub } from '../../testing/create-catalog-repository-stub';
import { createModelIndexRepositoryStub } from '../../testing/create-model-index-repository-stub';
import {
  createModelResolutionRepositoryStub,
  createResolutionsStub,
} from '../../testing/platform-resolutions';
import {
  createSnapshotIndex,
  SNAPSHOT_DATE,
} from '../../testing/snapshot-index';
import { AIConfigService, InvalidAIConfigError } from './ai-config.service';

const CUSTOM_MODEL = 'anthropic:claude-sonnet-5';
const CUSTOM_FAST = 'anthropic:claude-haiku-4-5';
const A_VALID_CHAIN = 'anthropic:claude-haiku-4-5,openai:gpt-4o-mini';
const ACTOR = 'admin-user-id';
const PROMOTED_ID = 'openrouter:vendor/promoted-one';
const NON_SELECTOR_ID = 'openrouter:z-ai/glm-5.2';
const IMAGE_ID = 'google:gemini-3-pro-image';
const ALIAS_ID = 'openrouter:~anthropic/claude-opus-latest';
const UNPRICED_ID = 'google:gemma-4-26b-a4b-it';
const PROD_PINS = [
  ['ai_default_model', 'openrouter:deepseek/deepseek-v4-pro-0813'],
  ['ai_default_model', 'openrouter:deepseek/deepseek-v4.1-flash'],
  ['ai_fast_model', 'openrouter:minimax/minimax-m2.5'],
  ['ai_deep_model', 'openrouter:moonshotai/kimi-k2.5'],
  ['ai_default_model', 'openrouter:z-ai/glm-5.3'],
] as const;
const UNKNOWN_ID = 'openrouter:vendor/unknown-one';
const FAST_PIN = 'openrouter:deepseek/deepseek-v4.1-flash';
const BALANCED_PIN = 'openrouter:deepseek/deepseek-v4-pro-0813';
const DEEP_PIN = 'openrouter:qwen/qwen3.8-max-0902';
const DEAD_PIN = 'openrouter:qwen/qwen3.8-max';
const DEAD_PIN_SUPPORTED = 'openrouter:z-ai/glm-5.2';
const CHAIN_ONLY = 'openrouter:z-ai/glm-5.3';
const SEEDED_CHAIN = [
  PLATFORM_SEED_MODELS.balanced,
  PLATFORM_SEED_MODELS.fast,
  PLATFORM_SEED_MODELS.powerful,
];

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
  let mockResolutionRepo: ModelResolutionRepository;

  /** Wires the real promoted cache and composite catalog so promoted models reach validation exactly as they do at runtime. */
  async function serviceWith(models: readonly CatalogModel[]) {
    const promoted = new PromotedModelsCache(
      createCatalogRepositoryStub(async () => [...models])
    );
    await promoted.onModuleInit();
    const index = new ModelIndexCache(
      createModelIndexRepositoryStub(async () => [])
    );
    const catalog = new CompositeModelCatalog(promoted, index);
    return new AIConfigService(
      mockRepo as never,
      mockCache as never,
      mockAudit as never,
      mockRegistry as never,
      catalog,
      promoted,
      index,
      createResolutionsStub(),
      mockResolutionRepo
    );
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
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
    mockResolutionRepo = createModelResolutionRepositoryStub();
    service = new AIConfigService(
      mockRepo as never,
      mockCache as never,
      mockAudit as never,
      mockRegistry as never,
      mockCatalog as never,
      { snapshot: () => [] } as never,
      createSnapshotIndex(),
      createResolutionsStub(),
      mockResolutionRepo
    );
  });

  it('should return DB value when set', async () => {
    mockRepo.get.mockResolvedValue(CUSTOM_MODEL);
    const model = await service.getDefaultModel();
    expect(model).toBe(CUSTOM_MODEL);
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

  it('should throw on unknown config key', async () => {
    await expect(
      service.setConfig('ai_unknown_key', CUSTOM_MODEL, ACTOR)
    ).rejects.toThrow("Unknown AI config key: 'ai_unknown_key'");
    expect(mockRepo.set).not.toHaveBeenCalled();
  });

  it('should reject a model the catalog does not support', async () => {
    mockCatalog.isSupported.mockReturnValue(false);
    await expect(
      service.setConfig('ai_default_model', 'anthropic:not-a-model', ACTOR)
    ).rejects.toThrow(
      "'anthropic:not-a-model' is not a model the catalog supports"
    );
    expect(mockRepo.set).not.toHaveBeenCalled();
    expect(mockAudit.record).not.toHaveBeenCalled();
  });

  it('should accept a supported, routable model outside the selectors', async () => {
    const real = await serviceWith([]);
    await real.setConfig('ai_default_model', NON_SELECTOR_ID, ACTOR);
    expect(mockRepo.set).toHaveBeenCalledWith(
      'ai_default_model',
      NON_SELECTOR_ID,
      undefined
    );
  });

  it.each([
    ['an image model', IMAGE_ID],
    ['an alias', ALIAS_ID],
    ['an unpriced row', UNPRICED_ID],
  ])('should reject %s as not eligible', async (_label, id) => {
    const real = await serviceWith([]);
    await expect(real.setConfig('ai_default_model', id, ACTOR)).rejects.toThrow(
      `'${id}' is not an eligible platform model`
    );
    expect(mockRepo.set).not.toHaveBeenCalled();
  });

  it('should accept a promoted id that has no index row', async () => {
    const real = await serviceWith([createCatalogModel({ id: PROMOTED_ID })]);
    await real.setConfig('ai_default_model', PROMOTED_ID, ACTOR);
    expect(mockRepo.set).toHaveBeenCalledOnce();
  });

  it.each(PROD_PINS)('should still accept %s pin %s', async (key, id) => {
    const real = await serviceWith([]);
    await real.setConfig(key, id, ACTOR);
    expect(mockRepo.set).toHaveBeenCalledOnce();
  });

  it('should reject a supported model the server cannot invoke', async () => {
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

  it('should audit the atomically deleted value, not the value read before the delete', async () => {
    mockRepo.get.mockResolvedValue(CUSTOM_FAST);
    mockRepo.delete.mockResolvedValue(deletedRow(CUSTOM_MODEL));
    await service.resetConfig('ai_default_model', ACTOR);
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

  it('should mark a chain whose members the catalog dropped as stale while the derived chain serves', async () => {
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
      value: SEEDED_CHAIN.join(','),
      storedValue: UNKNOWN_ID,
    });
    expect(await service.getFallbackChain()).toEqual(SEEDED_CHAIN);
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
    const chain = 'anthropic:claude-sonnet-5, anthropic:claude-haiku-4-5';
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

  it('should resolve effective config from DB rows, active resolutions and code defaults', async () => {
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
        value: PLATFORM_SEED_MODELS.fast,
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_deep_model',
        value: PLATFORM_SEED_MODELS.powerful,
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_fallback_chain',
        value: [
          CUSTOM_MODEL,
          PLATFORM_SEED_MODELS.fast,
          PLATFORM_SEED_MODELS.powerful,
        ].join(','),
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
        key: 'ai_openrouter_ignored_providers',
        value: '',
        kind: 'list',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_anon_daily_messages',
        value: '5',
        kind: 'count',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_free_daily_messages',
        value: '30',
        kind: 'count',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
    ]);
  });

  it('should resolve every key from the active resolutions and code defaults when the DB is unavailable', async () => {
    mockRepo.getAllRows.mockRejectedValue(new Error('DB down'));
    const entries = await service.getEffectiveConfig();
    expect(entries).toEqual([
      {
        key: 'ai_default_model',
        value: PLATFORM_SEED_MODELS.balanced,
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_fast_model',
        value: PLATFORM_SEED_MODELS.fast,
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_deep_model',
        value: PLATFORM_SEED_MODELS.powerful,
        kind: 'model',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_fallback_chain',
        value: SEEDED_CHAIN.join(','),
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
        key: 'ai_openrouter_ignored_providers',
        value: '',
        kind: 'list',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_anon_daily_messages',
        value: '5',
        kind: 'count',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
      {
        key: 'ai_free_daily_messages',
        value: '30',
        kind: 'count',
        source: 'default',
        storedValue: null,
        description: null,
        updatedAt: null,
      },
    ]);
  });

  it('no longer serves or accepts a free-tier ceiling', async () => {
    const entries = await service.getEffectiveConfig();
    expect(entries.map((entry) => entry.key)).not.toContain(
      'ai_free_tier_ceiling'
    );
    await expect(
      service.setConfig('ai_free_tier_ceiling', '4.00', ACTOR)
    ).rejects.toThrow("Unknown AI config key: 'ai_free_tier_ceiling'");
  });

  describe('auto and pins', () => {
    it('serves the seeded actives and the derived chain with no rows', async () => {
      expect(await service.getIntentModels()).toEqual(PLATFORM_SEED_MODELS);
      expect(await service.getFallbackChain()).toEqual(SEEDED_CHAIN);
    });

    it("keeps prod's pins and their dead-pin fallback", async () => {
      const stored: Record<string, string> = {
        ai_default_model: BALANCED_PIN,
        ai_fast_model: FAST_PIN,
        ai_deep_model: DEAD_PIN,
        ai_fallback_chain: `${BALANCED_PIN},${CHAIN_ONLY}`,
      };
      mockRepo.get.mockImplementation(
        async (key: string) => stored[key] ?? null
      );
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== DEAD_PIN
      );

      expect(await service.getIntentModels()).toEqual({
        fast: FAST_PIN,
        balanced: BALANCED_PIN,
        powerful: PLATFORM_SEED_MODELS.powerful,
      });
      expect(await service.getFallbackChain()).toEqual([
        BALANCED_PIN,
        CHAIN_ONLY,
      ]);
    });

    it('derives the chain from the served intents, pins included', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_fast_model' ? FAST_PIN : null
      );
      expect(await service.getFallbackChain()).toEqual([
        PLATFORM_SEED_MODELS.balanced,
        FAST_PIN,
        PLATFORM_SEED_MODELS.powerful,
      ]);
    });

    it('serves the derived chain when every pinned chain model is gone', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_fallback_chain' ? DEAD_PIN : null
      );
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== DEAD_PIN
      );
      expect(await service.getFallbackChain()).toEqual(SEEDED_CHAIN);
    });

    it('serves the seeded models on a cold boot with the DB down', async () => {
      mockRepo.get.mockRejectedValue(new Error('db down'));
      mockRepo.getAllRows.mockRejectedValue(new Error('db down'));
      const cold = new AIConfigService(
        mockRepo as never,
        mockCache as never,
        mockAudit as never,
        mockRegistry as never,
        mockCatalog as never,
        { snapshot: () => [] } as never,
        createSnapshotIndex(),
        createResolutionsStub(SEED_RESOLUTIONS, { readStore: false }),
        mockResolutionRepo
      );

      expect(await cold.getIntentModels()).toEqual(PLATFORM_SEED_MODELS);
      expect(await cold.getFallbackChain()).toEqual(SEEDED_CHAIN);
      expect(
        (await cold.getEffectiveConfig()).find(
          (e) => e.key === 'ai_default_model'
        )
      ).toMatchObject({
        value: PLATFORM_SEED_MODELS.balanced,
        source: 'default',
      });
    });

    it('serves no model for an intent a successful read left without a row or a pin', async () => {
      const empty = new AIConfigService(
        mockRepo as never,
        mockCache as never,
        mockAudit as never,
        mockRegistry as never,
        mockCatalog as never,
        { snapshot: () => [] } as never,
        createSnapshotIndex(),
        createResolutionsStub([]),
        mockResolutionRepo
      );
      expect(await empty.getDefaultModel()).toBe('');
    });

    it('reports auto keys as default with the value they serve', async () => {
      const entries = await service.getEffectiveConfig();
      expect(entries.find((e) => e.key === 'ai_deep_model')).toMatchObject({
        value: PLATFORM_SEED_MODELS.powerful,
        source: 'default',
      });
      expect(entries.find((e) => e.key === 'ai_fallback_chain')).toMatchObject({
        value: SEEDED_CHAIN.join(','),
        source: 'default',
      });
    });

    it('reports a dead pin as stale while its active resolution serves', async () => {
      mockRepo.getAllRows.mockResolvedValue([
        {
          key: 'ai_deep_model',
          value: DEAD_PIN,
          description: null,
          updatedAt: new Date(),
        },
      ]);
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== DEAD_PIN
      );
      expect(
        (await service.getEffectiveConfig()).find(
          (e) => e.key === 'ai_deep_model'
        )
      ).toMatchObject({
        value: PLATFORM_SEED_MODELS.powerful,
        source: 'stale',
        storedValue: DEAD_PIN,
      });
    });
  });

  describe('released pins', () => {
    it('records nothing when a pin replaces the active resolution', async () => {
      await service.setConfig('ai_deep_model', DEEP_PIN, ACTOR);
      expect(mockResolutionRepo.recordRelease).not.toHaveBeenCalled();
    });

    it('records the pin a re-pin stops serving', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_deep_model' ? DEAD_PIN_SUPPORTED : null
      );
      await service.setConfig('ai_deep_model', DEEP_PIN, ACTOR);
      expect(mockResolutionRepo.recordRelease).toHaveBeenCalledWith(
        'platform.powerful',
        DEAD_PIN_SUPPORTED,
        SNAPSHOT_DATE
      );
    });

    it('records the pin a release stops serving', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_fast_model' ? FAST_PIN : null
      );
      mockRepo.delete.mockResolvedValue(deletedRow(FAST_PIN));
      await service.resetConfig('ai_fast_model', ACTOR);
      expect(mockResolutionRepo.recordRelease).toHaveBeenCalledWith(
        'platform.fast',
        FAST_PIN,
        SNAPSHOT_DATE
      );
    });

    it('records nothing when a release drops a pin the catalog no longer serves', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_deep_model' ? DEAD_PIN : null
      );
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== DEAD_PIN
      );
      mockRepo.delete.mockResolvedValue(deletedRow(DEAD_PIN));
      await service.resetConfig('ai_deep_model', ACTOR);
      expect(mockResolutionRepo.recordRelease).not.toHaveBeenCalled();
    });

    it('records nothing for a chain change or a release with no row', async () => {
      await service.setConfig('ai_fallback_chain', A_VALID_CHAIN, ACTOR);
      await service.resetConfig('ai_deep_model', ACTOR);
      expect(mockResolutionRepo.recordRelease).not.toHaveBeenCalled();
    });

    it('keeps the pin when the release record fails', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_deep_model' ? DEAD_PIN_SUPPORTED : null
      );
      vi.mocked(mockResolutionRepo.recordRelease).mockRejectedValue(
        new Error('db down')
      );
      await expect(
        service.setConfig('ai_deep_model', DEEP_PIN, ACTOR)
      ).resolves.toBeUndefined();
      expect(mockRepo.set).toHaveBeenCalled();
      expect(mockResolutionRepo.recordRelease).toHaveBeenCalled();
    });
  });

  describe('fallback chain', () => {
    it('should return the DB chain over the derived chain', async () => {
      mockRepo.get.mockResolvedValue('google:gemini-2.0-flash');
      const chain = await service.getFallbackChain();
      expect(chain).toEqual(['google:gemini-2.0-flash']);
    });

    it('should drop chain models the catalog no longer supports', async () => {
      mockRepo.get.mockResolvedValue(
        'anthropic:claude-haiku-4-5,openai:ghost-model'
      );
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== 'openai:ghost-model'
      );

      const chain = await service.getFallbackChain();

      expect(chain).toEqual(['anthropic:claude-haiku-4-5']);
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
          'anthropic:claude-haiku-4-5,openai:ghost-model',
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

  describe('ignored OpenRouter providers', () => {
    const key = 'ai_openrouter_ignored_providers';
    it('defaults to no exclusions', async () => {
      await expect(service.getOpenRouterIgnoredProviders()).resolves.toEqual(
        []
      );
      expect(
        (await service.getEffectiveConfig()).find((entry) => entry.key === key)
      ).toMatchObject({ value: '', kind: 'list', source: 'default' });
    });
    it('accepts trimmed unique slugs and caches the configured exclusions for 30 seconds', async () => {
      await service.setConfig(key, ' parasail,novita/fp8 ', ACTOR);
      mockRepo.get.mockResolvedValue(' parasail,novita/fp8 ');
      await expect(service.getOpenRouterIgnoredProviders()).resolves.toEqual([
        'parasail',
        'novita/fp8',
      ]);
      expect(mockCache.set).toHaveBeenCalledWith(
        `ai:config:${key}`,
        ' parasail,novita/fp8 ',
        30_000
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: key,
          after: { value: ' parasail,novita/fp8 ' },
        })
      );
    });
    it.each([
      'Parasail',
      'parasail,parasail',
      'a,b,c,d,e,f,g,h,i',
      'a,',
      '../invalid',
    ])('rejects invalid exclusions: %s', async (value) => {
      await expect(service.setConfig(key, value, ACTOR)).rejects.toThrow(
        InvalidAIConfigError
      );
      expect(mockRepo.set).not.toHaveBeenCalled();
    });
    it('caches an explicit empty list instead of refetching it', async () => {
      mockCache.get.mockResolvedValue('');
      await expect(service.getOpenRouterIgnoredProviders()).resolves.toEqual(
        []
      );
      expect(mockRepo.get).not.toHaveBeenCalled();
    });
    it.each(['get', 'set'] as const)(
      'uses persisted exclusions when cache %s fails',
      async (operation) => {
        mockCache[operation].mockRejectedValue(new Error('cache unavailable'));
        mockRepo.get.mockResolvedValue('parasail');
        await expect(service.getOpenRouterIgnoredProviders()).resolves.toEqual([
          'parasail',
        ]);
      }
    );
    it('resets and audits exclusions through the existing config lifecycle', async () => {
      mockRepo.delete.mockResolvedValue({ ...deletedRow('parasail'), key });
      await service.resetConfig(key, ACTOR);
      expect(mockCache.del).toHaveBeenCalledWith(`ai:config:${key}`);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ targetId: key, action: 'ai_config.reset' })
      );
      await expect(service.getOpenRouterIgnoredProviders()).resolves.toEqual(
        []
      );
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

  describe('getIntentModels', () => {
    it('serves the active resolution only for the intent whose pin left the catalog', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_fast_model' ? PROMOTED_ID : null
      );
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== PROMOTED_ID
      );

      expect(await service.getIntentModels()).toEqual(PLATFORM_SEED_MODELS);
    });

    it('keeps a stored intent model the catalog still serves', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_fast_model' ? PROMOTED_ID : null
      );

      const models = await service.getIntentModels();

      expect(models.fast).toBe(PROMOTED_ID);
      expect(models.balanced).toBe(PLATFORM_SEED_MODELS.balanced);
      expect(models.powerful).toBe(PLATFORM_SEED_MODELS.powerful);
    });
  });

  describe('getPlatformModelIds', () => {
    it('lists the intent models, the chain, then the active resolutions, once each', async () => {
      const stored: Record<string, string> = {
        ai_fast_model: FAST_PIN,
        ai_default_model: BALANCED_PIN,
        ai_deep_model: DEEP_PIN,
        ai_fallback_chain: `${BALANCED_PIN},${CHAIN_ONLY}`,
      };
      mockRepo.get.mockImplementation(
        async (key: string) => stored[key] ?? null
      );

      expect(await service.getPlatformModelIds()).toEqual([
        FAST_PIN,
        BALANCED_PIN,
        DEEP_PIN,
        CHAIN_ONLY,
        PLATFORM_SEED_MODELS.fast,
        PLATFORM_SEED_MODELS.balanced,
        PLATFORM_SEED_MODELS.powerful,
      ]);
    });

    it('refuses the platform models while only the seed floor is known', async () => {
      const cold = new AIConfigService(
        mockRepo as never,
        mockCache as never,
        mockAudit as never,
        mockRegistry as never,
        mockCatalog as never,
        { snapshot: () => [] } as never,
        createSnapshotIndex(),
        createResolutionsStub(SEED_RESOLUTIONS, { readStore: false }),
        mockResolutionRepo
      );

      await expect(cold.getPlatformModelIds()).rejects.toBeInstanceOf(
        PlatformResolutionsUnreadError
      );
    });
  });

  describe('intent tiers stay distinct', () => {
    it('refuses to point a second tier at a model another tier already serves', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_deep_model' ? CUSTOM_MODEL : null
      );

      await expect(
        service.setConfig('ai_fast_model', CUSTOM_MODEL, ACTOR)
      ).rejects.toThrow(/already serves the 'powerful' tier/);
      expect(mockRepo.set).not.toHaveBeenCalled();
    });

    it('allows repointing a tier at the model it already serves', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_fast_model' ? CUSTOM_MODEL : null
      );

      await expect(
        service.setConfig('ai_fast_model', CUSTOM_MODEL, ACTOR)
      ).resolves.toBeUndefined();
      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_fast_model',
        CUSTOM_MODEL,
        undefined
      );
    });

    it('leaves non-tier settings unguarded', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_fast_model' ? CUSTOM_MODEL : null
      );

      await expect(
        service.setConfig('ai_fallback_chain', CUSTOM_MODEL, ACTOR)
      ).resolves.toBeUndefined();
    });
  });

  describe('models that left the catalog', () => {
    it('should serve the active resolution when the stored default model is gone', async () => {
      mockRepo.get.mockResolvedValue(PROMOTED_ID);
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== PROMOTED_ID
      );

      expect(await service.getDefaultModel()).toBe(
        PLATFORM_SEED_MODELS.balanced
      );
    });

    it('should serve the active resolution when a stored intent model is gone', async () => {
      mockRepo.get.mockResolvedValue(PROMOTED_ID);
      mockCatalog.isSupported.mockImplementation(
        (id: string) => id !== PROMOTED_ID
      );

      expect((await service.getIntentModels()).powerful).toBe(
        PLATFORM_SEED_MODELS.powerful
      );
      expect(await service.getFastModel()).toBe(PLATFORM_SEED_MODELS.fast);
    });

    it('should serve a stored model the catalog still supports', async () => {
      mockRepo.get.mockResolvedValue(PROMOTED_ID);

      expect(await service.getDefaultModel()).toBe(PROMOTED_ID);
      expect((await service.getIntentModels()).fast).toBe(PROMOTED_ID);
    });

    it('should serve a retired promoted default from its active resolution through the real catalog', async () => {
      const retired = await serviceWith([]);
      mockRepo.get.mockResolvedValue(PROMOTED_ID);

      expect(await retired.getDefaultModel()).toBe(
        PLATFORM_SEED_MODELS.balanced
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

  describe('daily message limits', () => {
    it('serves the code defaults', async () => {
      await expect(service.getDailyMessageLimits()).resolves.toEqual({
        anonymous: 5,
        free: 30,
      });
    });

    it('serves a stored limit per tier', async () => {
      mockRepo.get.mockImplementation(async (key: string) =>
        key === 'ai_free_daily_messages' ? '12' : null
      );

      await expect(service.getDailyMessageLimits()).resolves.toEqual({
        anonymous: 5,
        free: 12,
      });
    });

    it('falls back to the code default rather than open a tier on a bad row', async () => {
      mockRepo.get.mockResolvedValue('many');

      await expect(service.getDailyMessageLimits()).resolves.toEqual({
        anonymous: 5,
        free: 30,
      });
    });

    it('rejects a limit that is not a whole number within range', async () => {
      for (const value of ['-1', '1.5', 'abc', '', '10001']) {
        await expect(
          service.setConfig('ai_free_daily_messages', value, ACTOR)
        ).rejects.toThrow(InvalidAIConfigError);
      }
    });

    it('persists a valid limit, zero included', async () => {
      await service.setConfig('ai_anon_daily_messages', '0', ACTOR);

      expect(mockRepo.set).toHaveBeenCalledWith(
        'ai_anon_daily_messages',
        '0',
        undefined
      );
    });

    it('reads a padded limit as the operator set it, not as a stale row', async () => {
      mockRepo.getAllRows.mockResolvedValue([
        {
          key: 'ai_free_daily_messages',
          value: ' 40 ',
          description: null,
          updatedAt: null,
        },
      ]);

      const entries = await service.getEffectiveConfig();

      expect(
        entries.find((e) => e.key === 'ai_free_daily_messages')
      ).toMatchObject({ source: 'custom', value: '40', storedValue: null });
    });
  });
});

describe('AI_SETTING_DEFAULTS', () => {
  it('every reasoning default is a member of the global effort union', () => {
    expect(GLOBAL_REASONING_EFFORTS).toContain(
      AI_SETTING_DEFAULTS.ai_reasoning_effort
    );
  });

  it('ships every model setting and the chain on auto', () => {
    expect([
      AI_SETTING_DEFAULTS.ai_default_model,
      AI_SETTING_DEFAULTS.ai_fast_model,
      AI_SETTING_DEFAULTS.ai_deep_model,
      AI_SETTING_DEFAULTS.ai_fallback_chain,
    ]).toEqual([
      AUTO_MODEL_SETTING,
      AUTO_MODEL_SETTING,
      AUTO_MODEL_SETTING,
      AUTO_MODEL_SETTING,
    ]);
  });
});
