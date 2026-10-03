import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MODEL_INDEX_SNAPSHOT,
  ModelIndexCatalog,
  type IndexedModel,
  type ModelCatalog,
} from '@knowtis/ai-gateway';
import type { ModelIntent } from '@knowtis/shared-types';

import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { chooseModel } from '../../domain/model-catalog/model-choice';
import { RETIREMENT_WINDOW_DAYS } from '../../domain/model-catalog/model-selectors';
import { utcDayOf } from '../../domain/value-objects/utc-day';
import type { ModelIndexCache } from '../../infrastructure/catalog/model-index.cache';
import type { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import type { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';
import { createCatalogModel } from '../../testing/create-catalog-model';
import { createExecutionContext } from '../../testing/create-execution-context';
import { createIndexedModel } from '../../testing/create-indexed-model';
import {
  createSnapshotIndex,
  SNAPSHOT_DATE,
} from '../../testing/snapshot-index';
import { SelectableModelsService } from './selectable-models.service';

const SONNET_5 = 'anthropic:claude-sonnet-5';
const SONNET_5_5 = 'anthropic:claude-sonnet-5-5';
const HAIKU_4_5 = 'anthropic:claude-haiku-4-5';
const OPUS_5_5 = 'anthropic:claude-opus-5-5';
const GPT_6_LUNA = 'openai:gpt-6-luna';
const GPT_5_6_TERRA = 'openai:gpt-5.6-terra';
const GLM = 'openrouter:z-ai/glm-5.2';
const NO_BYOK: ReadonlySet<string> = new Set();
const PROMOTED_ID = 'openrouter:vendor/promoted-one';
const PROMOTED_DESCRIPTION = 'Promoted from the open catalog';
const PORT_CONTEXT_WINDOW = 262_144;
const ROW_CONTEXT_WINDOW = 4_096;
const OPEN_TIER_OUTPUT_COST = 0.000001;
const INTENTS = {
  fast: 'openrouter:minimax/minimax-m2.5',
  balanced: 'openrouter:deepseek/deepseek-v3.2',
  powerful: 'openrouter:moonshotai/kimi-k2.5',
} as const;
const PROMOTED_FAST_INTENTS = { ...INTENTS, fast: PROMOTED_ID } as const;
const FULL_LADDER = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const FREE_LADDER = ['low', 'medium', 'high'] as const;

const FREE_CALLER = createExecutionContext({ tier: 'free' });
const ANTHROPIC_KEY = createExecutionContext({
  tier: 'byok',
  byokProviders: ['anthropic'],
});
const OPENROUTER_KEY = createExecutionContext({
  tier: 'byok',
  byokProviders: ['openrouter'],
});

type RegistryStub = Pick<ProviderRegistryFactory, 'isModelAvailable'>;
type PromotedCacheStub = Pick<PromotedModelsCache, 'snapshot'>;
type IndexStub = Pick<ModelIndexCache, 'catalog'>;

/** Typed against the real ports so a shape change breaks compilation here instead of at runtime. */
function makeSelectableModelsService(
  catalog: ModelCatalog,
  registry: RegistryStub,
  promoted: PromotedCacheStub,
  index: IndexStub = createSnapshotIndex()
) {
  return new SelectableModelsService(
    catalog,
    registry as ProviderRegistryFactory,
    promoted as PromotedModelsCache,
    index as ModelIndexCache
  );
}

function promotedCache(models: readonly CatalogModel[]): PromotedCacheStub {
  return { snapshot: () => models };
}

function indexOf(rows: readonly IndexedModel[]): IndexStub {
  const catalog = new ModelIndexCatalog(rows);
  return { catalog: () => catalog };
}

function makeOpenService(
  promoted: readonly CatalogModel[] = [],
  index?: IndexStub
) {
  const catalog: ModelCatalog = {
    isSupported: () => true,
    getPricing: () => ({ outputCostPerToken: OPEN_TIER_OUTPUT_COST }),
    getContextWindow: () => ({ maxInputTokens: 1000 }),
  };
  const registry: RegistryStub = { isModelAvailable: () => true };
  return makeSelectableModelsService(
    catalog,
    registry,
    promotedCache(promoted),
    index
  );
}

function makeService(opts: {
  supported: Set<string>;
  available: Set<string>;
  context?: Record<string, number>;
  pricing?: Record<
    string,
    { inputCostPerToken: number; outputCostPerToken: number }
  >;
  promoted?: readonly CatalogModel[];
}) {
  const catalog: ModelCatalog = {
    isSupported: (id: string) => opts.supported.has(id),
    getContextWindow: (id: string) =>
      opts.context?.[id]
        ? { maxInputTokens: opts.context[id], maxOutputTokens: 4096 }
        : undefined,
    getPricing: (id: string) =>
      opts.pricing?.[id] ||
      (opts.supported.has(id)
        ? {
            inputCostPerToken: 0.000001,
            outputCostPerToken: OPEN_TIER_OUTPUT_COST,
          }
        : undefined),
  };
  const registry: RegistryStub = {
    isModelAvailable: (id: string) => opts.available.has(id),
  };
  return makeSelectableModelsService(
    catalog,
    registry,
    promotedCache(opts.promoted ?? [])
  );
}

function listed(
  service: SelectableModelsService,
  execution: AiExecutionContext,
  intents: Readonly<Record<ModelIntent, string>> = INTENTS
) {
  return service.toSelectable(service.catalogFor(execution, intents, null));
}

describe('SelectableModelsService', () => {
  it('derives costClass from outputCostPerToken across tiers', () => {
    const ids = [HAIKU_4_5, SONNET_5_5, OPUS_5_5];
    const svc = makeService({
      supported: new Set(ids),
      available: new Set(ids),
      pricing: {
        [HAIKU_4_5]: {
          inputCostPerToken: 0.0000008,
          outputCostPerToken: 0.000005,
        },
        [SONNET_5_5]: {
          inputCostPerToken: 0.000003,
          outputCostPerToken: 0.000015,
        },
        [OPUS_5_5]: {
          inputCostPerToken: 0.000005,
          outputCostPerToken: 0.000025,
        },
      },
    });
    const byId = Object.fromEntries(
      listed(svc, ANTHROPIC_KEY).map((m) => [m.id, m.costClass])
    );
    expect(byId[HAIKU_4_5]).toBe(1);
    expect(byId[SONNET_5_5]).toBe(2);
    expect(byId[OPUS_5_5]).toBe(3);
  });

  it('applies costClass thresholds at the boundary values', () => {
    const ids = [GPT_6_LUNA, SONNET_5_5, GPT_5_6_TERRA, OPUS_5_5];
    const svc = makeService({
      supported: new Set(ids),
      available: new Set(ids),
      pricing: {
        [GPT_6_LUNA]: {
          inputCostPerToken: 0,
          outputCostPerToken: 0.0000099,
        },
        [SONNET_5_5]: {
          inputCostPerToken: 0,
          outputCostPerToken: 0.00001,
        },
        [GPT_5_6_TERRA]: {
          inputCostPerToken: 0,
          outputCostPerToken: 0.0000199,
        },
        [OPUS_5_5]: {
          inputCostPerToken: 0,
          outputCostPerToken: 0.00002,
        },
      },
    });
    const byId = Object.fromEntries(
      listed(
        svc,
        createExecutionContext({
          tier: 'byok',
          byokProviders: ['openai', 'anthropic'],
        })
      ).map((m) => [m.id, m.costClass])
    );
    expect(byId[GPT_6_LUNA]).toBe(1);
    expect(byId[SONNET_5_5]).toBe(2);
    expect(byId[GPT_5_6_TERRA]).toBe(2);
    expect(byId[OPUS_5_5]).toBe(3);
  });

  it('lists an Anthropic-only key exactly the three intent resolutions', () => {
    expect(
      listed(makeOpenService(), ANTHROPIC_KEY).map((m) => [
        m.id,
        m.servesIntent,
      ])
    ).toEqual([
      [HAIKU_4_5, 'fast'],
      [SONNET_5_5, 'balanced'],
      [OPUS_5_5, 'powerful'],
    ]);
  });

  it('lists a key-billed model the server cannot route on its own keys', () => {
    const service = makeService({
      supported: new Set([SONNET_5_5]),
      available: new Set(),
      context: { [SONNET_5_5]: PORT_CONTEXT_WINDOW },
    });

    expect(
      listed(service, ANTHROPIC_KEY).find((m) => m.id === SONNET_5_5)
    ).toMatchObject({
      routableByServer: false,
      billedToUser: true,
      contextWindow: PORT_CONTEXT_WINDOW,
    });
  });

  describe('BYOK routes', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(SNAPSHOT_DATE);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('lists each route a key reaches with its index name and the intent copy', () => {
      const route = listed(makeOpenService(), OPENROUTER_KEY).find(
        (m) => m.id === 'openrouter:anthropic/claude-sonnet-5.5'
      );

      expect(route).toMatchObject({
        label: 'Anthropic: Claude Sonnet 5.5',
        descriptionKey: 'aiModels.class.balanced',
        tier: 'balanced',
        servesIntent: 'balanced',
        isDefault: true,
        billedToUser: true,
      });
    });

    it('resolves the selectors once per served index catalog', () => {
      const catalog = new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT);
      const all = vi.spyOn(catalog, 'all');
      const service = makeOpenService([], { catalog: () => catalog });

      listed(service, ANTHROPIC_KEY);
      listed(service, OPENROUTER_KEY);

      expect(all).toHaveBeenCalledTimes(1);
    });

    it('resolves the selectors again once the index serves a new catalog', () => {
      let served = new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT);
      const service = makeOpenService([], { catalog: () => served });
      const balancedOf = () =>
        service
          .catalogFor(ANTHROPIC_KEY, INTENTS, null)
          .intents.find((entry) => entry.intent === 'balanced');

      expect(balancedOf()).toMatchObject({ modelId: SONNET_5_5 });
      served = new ModelIndexCatalog(
        MODEL_INDEX_SNAPSHOT.filter((row) => row.id !== SONNET_5_5)
      );
      expect(balancedOf()).toMatchObject({ modelId: SONNET_5 });
    });

    it('resolves the selectors again on the next UTC day for the same catalog', () => {
      const catalog = new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT);
      const all = vi.spyOn(catalog, 'all');
      const service = makeOpenService([], { catalog: () => catalog });

      listed(service, ANTHROPIC_KEY);
      vi.setSystemTime(utcDayOf(SNAPSHOT_DATE).resetsAt);
      listed(service, ANTHROPIC_KEY);

      expect(all).toHaveBeenCalledTimes(2);
    });

    it('drops a route from the same catalog once its retirement enters the window', () => {
      const lastEligibleDay = utcDayOf(SNAPSHOT_DATE);
      const retiresAt = new Date(lastEligibleDay.start);
      retiresAt.setUTCDate(retiresAt.getUTCDate() + RETIREMENT_WINDOW_DAYS + 1);
      const service = makeOpenService(
        [],
        indexOf(
          MODEL_INDEX_SNAPSHOT.map((row) =>
            row.id === SONNET_5_5
              ? { ...row, retiresAt: utcDayOf(retiresAt).key }
              : row
          )
        )
      );
      const balancedOf = () =>
        service
          .catalogFor(ANTHROPIC_KEY, INTENTS, null)
          .intents.find((entry) => entry.intent === 'balanced');

      expect(balancedOf()).toMatchObject({ modelId: SONNET_5_5 });
      vi.setSystemTime(lastEligibleDay.resetsAt);
      expect(balancedOf()).toMatchObject({ modelId: SONNET_5 });
    });
  });

  describe('promoted catalog models', () => {
    it('serves a promoted row’s copy when it serves a platform intent', () => {
      const service = makeOpenService([
        createCatalogModel({
          id: PROMOTED_ID,
          label: 'Promoted One',
          description: PROMOTED_DESCRIPTION,
          tier: 'open',
        }),
      ]);

      const promoted = listed(service, FREE_CALLER, PROMOTED_FAST_INTENTS).find(
        (m) => m.id === PROMOTED_ID
      );

      expect(promoted).toMatchObject({
        label: 'Promoted One',
        descriptionKey: '',
        description: PROMOTED_DESCRIPTION,
        tier: 'open',
        servesIntent: 'fast',
        billedToUser: false,
        routableByServer: true,
      });
    });

    it('reads promoted pricing and context through the catalog port, not the row', () => {
      const service = makeService({
        supported: new Set([PROMOTED_ID]),
        available: new Set([PROMOTED_ID]),
        context: { [PROMOTED_ID]: PORT_CONTEXT_WINDOW },
        pricing: {
          [PROMOTED_ID]: {
            inputCostPerToken: 0.000001,
            outputCostPerToken: 0.000025,
          },
        },
        promoted: [
          createCatalogModel({
            id: PROMOTED_ID,
            maxInputTokens: ROW_CONTEXT_WINDOW,
            outputCostPerToken: 0.0000001,
          }),
        ],
      });

      const promoted = listed(service, OPENROUTER_KEY).find(
        (m) => m.id === PROMOTED_ID
      );

      expect(promoted?.contextWindow).toBe(PORT_CONTEXT_WINDOW);
      expect(promoted?.costClass).toBe(3);
    });

    it('omits the description of a promoted row that carries none', () => {
      const service = makeOpenService([
        createCatalogModel({ id: PROMOTED_ID, description: '' }),
      ]);

      const promoted = listed(service, OPENROUTER_KEY).find(
        (m) => m.id === PROMOTED_ID
      );

      expect(promoted).toBeDefined();
      expect(promoted && 'description' in promoted).toBe(false);
    });

    it('omits reasoning when nothing survives the platform-billed slice', () => {
      const service = makeOpenService(
        [createCatalogModel({ id: PROMOTED_ID })],
        indexOf([
          createIndexedModel({
            id: PROMOTED_ID,
            reasoning: { levels: ['xhigh', 'max'], mandatory: false },
          }),
        ])
      );

      const promoted = listed(service, FREE_CALLER, PROMOTED_FAST_INTENTS).find(
        (m) => m.id === PROMOTED_ID
      );

      expect(promoted).toBeDefined();
      expect(promoted && 'reasoning' in promoted).toBe(false);
    });

    it('trims a promoted model’s index ladder to the platform-billed slice unless the caller’s key bills it', () => {
      const service = makeOpenService(
        [createCatalogModel({ id: PROMOTED_ID })],
        indexOf([
          createIndexedModel({
            id: PROMOTED_ID,
            reasoning: { levels: ['low', 'high', 'max'], mandatory: true },
          }),
        ])
      );

      expect(
        listed(service, FREE_CALLER, PROMOTED_FAST_INTENTS).find(
          (m) => m.id === PROMOTED_ID
        )?.reasoning
      ).toEqual({ levels: ['low', 'high'], mandatory: true });
      expect(
        listed(service, OPENROUTER_KEY).find((m) => m.id === PROMOTED_ID)
          ?.reasoning
      ).toEqual({ levels: ['low', 'high', 'max'], mandatory: true });
    });

    it('serves a promoted model the index ladder, never the ladder its row stored', () => {
      const id = 'openrouter:openai/gpt-6-luna';
      const service = makeOpenService([
        createCatalogModel({
          id,
          reasoning: { levels: ['low'], mandatory: true },
        }),
      ]);

      expect(
        listed(service, OPENROUTER_KEY).find((m) => m.id === id)?.reasoning
      ).toEqual({ levels: FULL_LADDER, mandatory: false });
      expect(service.reasoningOf(id, new Set(['openrouter']))).toEqual({
        levels: FULL_LADDER,
        mandatory: false,
      });
    });
  });

  describe('toSelectable', () => {
    it('lists a free caller’s intent models as platform-billed, the balanced one default, with no access field', () => {
      const svc = makeOpenService();
      const models = svc.toSelectable(
        svc.catalogFor(createExecutionContext({ tier: 'free' }), INTENTS, null)
      );
      expect(models.map((m) => [m.id, m.servesIntent, m.isDefault])).toEqual([
        [INTENTS.fast, 'fast', false],
        [INTENTS.balanced, 'balanced', true],
        [INTENTS.powerful, 'powerful', false],
      ]);
      expect(models.every((m) => !m.billedToUser)).toBe(true);
      expect(models.every((m) => !('access' in m))).toBe(true);
    });

    it('lists a byok caller’s models as billed to their key with the full effort ladder', () => {
      const svc = makeOpenService();
      const models = svc.toSelectable(
        svc.catalogFor(
          createExecutionContext({
            tier: 'byok',
            byokProviders: ['anthropic'],
          }),
          INTENTS,
          null
        )
      );
      expect(models.every((m) => m.billedToUser)).toBe(true);
      expect(models.find((m) => m.id === OPUS_5_5)?.reasoning?.levels).toEqual(
        FULL_LADDER
      );
    });
  });

  describe('catalogFor', () => {
    it('scopes a free caller to the platform intent models', () => {
      const catalog = makeOpenService().catalogFor(
        createExecutionContext({ tier: 'free' }),
        INTENTS,
        null
      );
      expect(catalog.models.map((m) => m.model.id)).toEqual(
        Object.values(INTENTS)
      );
    });

    it('scopes a byok caller to their own key and routes the intents over it', () => {
      const catalog = makeOpenService([
        createCatalogModel({ id: PROMOTED_ID, tier: 'balanced' }),
      ]).catalogFor(
        createExecutionContext({ tier: 'byok', byokProviders: ['anthropic'] }),
        INTENTS,
        null
      );
      expect(
        catalog.models.every((m) => m.model.id.startsWith('anthropic:'))
      ).toBe(true);
      expect(catalog.intents).toContainEqual({
        intent: 'balanced',
        available: true,
        modelId: SONNET_5_5,
        substituted: false,
      });
    });

    it('reads the ladder of a chain model outside the tier, trimmed to the free slice', () => {
      const service = makeOpenService();
      const free = service.catalogFor(
        createExecutionContext({ tier: 'free' }),
        INTENTS,
        null
      );

      expect(free.models.map((m) => m.model.id)).not.toContain(
        'openai:gpt-5.6-sol'
      );
      expect(
        service.reasoningOf('openai:gpt-5.6-sol', NO_BYOK)?.levels
      ).toEqual(FREE_LADDER);
    });

    it('reads the full ladder of a model on the caller key', () => {
      expect(
        makeOpenService().reasoningOf('openai:gpt-5.6-sol', new Set(['openai']))
          ?.levels
      ).toEqual(FULL_LADDER);
    });

    it('reads the full index ladder of a model on the caller key, a listed none making it optional', () => {
      expect(
        makeOpenService().reasoningOf('openai:gpt-6-luna', new Set(['openai']))
      ).toEqual({ levels: FULL_LADDER, mandatory: false });
    });

    it('trims the index ladder to the free slice when the caller key does not bill the model', () => {
      expect(
        makeOpenService().reasoningOf('openai:gpt-6-luna', NO_BYOK)
      ).toEqual({ levels: FREE_LADDER, mandatory: false });
    });

    it('reads each route’s own index ladder', () => {
      const service = makeOpenService();

      expect(
        service.reasoningOf('anthropic:claude-opus-5', new Set(['anthropic']))
      ).toEqual({ levels: FULL_LADDER, mandatory: true });
      expect(
        service.reasoningOf(
          'openrouter:anthropic/claude-opus-5',
          new Set(['openrouter'])
        )
      ).toEqual({ levels: FULL_LADDER, mandatory: false });
      expect(
        service.reasoningOf('openrouter:z-ai/glm-5.2', new Set(['openrouter']))
      ).toEqual({ levels: ['high', 'xhigh'], mandatory: false });
    });
  });

  describe('factsFor', () => {
    function pinnedTurn(
      service: SelectableModelsService,
      pinned: string,
      intents: Readonly<Record<ModelIntent, string>>
    ) {
      return chooseModel(
        service.catalogFor(FREE_CALLER, intents, null),
        { pinned, preferredModel: null, preferredIntent: null },
        service.factsFor(NO_BYOK, intents)
      );
    }

    const PLATFORM_FALLBACK = {
      kind: 'resolved',
      model: INTENTS.balanced,
      resolution: {
        requested: INTENTS.fast,
        resolved: INTENTS.balanced,
        fallback: {
          reason: 'not_in_tier',
          from: INTENTS.fast,
          to: INTENTS.balanced,
        },
      },
    };

    it('keeps a free caller pinned on a platform default the intents left platform-billed: not_in_tier, never key_removed', () => {
      expect(
        pinnedTurn(makeOpenService(), INTENTS.fast, PROMOTED_FAST_INTENTS)
      ).toEqual(PLATFORM_FALLBACK);
    });

    it('keeps a promoted platform default of a non-open tier platform-billed once the intents point elsewhere', () => {
      const service = makeOpenService([
        createCatalogModel({ id: INTENTS.fast, tier: 'fast' }),
      ]);

      expect(
        service
          .factsFor(NO_BYOK, PROMOTED_FAST_INTENTS)
          .isPlatformBilled(INTENTS.fast)
      ).toBe(true);
      expect(pinnedTurn(service, INTENTS.fast, PROMOTED_FAST_INTENTS)).toEqual(
        PLATFORM_FALLBACK
      );
    });

    it('bills a platform default to the platform only while the server routes it', () => {
      const service = makeService({
        supported: new Set([INTENTS.fast]),
        available: new Set(),
      });

      expect(
        service
          .factsFor(NO_BYOK, PROMOTED_FAST_INTENTS)
          .isPlatformBilled(INTENTS.fast)
      ).toBe(false);
    });

    it('bills an open model that is no platform default to the platform only once promoted', () => {
      expect(
        makeOpenService().factsFor(NO_BYOK, INTENTS).isPlatformBilled(GLM)
      ).toBe(false);
      expect(
        makeOpenService([createCatalogModel({ id: GLM, tier: 'open' })])
          .factsFor(NO_BYOK, INTENTS)
          .isPlatformBilled(GLM)
      ).toBe(true);
    });
  });
});
