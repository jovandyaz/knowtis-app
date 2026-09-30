import { describe, expect, it } from 'vitest';

import type { ModelCatalog } from '@knowtis/ai-gateway';
import type { ModelIntent } from '@knowtis/shared-types';

import type { AiExecutionContext } from '../../domain/execution-context/ai-execution-context';
import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { CompositeModelCatalog } from '../../infrastructure/catalog/composite-model-catalog';
import type { ModelCatalogAdapter } from '../../infrastructure/catalog/model-catalog.adapter';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import type { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';
import { createCatalogModel } from '../../testing/create-catalog-model';
import { createCatalogRepositoryStub } from '../../testing/create-catalog-repository-stub';
import { createExecutionContext } from '../../testing/create-execution-context';
import { SelectableModelsService } from './selectable-models.service';

const SONNET_5 = 'anthropic:claude-sonnet-5';
const NO_BYOK: ReadonlySet<string> = new Set();
const PROMOTED_ID = 'openrouter:vendor/promoted-one';
const PROMOTED_DESCRIPTION = 'Promoted from the open catalog';
const PORT_CONTEXT_WINDOW = 262_144;
const ROW_CONTEXT_WINDOW = 4_096;
const CURATED_OUTPUT_COST = 0.000015;
const SHADOWING_OUTPUT_COST = 0.0000001;
const OPEN_TIER_OUTPUT_COST = 0.000001;
const INTENTS = {
  fast: 'openrouter:minimax/minimax-m2.5',
  balanced: 'openrouter:deepseek/deepseek-v3.2',
  powerful: 'openrouter:moonshotai/kimi-k2.5',
} as const;
const PROMOTED_FAST_INTENTS = { ...INTENTS, fast: PROMOTED_ID } as const;

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

/** Typed against the real ports so a shape change breaks compilation here instead of at runtime. */
function makeSelectableModelsService(
  catalog: ModelCatalog,
  registry: RegistryStub,
  promoted: PromotedCacheStub
) {
  return new SelectableModelsService(
    catalog,
    registry as ProviderRegistryFactory,
    promoted as PromotedModelsCache
  );
}

function promotedCache(models: readonly CatalogModel[]): PromotedCacheStub {
  return { snapshot: () => models };
}

function makeOpenService(promoted: readonly CatalogModel[] = []) {
  const catalog: ModelCatalog = {
    isSupported: () => true,
    getPricing: () => ({ outputCostPerToken: OPEN_TIER_OUTPUT_COST }),
    getContextWindow: () => ({ maxInputTokens: 1000 }),
  };
  const registry: RegistryStub = { isModelAvailable: () => true };
  return makeSelectableModelsService(
    catalog,
    registry,
    promotedCache(promoted)
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
  return service.toSelectable(service.catalogFor(execution, intents));
}

describe('SelectableModelsService', () => {
  it('derives costClass from outputCostPerToken across tiers', () => {
    const ids = [
      'anthropic:claude-haiku-4-5',
      'anthropic:claude-sonnet-5',
      'anthropic:claude-opus-5',
    ];
    const svc = makeService({
      supported: new Set(ids),
      available: new Set(ids),
      pricing: {
        'anthropic:claude-haiku-4-5': {
          inputCostPerToken: 0.0000008,
          outputCostPerToken: 0.000005,
        },
        'anthropic:claude-sonnet-5': {
          inputCostPerToken: 0.000003,
          outputCostPerToken: 0.000015,
        },
        'anthropic:claude-opus-5': {
          inputCostPerToken: 0.000005,
          outputCostPerToken: 0.000025,
        },
      },
    });
    const byId = Object.fromEntries(
      listed(svc, ANTHROPIC_KEY).map((m) => [m.id, m.costClass])
    );
    expect(byId['anthropic:claude-haiku-4-5']).toBe(1);
    expect(byId['anthropic:claude-sonnet-5']).toBe(2);
    expect(byId['anthropic:claude-opus-5']).toBe(3);
  });

  it('applies costClass thresholds at the boundary values', () => {
    const ids = [
      'openai:gpt-5.6-luna',
      'anthropic:claude-sonnet-5',
      'openai:gpt-5.6-terra',
      'anthropic:claude-opus-5',
    ];
    const svc = makeService({
      supported: new Set(ids),
      available: new Set(ids),
      pricing: {
        'openai:gpt-5.6-luna': {
          inputCostPerToken: 0,
          outputCostPerToken: 0.0000099,
        },
        'anthropic:claude-sonnet-5': {
          inputCostPerToken: 0,
          outputCostPerToken: 0.00001,
        },
        'openai:gpt-5.6-terra': {
          inputCostPerToken: 0,
          outputCostPerToken: 0.0000199,
        },
        'anthropic:claude-opus-5': {
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
    expect(byId['openai:gpt-5.6-luna']).toBe(1);
    expect(byId['anthropic:claude-sonnet-5']).toBe(2);
    expect(byId['openai:gpt-5.6-terra']).toBe(2);
    expect(byId['anthropic:claude-opus-5']).toBe(3);
  });

  it('lists a key-billed model the server cannot route on its own keys', () => {
    const service = makeService({
      supported: new Set([SONNET_5]),
      available: new Set(),
      context: { [SONNET_5]: PORT_CONTEXT_WINDOW },
    });

    const models = listed(service, ANTHROPIC_KEY);

    expect(models.map((m) => m.id)).toEqual([SONNET_5]);
    expect(models[0]).toMatchObject({
      routableByServer: false,
      billedToUser: true,
      contextWindow: PORT_CONTEXT_WINDOW,
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

    it('keeps the curated entry when a promoted row repeats its id', async () => {
      // Real composite catalog: pricing and context must resolve to the curated
      // model even though a promoted row of the same id carries other numbers.
      const curated: ModelCatalog = {
        isSupported: () => true,
        getPricing: () => ({ outputCostPerToken: CURATED_OUTPUT_COST }),
        getContextWindow: () => ({ maxInputTokens: PORT_CONTEXT_WINDOW }),
      };
      const promoted = new PromotedModelsCache(
        createCatalogRepositoryStub(async () => [
          createCatalogModel({
            id: SONNET_5,
            label: 'Shadowed',
            description: PROMOTED_DESCRIPTION,
            tier: 'open',
            maxInputTokens: ROW_CONTEXT_WINDOW,
            outputCostPerToken: SHADOWING_OUTPUT_COST,
          }),
        ])
      );
      await promoted.onModuleInit();
      const service = makeSelectableModelsService(
        new CompositeModelCatalog(promoted, curated as ModelCatalogAdapter),
        { isModelAvailable: () => true },
        promoted
      );

      const matches = listed(service, ANTHROPIC_KEY).filter(
        (m) => m.id === SONNET_5
      );

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        label: 'Sonnet 5',
        descriptionKey: 'aiModels.sonnet5',
        tier: 'balanced',
        contextWindow: PORT_CONTEXT_WINDOW,
        costClass: 2,
      });
      expect(matches[0]?.description).toBeUndefined();
    });

    it('omits reasoning when nothing survives the platform-billed slice', () => {
      const service = makeOpenService([
        createCatalogModel({
          id: PROMOTED_ID,
          reasoning: { levels: ['xhigh', 'max'], mandatory: false },
        }),
      ]);

      const promoted = listed(service, FREE_CALLER, PROMOTED_FAST_INTENTS).find(
        (m) => m.id === PROMOTED_ID
      );

      expect(promoted).toBeDefined();
      expect(promoted && 'reasoning' in promoted).toBe(false);
    });

    it('trims promoted reasoning to the platform-billed slice unless the caller’s key bills it', () => {
      const service = makeOpenService([
        createCatalogModel({
          id: PROMOTED_ID,
          reasoning: { levels: ['low', 'high', 'max'], mandatory: true },
        }),
      ]);

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
  });

  describe('toSelectable', () => {
    it('lists a free caller’s intent models as platform-billed, the balanced one default, with no access field', () => {
      const svc = makeOpenService();
      const models = svc.toSelectable(
        svc.catalogFor(createExecutionContext({ tier: 'free' }), INTENTS)
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
          INTENTS
        )
      );
      expect(models.every((m) => m.billedToUser)).toBe(true);
      expect(
        models.find((m) => m.id === 'anthropic:claude-opus-5')?.reasoning
          ?.levels
      ).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    });
  });

  describe('catalogFor', () => {
    it('scopes a free caller to the platform intent models', () => {
      const catalog = makeOpenService().catalogFor(
        createExecutionContext({ tier: 'free' }),
        INTENTS
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
        INTENTS
      );
      expect(
        catalog.models.every((m) => m.model.id.startsWith('anthropic:'))
      ).toBe(true);
      expect(catalog.intents).toContainEqual({
        intent: 'balanced',
        available: true,
        modelId: 'anthropic:claude-sonnet-5',
        substituted: false,
      });
    });

    it('lets a curated id win over a promoted row with the same id', () => {
      const offered = makeOpenService([
        createCatalogModel({
          id: 'anthropic:claude-sonnet-5',
          label: 'Shadow',
        }),
      ]).offered();
      expect(
        offered.filter((m) => m.id === 'anthropic:claude-sonnet-5')
      ).toEqual([expect.objectContaining({ label: 'Sonnet 5' })]);
    });

    it('reads the ladder of a chain model outside the tier, trimmed to the free slice', () => {
      const service = makeOpenService();
      const free = service.catalogFor(
        createExecutionContext({ tier: 'free' }),
        INTENTS
      );

      expect(free.models.map((m) => m.model.id)).not.toContain(
        'openai:gpt-5.6-sol'
      );
      expect(
        service.reasoningOf('openai:gpt-5.6-sol', NO_BYOK)?.levels
      ).toEqual(['low', 'medium', 'high']);
    });

    it('reads the full ladder of a model on the caller key', () => {
      expect(
        makeOpenService().reasoningOf('openai:gpt-5.6-sol', new Set(['openai']))
          ?.levels
      ).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    });

    it('gives a model reached only over an OpenRouter key the curated ladder of the same model', () => {
      expect(
        makeOpenService().reasoningOf(
          'openrouter:anthropic/claude-opus-5',
          new Set(['openrouter'])
        )?.levels
      ).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    });
  });
});
