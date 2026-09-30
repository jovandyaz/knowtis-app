import { describe, expect, it } from 'vitest';

import type { ByokProvider, ModelIntent } from '@knowtis/shared-types';

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
const RETIRED = 'anthropic:claude-sonnet-3';
const offered = (id: string): OfferedModel => ({
  id,
  label: id,
  descriptionKey: '',
  tier: 'open',
});
const OFFERED = [
  ...Object.values(PLATFORM_INTENTS),
  'openrouter:z-ai/glm-5.2',
  'anthropic:claude-haiku-4-5',
  'anthropic:claude-sonnet-5',
  'anthropic:claude-opus-5',
].map(offered);

function setup(
  tier: 'free' | 'byok',
  held: readonly ByokProvider[] = [],
  isSupported: (id: string) => boolean = (id) => id !== RETIRED
) {
  const facts: ModelFacts = {
    heldProviders: new Set(held),
    isSupported,
    isPlatformRoutable: (id) => id.startsWith('openrouter:'),
  };
  const catalog = tierCatalog({
    tier,
    scope: TIER_POLICIES[tier].catalog,
    heldProviders: held,
    platformIntents: PLATFORM_INTENTS,
    offered: OFFERED,
    isSupported: facts.isSupported,
    isPlatformRoutable: facts.isPlatformRoutable,
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

  it('refuses an explicit model outside the tier and suggests the default', () => {
    expect(setup('free')({ explicit: 'openrouter:z-ai/glm-5.2' })).toEqual({
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
    ).toMatchObject({ kind: 'resolved', model: 'anthropic:claude-opus-5' });
  });

  it('ignores a platform pick stored by a byok caller and serves their key intent', () => {
    expect(
      setup('byok', ['anthropic'])({
        preferredModel: 'openrouter:z-ai/glm-5.2',
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

  it('falls back visibly from a pinned platform model outside the free tier', () => {
    expect(setup('free')({ pinned: 'openrouter:z-ai/glm-5.2' })).toMatchObject({
      kind: 'resolved',
      model: PLATFORM_INTENTS.balanced,
      resolution: {
        fallback: { reason: 'not_in_tier', from: 'openrouter:z-ai/glm-5.2' },
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

  it('refuses with no_route when a byok caller has no servable intent', () => {
    const noGoogleRoute = (id: string) => !id.startsWith('google:');
    expect(setup('byok', ['google'], noGoogleRoute)({})).toEqual({
      kind: 'unavailable',
      reason: 'no_route',
      suggestedModel: null,
    });
  });
});
