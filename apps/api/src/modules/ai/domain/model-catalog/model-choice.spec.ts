import { describe, expect, it } from 'vitest';

import {
  MODEL_INDEX_SNAPSHOT,
  ModelIndexCatalog,
  type IndexedModel,
} from '@knowtis/ai-gateway';
import {
  DEFAULT_MODEL_INTENT,
  MODEL_INTENTS,
  type AccessTier,
  type ByokProvider,
  type ModelIntent,
} from '@knowtis/shared-types';

import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import { TIER_POLICIES } from '../execution-context/tier-policy';
import { resolveByokSelectors } from './byok-intent-routes';
import {
  chooseModel,
  INTENT_FALLBACK_ORDER,
  type ModelFacts,
  type ModelRequest,
} from './model-choice';
import { plainRouteCanonical } from './plain-route';
import { tierCatalog, type OfferedModel } from './tier-catalog';

const PLATFORM_INTENTS: Record<ModelIntent, string> = {
  fast: 'openrouter:minimax/minimax-m2.5',
  balanced: 'openrouter:deepseek/deepseek-v3.2',
  powerful: 'openrouter:moonshotai/kimi-k2.5',
};
const PLATFORM_INTENT_IDS: readonly string[] = Object.values(PLATFORM_INTENTS);
const OPEN_MODEL = 'openrouter:z-ai/glm-5.2';
const OPEN_TIER_IDS: readonly string[] = [...PLATFORM_INTENT_IDS, OPEN_MODEL];
const INDEX = new ModelIndexCatalog(MODEL_INDEX_SNAPSHOT);
const UNLISTED = 'anthropic:claude-unlisted-1';
const UNLISTED_ROUTE = 'openrouter:acme/unlisted-model';
const RETIRED = 'anthropic:claude-sonnet-3';
const SUPERSEDED = 'anthropic:claude-sonnet-5';
const DIRECT_SONNET = 'anthropic:claude-sonnet-5-5';
const ROUTED_SONNET = 'openrouter:anthropic/claude-sonnet-5.5';
const DIRECT_OPUS = 'anthropic:claude-opus-5-5';
const ROUTED_OPUS = 'openrouter:anthropic/claude-opus-5.5';
const platformRoutes = (id: string) => id.startsWith('openrouter:');
const offered = (id: string): OfferedModel => ({
  id,
  label: id,
  descriptionKey: '',
  tier: 'open',
});
const OFFERED = [
  ...OPEN_TIER_IDS,
  'openrouter:openai/gpt-6-sol',
  'openrouter:openai/gpt-5.6-sol-pro',
  'openrouter:google/gemini-3.5-flash:batch',
  UNLISTED_ROUTE,
].map(offered);

function unpriced(modelId: string): readonly IndexedModel[] {
  return MODEL_INDEX_SNAPSHOT.map((row) =>
    row.id === modelId
      ? { ...row, inputCostPerToken: null, outputCostPerToken: null }
      : row
  );
}

function setup(
  tier: AccessTier,
  held: readonly ByokProvider[] = [],
  isSupported: (id: string) => boolean = (id) => id !== RETIRED,
  options: {
    storedPrimary?: ByokProvider | null;
    platformIntents?: Record<ModelIntent, string>;
    rows?: readonly IndexedModel[];
  } = {}
) {
  const platformIntents = options.platformIntents ?? PLATFORM_INTENTS;
  const platformIntentIds: readonly string[] = Object.values(platformIntents);
  const facts: ModelFacts = {
    heldProviders: new Set(held),
    isSupported,
    canonicalOf: (id) => plainRouteCanonical(id, INDEX.get(id)?.canonical),
    isPlatformBilled: (id) =>
      platformIntentIds.includes(id) ||
      (OPEN_TIER_IDS.includes(id) && platformRoutes(id)),
  };
  const catalog = tierCatalog({
    tier,
    scope: TIER_POLICIES[tier].catalog,
    heldProviders: held,
    storedPrimary: options.storedPrimary ?? null,
    platformIntents,
    offered: OFFERED,
    isSupported,
    isPlatformRoutable: platformRoutes,
    indexRow: () => undefined,
    byok: resolveByokSelectors(
      options.rows ?? MODEL_INDEX_SNAPSHOT,
      SNAPSHOT_DATE
    ),
  });
  return (request: Partial<ModelRequest>) =>
    chooseModel(
      catalog,
      { preferredModel: null, preferredIntent: null, ...request },
      facts
    );
}

describe('chooseModel', () => {
  it('serves the default intent when nothing is requested', () => {
    expect(setup('free')({})).toEqual({
      kind: 'resolved',
      model: PLATFORM_INTENTS.balanced,
      resolution: { requested: null, resolved: PLATFORM_INTENTS.balanced },
    });
  });

  it('serves the stored intent', () => {
    expect(setup('free')({ preferredIntent: 'fast' })).toMatchObject({
      model: PLATFORM_INTENTS.fast,
    });
  });

  describe('an intent with no route', () => {
    const without =
      (...models: string[]) =>
      (id: string) =>
        id !== RETIRED && !models.includes(id);

    it('serves another intent and reports it when the stored intent has no route', () => {
      expect(
        setup(
          'free',
          [],
          without(PLATFORM_INTENTS.fast)
        )({ preferredIntent: 'fast' })
      ).toEqual({
        kind: 'resolved',
        model: PLATFORM_INTENTS.balanced,
        resolution: {
          requested: null,
          resolved: PLATFORM_INTENTS.balanced,
          fallback: {
            reason: 'intent_unavailable',
            from: 'fast',
            to: PLATFORM_INTENTS.balanced,
          },
        },
      });
    });

    it('serves fast when balanced has no route', () => {
      expect(setup('free', [], without(PLATFORM_INTENTS.balanced))({})).toEqual(
        {
          kind: 'resolved',
          model: PLATFORM_INTENTS.fast,
          resolution: {
            requested: null,
            resolved: PLATFORM_INTENTS.fast,
            fallback: {
              reason: 'intent_unavailable',
              from: 'balanced',
              to: PLATFORM_INTENTS.fast,
            },
          },
        }
      );
    });

    it('serves powerful when balanced and fast have no route', () => {
      expect(
        setup(
          'free',
          [],
          without(PLATFORM_INTENTS.balanced, PLATFORM_INTENTS.fast)
        )({})
      ).toMatchObject({
        model: PLATFORM_INTENTS.powerful,
        resolution: {
          fallback: { reason: 'intent_unavailable', from: 'balanced' },
        },
      });
    });

    it('serves the first remaining intent on a partial byok key', () => {
      const HAIKU = 'anthropic:claude-haiku-4-5';
      expect(
        setup('byok', ['anthropic'], undefined, {
          rows: MODEL_INDEX_SNAPSHOT.filter(
            (row) => row.family !== 'claude-sonnet'
          ),
        })({})
      ).toEqual({
        kind: 'resolved',
        model: HAIKU,
        resolution: {
          requested: null,
          resolved: HAIKU,
          fallback: {
            reason: 'intent_unavailable',
            from: 'balanced',
            to: HAIKU,
          },
        },
      });
    });

    it('refuses an anonymous caller whose only intent has no route', () => {
      expect(
        setup('anonymous', [], without(PLATFORM_INTENTS.balanced))({})
      ).toEqual({
        kind: 'unavailable',
        reason: 'no_route',
        suggestedModel: null,
      });
    });

    it('refuses with no_route when no intent has a route', () => {
      expect(setup('free', [], without(...PLATFORM_INTENT_IDS))({})).toEqual({
        kind: 'unavailable',
        reason: 'no_route',
        suggestedModel: null,
      });
    });

    it('suggests the first available intent for an explicit model outside the tier', () => {
      expect(
        setup(
          'free',
          [],
          without(PLATFORM_INTENTS.balanced)
        )({ explicit: OPEN_MODEL })
      ).toEqual({
        kind: 'unavailable',
        reason: 'not_in_tier',
        suggestedModel: PLATFORM_INTENTS.fast,
      });
    });
  });

  it('covers every intent in the fallback order', () => {
    expect([...INTENT_FALLBACK_ORDER].sort()).toEqual(
      [...MODEL_INTENTS].sort()
    );
  });

  it('substitutes intents starting from the default intent', () => {
    expect(INTENT_FALLBACK_ORDER[0]).toBe(DEFAULT_MODEL_INTENT);
  });

  it('accepts an explicit model inside the tier as is', () => {
    expect(setup('free')({ explicit: PLATFORM_INTENTS.fast })).toEqual({
      kind: 'resolved',
      model: PLATFORM_INTENTS.fast,
      resolution: {
        requested: PLATFORM_INTENTS.fast,
        resolved: PLATFORM_INTENTS.fast,
      },
    });
  });

  it('refuses an explicit model outside the tier and suggests the default', () => {
    expect(setup('free')({ explicit: OPEN_MODEL })).toEqual({
      kind: 'unavailable',
      reason: 'not_in_tier',
      suggestedModel: PLATFORM_INTENTS.balanced,
    });
  });

  it('refuses an explicit model the catalog no longer knows as retired', () => {
    expect(setup('free')({ explicit: RETIRED })).toMatchObject({
      kind: 'unavailable',
      reason: 'model_retired',
    });
  });

  it('refuses an explicit superseded model on a held key as retired, never as outside the plan', () => {
    expect(setup('byok', ['anthropic'])({ explicit: SUPERSEDED })).toEqual({
      kind: 'unavailable',
      reason: 'model_retired',
      suggestedModel: DIRECT_SONNET,
    });
  });

  it('refuses an explicit key model a platform catalog does not list as outside the tier', () => {
    expect(setup('free', ['openrouter'])({ explicit: OPEN_MODEL })).toEqual({
      kind: 'unavailable',
      reason: 'not_in_tier',
      suggestedModel: PLATFORM_INTENTS.balanced,
    });
  });

  it('refuses an explicit model on a key a byok caller does not hold as outside the tier', () => {
    expect(setup('byok', ['anthropic'])({ explicit: OPEN_MODEL })).toEqual({
      kind: 'unavailable',
      reason: 'not_in_tier',
      suggestedModel: DIRECT_SONNET,
    });
  });

  it('honours a key-billed preference inside the byok catalog', () => {
    expect(
      setup('byok', ['anthropic'])({
        preferredModel: DIRECT_OPUS,
      })
    ).toEqual({
      kind: 'resolved',
      model: DIRECT_OPUS,
      resolution: {
        requested: DIRECT_OPUS,
        resolved: DIRECT_OPUS,
      },
    });
  });

  it('ignores a platform pick stored by a byok caller and serves their key intent', () => {
    expect(
      setup('byok', ['anthropic'])({
        preferredModel: OPEN_MODEL,
      })
    ).toEqual({
      kind: 'resolved',
      model: DIRECT_SONNET,
      resolution: { requested: null, resolved: DIRECT_SONNET },
    });
  });

  it('falls back visibly from a retired key model to the key intent model', () => {
    expect(setup('byok', ['anthropic'])({ preferredModel: RETIRED })).toEqual({
      kind: 'resolved',
      model: DIRECT_SONNET,
      resolution: {
        requested: RETIRED,
        resolved: DIRECT_SONNET,
        fallback: {
          reason: 'model_retired',
          from: RETIRED,
          to: DIRECT_SONNET,
        },
      },
    });
  });

  it.each(['preferredModel', 'pinned'] as const)(
    'falls back from a superseded key model the catalog still supports as retired, given as %s',
    (field) => {
      expect(setup('byok', ['anthropic'])({ [field]: SUPERSEDED })).toEqual({
        kind: 'resolved',
        model: DIRECT_SONNET,
        resolution: {
          requested: SUPERSEDED,
          resolved: DIRECT_SONNET,
          fallback: {
            reason: 'model_retired',
            from: SUPERSEDED,
            to: DIRECT_SONNET,
          },
        },
      });
    }
  );

  it('keeps refusing a key model outside a platform catalog as not in the tier', () => {
    expect(setup('free', ['openrouter'])({ pinned: OPEN_MODEL })).toEqual({
      kind: 'unavailable',
      reason: 'not_in_tier',
      suggestedModel: PLATFORM_INTENTS.balanced,
    });
  });

  it.each(['preferredModel', 'pinned'] as const)(
    'falls back from a retired model on a held OpenRouter key given as %s',
    (field) => {
      const retiredRoute = 'openrouter:mistralai/mistral-large-2';
      const keyIntent = ROUTED_SONNET;
      expect(
        setup(
          'byok',
          ['openrouter'],
          (id) => id !== retiredRoute
        )({ [field]: retiredRoute })
      ).toEqual({
        kind: 'resolved',
        model: keyIntent,
        resolution: {
          requested: retiredRoute,
          resolved: keyIntent,
          fallback: {
            reason: 'model_retired',
            from: retiredRoute,
            to: keyIntent,
          },
        },
      });
    }
  );

  it('treats a platform-billed model on a held key as key-billed', () => {
    const fastRetired = (id: string) => id !== PLATFORM_INTENTS.fast;
    const keyIntent = ROUTED_SONNET;
    expect(
      setup(
        'byok',
        ['openrouter'],
        fastRetired
      )({ pinned: PLATFORM_INTENTS.fast })
    ).toEqual({
      kind: 'resolved',
      model: keyIntent,
      resolution: {
        requested: PLATFORM_INTENTS.fast,
        resolved: keyIntent,
        fallback: {
          reason: 'model_retired',
          from: PLATFORM_INTENTS.fast,
          to: keyIntent,
        },
      },
    });
  });

  it('falls back from a pinned model on a removed key onto another held key', () => {
    expect(setup('byok', ['openai'])({ pinned: DIRECT_OPUS })).toEqual({
      kind: 'resolved',
      model: 'openai:gpt-5.6-terra',
      resolution: {
        requested: DIRECT_OPUS,
        resolved: 'openai:gpt-5.6-terra',
        fallback: {
          reason: 'key_removed',
          from: DIRECT_OPUS,
          to: 'openai:gpt-5.6-terra',
        },
      },
    });
  });

  it('falls back visibly from a pinned platform model outside the tier', () => {
    expect(setup('anonymous')({ pinned: PLATFORM_INTENTS.fast })).toEqual({
      kind: 'resolved',
      model: PLATFORM_INTENTS.balanced,
      resolution: {
        requested: PLATFORM_INTENTS.fast,
        resolved: PLATFORM_INTENTS.balanced,
        fallback: {
          reason: 'not_in_tier',
          from: PLATFORM_INTENTS.fast,
          to: PLATFORM_INTENTS.balanced,
        },
      },
    });
  });

  it("falls back visibly from a free caller's old open-model pin onto the free intent", () => {
    expect(setup('free')({ pinned: OPEN_MODEL })).toEqual({
      kind: 'resolved',
      model: PLATFORM_INTENTS.balanced,
      resolution: {
        requested: OPEN_MODEL,
        resolved: PLATFORM_INTENTS.balanced,
        fallback: {
          reason: 'not_in_tier',
          from: OPEN_MODEL,
          to: PLATFORM_INTENTS.balanced,
        },
      },
    });
  });

  it('refuses a pinned retired key model after the key is gone, never a platform model', () => {
    expect(setup('free')({ pinned: RETIRED })).toEqual({
      kind: 'unavailable',
      reason: 'model_retired',
      suggestedModel: PLATFORM_INTENTS.balanced,
    });
  });

  it('refuses a pinned key model after the key is gone instead of billing the platform', () => {
    expect(setup('free')({ pinned: DIRECT_OPUS })).toEqual({
      kind: 'unavailable',
      reason: 'key_removed',
      suggestedModel: PLATFORM_INTENTS.balanced,
    });
  });

  it('refuses a pinned platform model on a byok turn instead of moving it onto the key', () => {
    expect(
      setup('byok', ['anthropic'])({ pinned: PLATFORM_INTENTS.fast })
    ).toEqual({
      kind: 'unavailable',
      reason: 'not_in_tier',
      suggestedModel: DIRECT_SONNET,
    });
  });

  describe('a pick of a canonical model served over another held key', () => {
    it.each(['preferredModel', 'pinned'] as const)(
      'runs a listed route as picked whatever the primary provider, given as %s',
      (field) => {
        expect(
          setup('byok', ['anthropic', 'openrouter'], undefined, {
            storedPrimary: 'anthropic',
          })({ [field]: ROUTED_SONNET })
        ).toEqual({
          kind: 'resolved',
          model: ROUTED_SONNET,
          resolution: { requested: ROUTED_SONNET, resolved: ROUTED_SONNET },
        });
      }
    );

    it('keeps a pinned model on a removed key when another held key routes it', () => {
      expect(setup('byok', ['openrouter'])({ pinned: DIRECT_OPUS })).toEqual({
        kind: 'resolved',
        model: ROUTED_OPUS,
        resolution: { requested: DIRECT_OPUS, resolved: ROUTED_OPUS },
      });
    });

    it('re-routes a stored model silently when its vendor id is no longer priced', () => {
      expect(
        setup('byok', ['anthropic', 'openrouter'], undefined, {
          rows: unpriced(DIRECT_SONNET),
        })({ preferredModel: DIRECT_SONNET })
      ).toEqual({
        kind: 'resolved',
        model: ROUTED_SONNET,
        resolution: { requested: DIRECT_SONNET, resolved: ROUTED_SONNET },
      });
    });

    it('still falls back visibly when no route of the model is servable', () => {
      expect(
        setup('byok', ['openrouter'], undefined, {
          rows: unpriced(ROUTED_OPUS),
        })({ pinned: DIRECT_OPUS })
      ).toEqual({
        kind: 'resolved',
        model: ROUTED_SONNET,
        resolution: {
          requested: DIRECT_OPUS,
          resolved: ROUTED_SONNET,
          fallback: {
            reason: 'key_removed',
            from: DIRECT_OPUS,
            to: ROUTED_SONNET,
          },
        },
      });
    });

    it('keeps a pinned model on a removed key over any index route of it, not only an intent candidate', () => {
      expect(
        setup('byok', ['openrouter'])({ pinned: 'openai:gpt-6-sol' })
      ).toEqual({
        kind: 'resolved',
        model: 'openrouter:openai/gpt-6-sol',
        resolution: {
          requested: 'openai:gpt-6-sol',
          resolved: 'openrouter:openai/gpt-6-sol',
        },
      });
    });

    it('falls back visibly from an id the index does not list', () => {
      expect(setup('byok', ['openrouter'])({ pinned: UNLISTED })).toEqual({
        kind: 'resolved',
        model: ROUTED_SONNET,
        resolution: {
          requested: UNLISTED,
          resolved: ROUTED_SONNET,
          fallback: {
            reason: 'key_removed',
            from: UNLISTED,
            to: ROUTED_SONNET,
          },
        },
      });
    });

    it.each([
      ['a pro SKU', 'openai:gpt-5.6-sol', 'openrouter:openai/gpt-5.6-sol-pro'],
      [
        'a batch variant',
        'google:gemini-3.5-flash',
        'openrouter:google/gemini-3.5-flash:batch',
      ],
    ])(
      'never moves a pin onto %s of the same canonical model',
      (_, pinned, sku) => {
        const choice = setup('byok', ['openrouter'])({ pinned });
        expect(choice).toMatchObject({
          kind: 'resolved',
          resolution: { fallback: { reason: 'key_removed', from: pinned } },
        });
        expect(choice).not.toMatchObject({ model: sku });
      }
    );

    it('never moves a pinned platform-billed route onto the caller key', () => {
      const platformHaiku = 'openrouter:anthropic/claude-haiku-4.5';
      expect(
        setup('byok', ['anthropic'], undefined, {
          platformIntents: { ...PLATFORM_INTENTS, fast: platformHaiku },
        })({ pinned: platformHaiku })
      ).toEqual({
        kind: 'unavailable',
        reason: 'not_in_tier',
        suggestedModel: DIRECT_SONNET,
      });
    });

    it('never moves a pinned key-billed model onto a platform route of it', () => {
      const platformHaiku = 'openrouter:anthropic/claude-haiku-4.5';
      expect(
        setup('free', [], undefined, {
          platformIntents: { ...PLATFORM_INTENTS, fast: platformHaiku },
        })({ pinned: 'anthropic:claude-haiku-4-5' })
      ).toEqual({
        kind: 'unavailable',
        reason: 'key_removed',
        suggestedModel: PLATFORM_INTENTS.balanced,
      });
    });
  });

  it('refuses with no_route when a byok caller has no servable intent', () => {
    expect(
      setup('byok', ['google'], undefined, {
        rows: MODEL_INDEX_SNAPSHOT.filter((row) => row.provider !== 'google'),
      })({})
    ).toEqual({
      kind: 'unavailable',
      reason: 'no_route',
      suggestedModel: null,
    });
  });
});
