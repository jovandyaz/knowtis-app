import { describe, expect, it } from 'vitest';

import type { ByokProvider, ModelIntent } from '@knowtis/shared-types';

import { pricedAtSnapshot } from '../../testing/priced-at-snapshot';
import { TIER_POLICIES } from '../execution-context/tier-policy';
import {
  findInCatalog,
  intentModelOf,
  tierCatalog,
  type OfferedModel,
} from './tier-catalog';

const PLATFORM_INTENTS: Record<ModelIntent, string> = {
  fast: 'openrouter:minimax/minimax-m2.5',
  balanced: 'openrouter:deepseek/deepseek-v3.2',
  powerful: 'openrouter:moonshotai/kimi-k2.5',
};
const OPUS_LADDER = {
  levels: ['low', 'medium', 'high', 'xhigh', 'max'],
  mandatory: false,
} as const;

const offered = (
  id: string,
  tier: OfferedModel['tier'],
  extra: Partial<OfferedModel> = {}
): OfferedModel => ({ id, label: id, descriptionKey: '', tier, ...extra });

const OFFERED: OfferedModel[] = [
  offered('anthropic:claude-haiku-4-5', 'fast'),
  offered('anthropic:claude-sonnet-5', 'balanced'),
  offered('anthropic:claude-opus-5', 'powerful', { reasoning: OPUS_LADDER }),
  offered('openrouter:minimax/minimax-m2.5', 'open'),
  offered('openrouter:deepseek/deepseek-v3.2', 'open'),
  offered('openrouter:moonshotai/kimi-k2.5', 'open'),
  offered('openrouter:z-ai/glm-5.2', 'open'),
];

function catalogFor(
  tier: 'anonymous' | 'free' | 'byok',
  options: {
    heldProviders?: readonly ByokProvider[];
    platformIntents?: Record<ModelIntent, string>;
    offered?: readonly OfferedModel[];
    isPlatformRoutable?: (id: string) => boolean;
  } = {}
) {
  return tierCatalog({
    tier,
    scope: TIER_POLICIES[tier].catalog,
    heldProviders: options.heldProviders ?? [],
    platformIntents: options.platformIntents ?? PLATFORM_INTENTS,
    offered: options.offered ?? OFFERED,
    isSupported: pricedAtSnapshot,
    isPlatformRoutable:
      options.isPlatformRoutable ?? ((id) => id.startsWith('openrouter:')),
  });
}

const ids = (catalog: ReturnType<typeof catalogFor>) =>
  catalog.models.map((scoped) => scoped.model.id);

describe('tierCatalog', () => {
  it('gives an anonymous caller only the default intent model', () => {
    const catalog = catalogFor('anonymous');
    expect(ids(catalog)).toEqual([PLATFORM_INTENTS.balanced]);
    expect(catalog.intents).toEqual([
      {
        intent: 'balanced',
        available: true,
        modelId: PLATFORM_INTENTS.balanced,
        substituted: false,
      },
    ]);
    expect(catalog.billing).toBe('platform');
  });

  it('gives a free caller exactly the three platform intent models', () => {
    const catalog = catalogFor('free');
    expect(ids(catalog)).toEqual([
      PLATFORM_INTENTS.fast,
      PLATFORM_INTENTS.balanced,
      PLATFORM_INTENTS.powerful,
    ]);
    expect(findInCatalog(catalog, 'openrouter:z-ai/glm-5.2')).toBeUndefined();
  });

  it('keeps a configured intent model servable after its promotion was withdrawn', () => {
    const demoted = 'openrouter:vendor/demoted-model';
    const catalog = catalogFor('free', {
      platformIntents: { ...PLATFORM_INTENTS, fast: demoted },
    });
    expect(findInCatalog(catalog, demoted)).toEqual({
      model: {
        id: demoted,
        label: 'vendor/demoted-model',
        descriptionKey: '',
        tier: 'fast',
      },
      servesIntent: 'fast',
    });
    expect(intentModelOf(catalog, 'fast')).toBe(demoted);
  });

  it('lists every configured intent from a cold promoted cache', () => {
    const catalog = catalogFor('free', { offered: [] });
    expect(ids(catalog)).toEqual([
      PLATFORM_INTENTS.fast,
      PLATFORM_INTENTS.balanced,
      PLATFORM_INTENTS.powerful,
    ]);
  });

  it('marks a platform intent unavailable when the server cannot route its model', () => {
    const catalog = catalogFor('free', {
      isPlatformRoutable: (id) => id !== PLATFORM_INTENTS.powerful,
    });
    expect(intentModelOf(catalog, 'powerful')).toBeNull();
    expect(catalog.intents).toContainEqual({
      intent: 'powerful',
      available: false,
      reason: 'no_route',
    });
  });

  it('never lists a platform intent model to a key holder', () => {
    const catalog = catalogFor('byok', { heldProviders: ['anthropic'] });
    expect(ids(catalog)).toEqual([
      'anthropic:claude-haiku-4-5',
      'anthropic:claude-sonnet-5',
      'anthropic:claude-opus-5',
    ]);
    expect(catalog.billing).toBe('key');
    expect(
      catalog.models.find((m) => m.model.id === 'anthropic:claude-sonnet-5')
        ?.servesIntent
    ).toBe('balanced');
  });

  it('adds routed intent models the curated list does not carry for an OpenRouter key', () => {
    const catalog = catalogFor('byok', { heldProviders: ['openrouter'] });
    expect(ids(catalog)).toEqual(
      expect.arrayContaining([
        'openrouter:z-ai/glm-5.2',
        'openrouter:anthropic/claude-haiku-4.5',
        'openrouter:anthropic/claude-sonnet-4.6',
        'openrouter:anthropic/claude-opus-5',
      ])
    );
    expect(
      findInCatalog(catalog, 'openrouter:anthropic/claude-sonnet-4.6')
    ).toEqual({
      model: {
        id: 'openrouter:anthropic/claude-sonnet-4.6',
        label: 'Sonnet 4.6',
        descriptionKey: '',
        tier: 'balanced',
      },
      servesIntent: 'balanced',
    });
  });

  it('gives an OpenRouter route of a curated model that model’s effort ladder', () => {
    const catalog = catalogFor('byok', { heldProviders: ['openrouter'] });
    expect(
      findInCatalog(catalog, 'openrouter:anthropic/claude-opus-5')?.model
        .reasoning
    ).toEqual(OPUS_LADDER);
  });
});
