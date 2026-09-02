import { describe, expect, it } from 'vitest';

import type { ModelCatalog } from '@knowtis/ai-gateway';

import type { CatalogModel } from '../../domain/model-catalog/catalog-model';
import { CURATED_MODELS } from '../../domain/model-catalog/selectable-models.catalog';
import { CompositeModelCatalog } from '../../infrastructure/catalog/composite-model-catalog';
import type { ModelCatalogAdapter } from '../../infrastructure/catalog/model-catalog.adapter';
import { PromotedModelsCache } from '../../infrastructure/catalog/promoted-models.cache';
import type { ProviderRegistryFactory } from '../../infrastructure/providers/provider-registry.factory';
import { createCatalogModel } from '../../testing/create-catalog-model';
import { createCatalogRepositoryStub } from '../../testing/create-catalog-repository-stub';
import { SelectableModelsService } from './selectable-models.service';

const SYSTEM_DEFAULT = 'anthropic:claude-sonnet-5';
const NO_BYOK: ReadonlySet<string> = new Set();
/** Stands for a config that still points at every curated model, which is what these cases assume. */
const ALL_CURATED: ReadonlySet<string> = new Set(
  CURATED_MODELS.map((model) => model.id)
);
const PROMOTED_ID = 'openrouter:vendor/promoted-one';
const PROMOTED_DESCRIPTION = 'Promoted from the open catalog';
const PORT_CONTEXT_WINDOW = 262_144;
const ROW_CONTEXT_WINDOW = 4_096;
const CURATED_OUTPUT_COST = 0.000015;
const SHADOWING_OUTPUT_COST = 0.0000001;
/** Below FREE_TIER_MAX_OUTPUT_COST_PER_TOKEN, like every open-tier model the platform absorbs. */
const FREE_TIER_OUTPUT_COST = 0.000001;
const ABOVE_CEILING_OUTPUT_COST = 0.000015;

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
    getPricing: () => ({ outputCostPerToken: FREE_TIER_OUTPUT_COST }),
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
            outputCostPerToken: FREE_TIER_OUTPUT_COST,
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

describe('SelectableModelsService', () => {
  it('omits curated models whose provider key is not configured', () => {
    const svc = makeService({
      supported: new Set(['anthropic:claude-sonnet-5', 'openai:gpt-5.6-sol']),
      available: new Set(['anthropic:claude-sonnet-5']),
    });
    const ids = svc.list(SYSTEM_DEFAULT, ALL_CURATED).map((m) => m.id);
    expect(ids).toContain('anthropic:claude-sonnet-5');
    expect(ids).not.toContain('openai:gpt-5.6-sol');
  });

  it('unlocks a model when the user has a BYOK key for its provider', () => {
    const registry: RegistryStub = {
      isModelAvailable: (id: string) => id.startsWith('anthropic:'),
    };
    const catalog: ModelCatalog = {
      isSupported: () => true,
      getPricing: () => ({ outputCostPerToken: 0.000005 }),
      getContextWindow: () => ({ maxInputTokens: 1000 }),
    };
    const svc = makeSelectableModelsService(
      catalog,
      registry,
      promotedCache([])
    );
    const withByok = svc.list(
      'anthropic:claude-sonnet-5',
      ALL_CURATED,
      new Set(['google'])
    );
    expect(withByok.some((m) => m.id.startsWith('google:'))).toBe(true);
    const without = svc.list('anthropic:claude-sonnet-5', ALL_CURATED);
    expect(without.some((m) => m.id.startsWith('google:'))).toBe(false);
  });

  it('flags billedToUser only for models whose provider has a BYOK key', () => {
    const svc = makeOpenService();
    const models = svc.list(
      'anthropic:claude-sonnet-5',
      ALL_CURATED,
      new Set(['google'])
    );
    expect(models.find((m) => m.id.startsWith('google:'))?.billedToUser).toBe(
      true
    );
    expect(
      models.find((m) => m.id.startsWith('anthropic:'))?.billedToUser
    ).toBe(false);
  });

  it('isSelectable unlocks a curated model via a matching BYOK provider', () => {
    const svc = makeService({
      supported: new Set(['google:gemini-3.7-flash']),
      available: new Set(),
    });
    expect(svc.isSelectable('google:gemini-3.7-flash', ALL_CURATED)).toBe(
      false
    );
    expect(
      svc.isSelectable(
        'google:gemini-3.7-flash',
        ALL_CURATED,
        new Set(['google'])
      )
    ).toBe(true);
  });

  it('drops a curated model the running config no longer points at', () => {
    const svc = makeService({
      supported: new Set(['anthropic:claude-sonnet-5', 'openai:gpt-5.6-sol']),
      available: new Set(['anthropic:claude-sonnet-5', 'openai:gpt-5.6-sol']),
    });
    const configured: ReadonlySet<string> = new Set([
      'anthropic:claude-sonnet-5',
    ]);

    const ids = svc.list(SYSTEM_DEFAULT, configured).map((m) => m.id);

    expect(ids).toEqual(['anthropic:claude-sonnet-5']);
    expect(svc.isSelectable('openai:gpt-5.6-sol', configured)).toBe(false);
  });

  it('offers a promoted model without any config pointing at it', () => {
    const promoted = createCatalogModel({
      id: PROMOTED_ID,
      tier: 'open',
      outputCostPerToken: FREE_TIER_OUTPUT_COST,
    });
    const svc = makeOpenService([promoted]);

    const ids = svc.list(SYSTEM_DEFAULT, new Set()).map((m) => m.id);

    expect(ids).toEqual([PROMOTED_ID]);
  });

  it('marks the system default with isDefault', () => {
    const svc = makeService({
      supported: new Set([SYSTEM_DEFAULT]),
      available: new Set([SYSTEM_DEFAULT]),
    });
    const def = svc
      .list(SYSTEM_DEFAULT, ALL_CURATED)
      .find((m) => m.id === SYSTEM_DEFAULT);
    expect(def?.isDefault).toBe(true);
  });

  it('isSelectable is false for an uncurated or unavailable id', () => {
    const svc = makeService({
      supported: new Set([SYSTEM_DEFAULT]),
      available: new Set([SYSTEM_DEFAULT]),
    });
    expect(svc.isSelectable(SYSTEM_DEFAULT, ALL_CURATED)).toBe(true);
    expect(svc.isSelectable('anthropic:not-curated', ALL_CURATED)).toBe(false);
    expect(svc.isSelectable('openai:gpt-5.6-sol', ALL_CURATED)).toBe(false); // curated but unavailable
  });

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
      svc.list(SYSTEM_DEFAULT, ALL_CURATED).map((m) => [m.id, m.costClass])
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
      svc.list(SYSTEM_DEFAULT, ALL_CURATED).map((m) => [m.id, m.costClass])
    );
    expect(byId['openai:gpt-5.6-luna']).toBe(1);
    expect(byId['anthropic:claude-sonnet-5']).toBe(2);
    expect(byId['openai:gpt-5.6-terra']).toBe(2);
    expect(byId['anthropic:claude-opus-5']).toBe(3);
  });

  it('should keep a gated premium model visible but marked requires_byok', () => {
    const service = makeOpenService();
    const models = service.list(
      'openrouter:deepseek/deepseek-v3.2',
      ALL_CURATED,
      NO_BYOK,
      true
    );
    const premium = models.find((m) => m.tier !== 'open');
    expect(premium?.access).toBe('requires_byok');
  });

  it('should refuse to select a gated model and accept it with the key', () => {
    const service = makeOpenService();
    const premiumId = 'anthropic:claude-haiku-4-5';
    expect(service.isSelectable(premiumId, ALL_CURATED, NO_BYOK, true)).toBe(
      false
    );
    expect(
      service.isSelectable(premiumId, ALL_CURATED, new Set(['anthropic']), true)
    ).toBe(true);
  });

  it('should change nothing while the flag is off', () => {
    const service = makeOpenService();
    expect(
      service
        .list('openrouter:deepseek/deepseek-v3.2', ALL_CURATED, NO_BYOK, false)
        .every((m) => m.access === 'granted')
    ).toBe(true);
  });

  it('offers the first open model as fallback for a gated keyless caller', () => {
    const service = makeOpenService();
    expect(service.firstSelectable(ALL_CURATED, NO_BYOK, true)).toBe(
      'openrouter:deepseek/deepseek-v3.2'
    );
  });

  it('offers the first curated model as fallback while the flag is off', () => {
    const service = makeOpenService();
    expect(service.firstSelectable(ALL_CURATED, NO_BYOK, false)).toBe(
      'anthropic:claude-haiku-4-5'
    );
  });

  it('returns null when no curated model is selectable', () => {
    const service = makeService({
      supported: new Set(),
      available: new Set(),
    });
    expect(service.firstSelectable(ALL_CURATED, NO_BYOK, true)).toBeNull();
  });

  describe('promoted catalog models', () => {
    it('lists exactly the curated set while nothing is promoted', () => {
      const service = makeOpenService();
      expect(
        service.list(SYSTEM_DEFAULT, ALL_CURATED).map((m) => m.id)
      ).toEqual(CURATED_MODELS.map((m) => m.id));
    });

    it('serves a promoted row as a free open-tier model with its description', () => {
      const service = makeOpenService([
        createCatalogModel({
          id: PROMOTED_ID,
          label: 'Promoted One',
          description: PROMOTED_DESCRIPTION,
          tier: 'open',
        }),
      ]);

      const listed = service.list(SYSTEM_DEFAULT, ALL_CURATED, NO_BYOK, true);
      const promoted = listed.find((m) => m.id === PROMOTED_ID);

      expect(listed.map((m) => m.id)).toEqual([
        ...CURATED_MODELS.map((m) => m.id),
        PROMOTED_ID,
      ]);
      expect(promoted).toMatchObject({
        label: 'Promoted One',
        descriptionKey: '',
        description: PROMOTED_DESCRIPTION,
        tier: 'open',
        access: 'granted',
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

      const promoted = service
        .list(SYSTEM_DEFAULT, ALL_CURATED)
        .find((m) => m.id === PROMOTED_ID);

      expect(promoted?.contextWindow).toBe(PORT_CONTEXT_WINDOW);
      expect(promoted?.costClass).toBe(3);
    });

    it('bills a promoted model to the user holding its provider key', () => {
      const service = makeOpenService([
        createCatalogModel({ id: PROMOTED_ID, tier: 'open' }),
      ]);

      const promoted = service
        .list(SYSTEM_DEFAULT, ALL_CURATED, new Set(['openrouter']))
        .find((m) => m.id === PROMOTED_ID);

      expect(promoted?.billedToUser).toBe(true);
    });

    it('omits the description of a promoted row that carries none', () => {
      const service = makeOpenService([
        createCatalogModel({ id: PROMOTED_ID, description: '' }),
      ]);

      const promoted = service
        .list(SYSTEM_DEFAULT, ALL_CURATED)
        .find((m) => m.id === PROMOTED_ID);

      expect(promoted?.description).toBeUndefined();
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
            id: SYSTEM_DEFAULT,
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

      const matches = service
        .list(SYSTEM_DEFAULT, ALL_CURATED)
        .filter((m) => m.id === SYSTEM_DEFAULT);

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

    /** The promote button is not a code review: the stored price, not the tier, decides who pays. */
    describe('a model promoted above the free-tier ceiling', () => {
      async function serviceWithPromotedPrice(outputCostPerToken: number) {
        const promoted = new PromotedModelsCache(
          createCatalogRepositoryStub(async () => [
            createCatalogModel({
              id: PROMOTED_ID,
              tier: 'open',
              outputCostPerToken,
            }),
          ])
        );
        await promoted.onModuleInit();
        const curatedOnly = {
          isSupported: () => false,
          getPricing: () => undefined,
          getContextWindow: () => undefined,
        };
        return new SelectableModelsService(
          new CompositeModelCatalog(promoted, curatedOnly as never),
          { isModelAvailable: () => true } as never,
          promoted
        );
      }

      it('is unreachable without a key even though its tier is open', async () => {
        const service = await serviceWithPromotedPrice(
          ABOVE_CEILING_OUTPUT_COST
        );

        expect(
          service.isSelectable(PROMOTED_ID, ALL_CURATED, NO_BYOK, true)
        ).toBe(false);
        expect(
          service
            .list(SYSTEM_DEFAULT, ALL_CURATED, NO_BYOK, true)
            .find((m) => m.id === PROMOTED_ID)?.access
        ).toBe('requires_byok');
      });

      it('stays unreachable without a key while tier gating is off', async () => {
        const service = await serviceWithPromotedPrice(
          ABOVE_CEILING_OUTPUT_COST
        );

        expect(
          service.isSelectable(PROMOTED_ID, ALL_CURATED, NO_BYOK, false)
        ).toBe(false);
      });

      it('opens up to the caller who brings the provider key', async () => {
        const service = await serviceWithPromotedPrice(
          ABOVE_CEILING_OUTPUT_COST
        );

        expect(
          service.isSelectable(
            PROMOTED_ID,
            ALL_CURATED,
            new Set(['openrouter']),
            true
          )
        ).toBe(true);
      });

      it('stays free when the stored price is under the ceiling', async () => {
        const service = await serviceWithPromotedPrice(FREE_TIER_OUTPUT_COST);

        expect(
          service.isSelectable(PROMOTED_ID, ALL_CURATED, NO_BYOK, true)
        ).toBe(true);
      });

      it('honours a tightened ceiling the operator configured', async () => {
        const service = await serviceWithPromotedPrice(FREE_TIER_OUTPUT_COST);
        const tightened = FREE_TIER_OUTPUT_COST / 2;

        expect(
          service.isSelectable(PROMOTED_ID, ALL_CURATED, NO_BYOK, true)
        ).toBe(true);
        expect(
          service.isSelectable(
            PROMOTED_ID,
            ALL_CURATED,
            NO_BYOK,
            true,
            tightened
          )
        ).toBe(false);
        expect(
          service
            .list(SYSTEM_DEFAULT, ALL_CURATED, NO_BYOK, true, tightened)
            .find((m) => m.id === PROMOTED_ID)?.access
        ).toBe('requires_byok');
        expect(
          service.firstSelectable(ALL_CURATED, NO_BYOK, true, tightened)
        ).not.toBe(PROMOTED_ID);
      });
    });

    it('selects a promoted model the curated catalog does not know', () => {
      const service = makeService({
        supported: new Set([PROMOTED_ID]),
        available: new Set([PROMOTED_ID]),
        promoted: [createCatalogModel({ id: PROMOTED_ID })],
      });

      expect(
        service.isSelectable(PROMOTED_ID, ALL_CURATED, NO_BYOK, true)
      ).toBe(true);
      expect(service.firstSelectable(ALL_CURATED, NO_BYOK, true)).toBe(
        PROMOTED_ID
      );
    });

    it('offers a promoted model of a tier no curated key of the caller reaches', () => {
      const service = makeOpenService([
        createCatalogModel({ id: PROMOTED_ID, tier: 'powerful' }),
      ]);

      expect(
        service.firstOfTier('powerful', ALL_CURATED, new Set(['openrouter']))
      ).toBe(PROMOTED_ID);
    });

    it('ranks curated models of a tier above promoted ones', () => {
      const service = makeOpenService([
        createCatalogModel({ id: PROMOTED_ID, tier: 'powerful' }),
      ]);

      expect(
        service.firstOfTier(
          'powerful',
          ALL_CURATED,
          new Set(['anthropic', 'openrouter'])
        )
      ).toBe('anthropic:claude-opus-5');
    });
  });

  describe('reasoning and intent assignment', () => {
    const MINIMAX_M3 = 'openrouter:minimax/minimax-m3';
    const INTENTS = {
      fast: MINIMAX_M3,
      balanced: 'anthropic:claude-sonnet-5',
      powerful: 'anthropic:claude-opus-5',
    } as const;

    it('marks the entry serving each configured intent', () => {
      const service = makeOpenService([
        createCatalogModel({ id: MINIMAX_M3, tier: 'open' }),
      ]);

      const listed = service.list(
        SYSTEM_DEFAULT,
        ALL_CURATED,
        NO_BYOK,
        false,
        undefined,
        INTENTS
      );

      expect(listed.find((m) => m.id === MINIMAX_M3)?.servesIntent).toBe(
        'fast'
      );
      expect(
        listed.find((m) => m.id === 'anthropic:claude-sonnet-5')?.servesIntent
      ).toBe('balanced');
      expect(
        listed.find((m) => m.id === 'anthropic:claude-opus-5')?.servesIntent
      ).toBe('powerful');
      const unassigned = listed.filter(
        (m) => !Object.values(INTENTS).includes(m.id as never)
      );
      expect(unassigned.every((m) => !('servesIntent' in m))).toBe(true);
    });

    it('serves curated reasoning metadata on the entry', () => {
      const service = makeOpenService();

      const listed = service.list(SYSTEM_DEFAULT, ALL_CURATED);

      expect(
        listed.find((m) => m.id === 'anthropic:claude-sonnet-5')?.reasoning
      ).toEqual({
        levels: ['low', 'medium', 'high', 'xhigh', 'max'],
        mandatory: false,
      });
      expect(
        listed.find((m) => m.id === 'google:gemini-3.7-flash')?.reasoning
      ).toEqual({ levels: ['low', 'medium', 'high'], mandatory: true });
      const haiku = listed.find((m) => m.id === 'anthropic:claude-haiku-4-5');
      expect(haiku).toBeDefined();
      expect(haiku && 'reasoning' in haiku).toBe(false);
      const openrouterCurated = listed.find(
        (m) => m.id === 'openrouter:deepseek/deepseek-v3.2'
      );
      expect(openrouterCurated && 'reasoning' in openrouterCurated).toBe(false);
    });

    it('serves promoted reasoning from the catalog snapshot', () => {
      const service = makeOpenService([
        createCatalogModel({
          id: PROMOTED_ID,
          reasoning: { levels: ['low', 'high', 'max'], mandatory: true },
        }),
      ]);

      const promoted = service
        .list(SYSTEM_DEFAULT, ALL_CURATED)
        .find((m) => m.id === PROMOTED_ID);

      expect(promoted?.reasoning).toEqual({
        levels: ['low', 'high', 'max'],
        mandatory: true,
      });
    });

    it('an intent pointing at an unofferable model marks no entry', () => {
      const service = makeOpenService();

      const listed = service.list(
        SYSTEM_DEFAULT,
        ALL_CURATED,
        NO_BYOK,
        false,
        undefined,
        {
          fast: 'openrouter:vendor/not-offered',
          balanced: 'anthropic:claude-sonnet-5',
          powerful: 'anthropic:claude-opus-5',
        }
      );

      expect(listed.some((m) => m.servesIntent === 'fast')).toBe(false);
      expect(
        listed.find((m) => m.id === 'anthropic:claude-sonnet-5')?.servesIntent
      ).toBe('balanced');
    });
  });

  describe('firstOfTier', () => {
    it('returns the first curated model of the tier the caller has a key for', () => {
      const service = makeOpenService();
      expect(
        service.firstOfTier('powerful', ALL_CURATED, new Set(['anthropic']))
      ).toBe('anthropic:claude-opus-5');
      expect(
        service.firstOfTier('powerful', ALL_CURATED, new Set(['openai']))
      ).toBe('openai:gpt-5.6-sol');
    });

    it('ranks by catalog order when the caller holds keys for several providers of the tier', () => {
      const service = makeOpenService();
      expect(
        service.firstOfTier(
          'powerful',
          ALL_CURATED,
          new Set(['openai', 'anthropic'])
        )
      ).toBe('anthropic:claude-opus-5');
      expect(
        service.firstOfTier('fast', ALL_CURATED, new Set(['google', 'openai']))
      ).toBe('openai:gpt-5.6-luna');
    });

    it('returns null when no curated model of the tier matches the BYOK set', () => {
      const service = makeOpenService();
      expect(service.firstOfTier('powerful', ALL_CURATED, NO_BYOK)).toBeNull();
      expect(
        service.firstOfTier('powerful', ALL_CURATED, new Set(['openrouter']))
      ).toBeNull();
    });

    it('returns null when the tier model the caller holds a key for is uninvocable', () => {
      const service = makeService({
        supported: new Set(),
        available: new Set(),
      });
      expect(
        service.firstOfTier('fast', ALL_CURATED, new Set(['anthropic']))
      ).toBeNull();
    });
  });

  describe('curated models unlocked by BYOK', () => {
    const NOTHING_CONFIGURED: ReadonlySet<string> = new Set();
    const anthropicCuratedIds = CURATED_MODELS.filter((m) =>
      m.id.startsWith('anthropic:')
    ).map((m) => m.id);

    it('offers every curated model of a provider the caller brings a key for', () => {
      const service = makeOpenService();
      const listed = service.list(
        SYSTEM_DEFAULT,
        NOTHING_CONFIGURED,
        new Set(['anthropic'])
      );
      expect(listed.map((m) => m.id)).toEqual(anthropicCuratedIds);
      for (const model of listed) {
        expect(model.billedToUser).toBe(true);
        expect(model.access).toBe('granted');
      }
    });

    it('keeps unconfigured curated models hidden without that provider key', () => {
      const service = makeOpenService();
      const openaiOnly = service
        .list(SYSTEM_DEFAULT, NOTHING_CONFIGURED, new Set(['openai']))
        .map((m) => m.id);
      expect(openaiOnly.every((id) => id.startsWith('openai:'))).toBe(true);
      expect(service.list(SYSTEM_DEFAULT, NOTHING_CONFIGURED, NO_BYOK)).toEqual(
        []
      );
    });

    it('lets a BYOK holder select an unconfigured curated model', () => {
      const service = makeOpenService();
      expect(
        service.isSelectable(
          SYSTEM_DEFAULT,
          NOTHING_CONFIGURED,
          new Set(['anthropic'])
        )
      ).toBe(true);
      expect(
        service.isSelectable(SYSTEM_DEFAULT, NOTHING_CONFIGURED, NO_BYOK)
      ).toBe(false);
    });

    it('offers a BYOK-unlocked model even when the server has no key for its provider', () => {
      const service = makeService({
        supported: new Set([SYSTEM_DEFAULT]),
        available: new Set(),
        context: { [SYSTEM_DEFAULT]: PORT_CONTEXT_WINDOW },
      });
      const listed = service.list(
        SYSTEM_DEFAULT,
        NOTHING_CONFIGURED,
        new Set(['anthropic'])
      );
      expect(listed.map((m) => m.id)).toEqual([SYSTEM_DEFAULT]);
      expect(listed[0].routableByServer).toBe(false);
    });

    it('feeds firstOfTier from the BYOK-unlocked catalog when nothing is configured', () => {
      const service = makeOpenService();
      expect(
        service.firstOfTier(
          'balanced',
          NOTHING_CONFIGURED,
          new Set(['anthropic'])
        )
      ).toBe(SYSTEM_DEFAULT);
    });
  });
});
