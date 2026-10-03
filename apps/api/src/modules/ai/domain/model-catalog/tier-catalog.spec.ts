import { describe, expect, it } from 'vitest';

import {
  MODEL_INTENTS,
  type ByokProvider,
  type ModelIntent,
} from '@knowtis/shared-types';

import { supportedAtSnapshot } from '../../testing/supported-at-snapshot';
import { TIER_POLICIES } from '../execution-context/tier-policy';
import {
  findInCatalog,
  intentModelOf,
  servedPreference,
  tierCatalog,
  type OfferedModel,
} from './tier-catalog';

const PLATFORM_INTENTS: Record<ModelIntent, string> = {
  fast: 'openrouter:minimax/minimax-m2.5',
  balanced: 'openrouter:deepseek/deepseek-v3.2',
  powerful: 'openrouter:moonshotai/kimi-k2.5',
};
const PLATFORM_INTENT_IDS: readonly string[] = Object.values(PLATFORM_INTENTS);
const SONNET_LADDER = {
  levels: ['low', 'medium', 'high'],
  mandatory: false,
} as const;
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
  offered('anthropic:claude-sonnet-5', 'balanced', {
    reasoning: SONNET_LADDER,
  }),
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
    storedPrimary?: ByokProvider | null;
    platformIntents?: Record<ModelIntent, string>;
    offered?: readonly OfferedModel[];
    isSupported?: (id: string) => boolean;
    isPlatformRoutable?: (id: string) => boolean;
  } = {}
) {
  return tierCatalog({
    tier,
    scope: TIER_POLICIES[tier].catalog,
    heldProviders: options.heldProviders ?? [],
    storedPrimary: options.storedPrimary ?? null,
    platformIntents: options.platformIntents ?? PLATFORM_INTENTS,
    offered: options.offered ?? OFFERED,
    isSupported: options.isSupported ?? supportedAtSnapshot,
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
      isSupported: (id) => id === demoted || supportedAtSnapshot(id),
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

  it('marks a platform intent unavailable when the catalog stops supporting its model', () => {
    const catalog = catalogFor('free', {
      isSupported: (id) =>
        supportedAtSnapshot(id) && id !== PLATFORM_INTENTS.fast,
    });
    expect(intentModelOf(catalog, 'fast')).toBeNull();
    expect(ids(catalog)).not.toContain(PLATFORM_INTENTS.fast);
    expect(catalog.intents).toContainEqual({
      intent: 'fast',
      available: false,
      reason: 'no_route',
    });
  });

  it('lists a key holder only the models its keys serve, billed to the key', () => {
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
        'openrouter:anthropic/claude-sonnet-5',
        'openrouter:anthropic/claude-opus-5',
      ])
    );
    expect(
      findInCatalog(catalog, 'openrouter:anthropic/claude-sonnet-5')
    ).toEqual({
      model: {
        id: 'openrouter:anthropic/claude-sonnet-5',
        label: 'Sonnet 5',
        descriptionKey: '',
        tier: 'balanced',
        reasoning: SONNET_LADDER,
      },
      servesIntent: 'balanced',
    });
  });

  it('lists the platform intent models an OpenRouter key serves as plain models, never as intent picks', () => {
    const catalog = catalogFor('byok', { heldProviders: ['openrouter'] });
    expect(
      catalog.models
        .filter((scoped) => PLATFORM_INTENT_IDS.includes(scoped.model.id))
        .map((scoped) => [scoped.model.id, scoped.servesIntent])
    ).toEqual(PLATFORM_INTENT_IDS.map((id) => [id, undefined]));
  });

  it('never falls back to a platform model when no held key serves an intent', () => {
    const catalog = catalogFor('byok', {
      heldProviders: ['openai'],
      isSupported: (id) => supportedAtSnapshot(id) && !id.startsWith('openai:'),
    });
    expect(catalog.intents).toEqual(
      MODEL_INTENTS.map((intent) => ({
        intent,
        available: false,
        reason: 'no_route',
      }))
    );
    expect(
      ids(catalog).filter((id) => PLATFORM_INTENT_IDS.includes(id))
    ).toEqual([]);
    expect(catalog.billing).toBe('key');
  });

  it('lets the stored primary provider pick the route of the winning candidate', () => {
    const held: ByokProvider[] = ['anthropic', 'openrouter'];
    expect(
      intentModelOf(
        catalogFor('byok', {
          heldProviders: held,
          storedPrimary: 'openrouter',
        }),
        'fast'
      )
    ).toBe('openrouter:anthropic/claude-haiku-4.5');
    expect(
      intentModelOf(catalogFor('byok', { heldProviders: held }), 'fast')
    ).toBe('anthropic:claude-haiku-4-5');
  });

  it('gives an OpenRouter route of a curated model that model’s effort ladder', () => {
    const catalog = catalogFor('byok', { heldProviders: ['openrouter'] });
    expect(
      findInCatalog(catalog, 'openrouter:anthropic/claude-opus-5')?.model
        .reasoning
    ).toEqual(OPUS_LADDER);
  });
});

describe('servedPreference', () => {
  it('reads a platform model pick as the intent it serves, ahead of a stored intent', () => {
    expect(
      servedPreference(catalogFor('free'), {
        preferredModel: PLATFORM_INTENTS.fast,
        preferredIntent: 'powerful',
        ghostTextEnabled: false,
      })
    ).toEqual({
      preferredModel: null,
      preferredIntent: 'fast',
      ghostTextEnabled: false,
    });
  });

  it('leaves a pick the platform catalog does not serve untouched', () => {
    const stored = {
      preferredModel: 'openrouter:z-ai/glm-5.2',
      preferredIntent: 'powerful' as const,
    };
    expect(servedPreference(catalogFor('free'), stored)).toBe(stored);
  });

  it('keeps a key-billed pick a model even when it serves an intent', () => {
    const catalog = catalogFor('byok', { heldProviders: ['anthropic'] });
    const stored = {
      preferredModel: 'anthropic:claude-sonnet-5',
      preferredIntent: null,
    };
    expect(
      findInCatalog(catalog, 'anthropic:claude-sonnet-5')?.servesIntent
    ).toBe('balanced');
    expect(servedPreference(catalog, stored)).toBe(stored);
  });

  it('leaves a patch that names no model untouched', () => {
    const patch = { preferredIntent: 'fast' as const, ghostTextEnabled: true };
    expect(servedPreference(catalogFor('free'), patch)).toBe(patch);
  });
});
