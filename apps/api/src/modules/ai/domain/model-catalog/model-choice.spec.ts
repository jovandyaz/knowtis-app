import { describe, expect, it } from 'vitest';

import type {
  AccessTier,
  ByokProvider,
  ModelIntent,
} from '@knowtis/shared-types';

import { TIER_POLICIES } from '../execution-context/tier-policy';
import {
  chooseModel,
  type ModelFacts,
  type ModelRequest,
} from './model-choice';
import { tierCatalog, type OfferedModel } from './tier-catalog';

const PLATFORM_INTENTS: Record<ModelIntent, string> = {
  fast: 'openrouter:minimax/minimax-m2.5',
  balanced: 'openrouter:deepseek/deepseek-v3.2',
  powerful: 'openrouter:moonshotai/kimi-k2.5',
};
const PLATFORM_INTENT_IDS: readonly string[] = Object.values(PLATFORM_INTENTS);
const OPEN_MODEL = 'openrouter:z-ai/glm-5.2';
const OPEN_TIER_IDS: readonly string[] = [...PLATFORM_INTENT_IDS, OPEN_MODEL];
const RETIRED = 'anthropic:claude-sonnet-3';
const platformRoutes = (id: string) => id.startsWith('openrouter:');
const offered = (id: string): OfferedModel => ({
  id,
  label: id,
  descriptionKey: '',
  tier: 'open',
});
const OFFERED = [
  ...OPEN_TIER_IDS,
  'anthropic:claude-haiku-4-5',
  'anthropic:claude-sonnet-5',
  'anthropic:claude-opus-5',
].map(offered);

function setup(
  tier: AccessTier,
  held: readonly ByokProvider[] = [],
  isSupported: (id: string) => boolean = (id) => id !== RETIRED,
  options: {
    storedPrimary?: ByokProvider | null;
    platformIntents?: Record<ModelIntent, string>;
  } = {}
) {
  const platformIntents = options.platformIntents ?? PLATFORM_INTENTS;
  const platformIntentIds: readonly string[] = Object.values(platformIntents);
  const facts: ModelFacts = {
    heldProviders: new Set(held),
    isSupported,
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

  it('serves the default intent when the stored intent has no route', () => {
    const fastRetired = (id: string) => id !== PLATFORM_INTENTS.fast;
    expect(setup('free', [], fastRetired)({ preferredIntent: 'fast' })).toEqual(
      {
        kind: 'resolved',
        model: PLATFORM_INTENTS.balanced,
        resolution: { requested: null, resolved: PLATFORM_INTENTS.balanced },
      }
    );
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

  it('honours a key-billed preference inside the byok catalog', () => {
    expect(
      setup('byok', ['anthropic'])({
        preferredModel: 'anthropic:claude-opus-5',
      })
    ).toEqual({
      kind: 'resolved',
      model: 'anthropic:claude-opus-5',
      resolution: {
        requested: 'anthropic:claude-opus-5',
        resolved: 'anthropic:claude-opus-5',
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
      model: 'anthropic:claude-sonnet-5',
      resolution: { requested: null, resolved: 'anthropic:claude-sonnet-5' },
    });
  });

  it('falls back visibly from a retired key model to the key intent model', () => {
    expect(setup('byok', ['anthropic'])({ preferredModel: RETIRED })).toEqual({
      kind: 'resolved',
      model: 'anthropic:claude-sonnet-5',
      resolution: {
        requested: RETIRED,
        resolved: 'anthropic:claude-sonnet-5',
        fallback: {
          reason: 'model_retired',
          from: RETIRED,
          to: 'anthropic:claude-sonnet-5',
        },
      },
    });
  });

  it.each(['preferredModel', 'pinned'] as const)(
    'falls back from a retired model on a held OpenRouter key given as %s',
    (field) => {
      const retiredRoute = 'openrouter:mistralai/mistral-large-2';
      const keyIntent = 'openrouter:anthropic/claude-sonnet-5';
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
    const keyIntent = 'openrouter:anthropic/claude-sonnet-5';
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
    expect(
      setup('byok', ['openai'])({ pinned: 'anthropic:claude-opus-5' })
    ).toEqual({
      kind: 'resolved',
      model: 'openai:gpt-5.6-terra',
      resolution: {
        requested: 'anthropic:claude-opus-5',
        resolved: 'openai:gpt-5.6-terra',
        fallback: {
          reason: 'key_removed',
          from: 'anthropic:claude-opus-5',
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
    expect(setup('free')({ pinned: 'anthropic:claude-opus-5' })).toEqual({
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
      suggestedModel: 'anthropic:claude-sonnet-5',
    });
  });

  describe('a pick of a canonical model served over another held key', () => {
    const DIRECT_SONNET = 'anthropic:claude-sonnet-5';
    const ROUTED_SONNET = 'openrouter:anthropic/claude-sonnet-5';

    it.each(['preferredModel', 'pinned'] as const)(
      'runs the route the primary provider picks, with no fallback, given as %s',
      (field) => {
        expect(
          setup('byok', ['anthropic', 'openrouter'], undefined, {
            storedPrimary: 'anthropic',
          })({ [field]: ROUTED_SONNET })
        ).toEqual({
          kind: 'resolved',
          model: DIRECT_SONNET,
          resolution: { requested: ROUTED_SONNET, resolved: DIRECT_SONNET },
        });
      }
    );

    it('keeps a pinned model on a removed key when another held key routes it', () => {
      expect(
        setup('byok', ['openrouter'])({ pinned: 'anthropic:claude-opus-5' })
      ).toEqual({
        kind: 'resolved',
        model: 'openrouter:anthropic/claude-opus-5',
        resolution: {
          requested: 'anthropic:claude-opus-5',
          resolved: 'openrouter:anthropic/claude-opus-5',
        },
      });
    });

    it('re-routes a stored model silently when its vendor id is no longer priced', () => {
      const directSonnetUnpriced = (id: string) => id !== DIRECT_SONNET;
      expect(
        setup(
          'byok',
          ['anthropic', 'openrouter'],
          directSonnetUnpriced
        )({ preferredModel: DIRECT_SONNET })
      ).toEqual({
        kind: 'resolved',
        model: ROUTED_SONNET,
        resolution: { requested: DIRECT_SONNET, resolved: ROUTED_SONNET },
      });
    });

    it('still falls back visibly when no route of the model is servable', () => {
      const routedOpusUnpriced = (id: string) =>
        id !== 'openrouter:anthropic/claude-opus-5';
      expect(
        setup(
          'byok',
          ['openrouter'],
          routedOpusUnpriced
        )({ pinned: 'anthropic:claude-opus-5' })
      ).toEqual({
        kind: 'resolved',
        model: ROUTED_SONNET,
        resolution: {
          requested: 'anthropic:claude-opus-5',
          resolved: ROUTED_SONNET,
          fallback: {
            reason: 'key_removed',
            from: 'anthropic:claude-opus-5',
            to: ROUTED_SONNET,
          },
        },
      });
    });

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
    const noGoogleRoute = (id: string) => !id.startsWith('google:');
    expect(setup('byok', ['google'], noGoogleRoute)({})).toEqual({
      kind: 'unavailable',
      reason: 'no_route',
      suggestedModel: null,
    });
  });
});
