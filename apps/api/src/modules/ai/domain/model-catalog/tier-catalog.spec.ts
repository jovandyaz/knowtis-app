import { describe, expect, it } from 'vitest';

import { MODEL_INDEX_SNAPSHOT, type IndexedModel } from '@knowtis/ai-gateway';
import {
  MODEL_INTENTS,
  type ByokProvider,
  type ModelIntent,
} from '@knowtis/shared-types';

import {
  createSnapshotIndex,
  SNAPSHOT_DATE,
} from '../../testing/snapshot-index';
import { supportedAtSnapshot } from '../../testing/supported-at-snapshot';
import { TIER_POLICIES } from '../execution-context/tier-policy';
import {
  resolveByokSelectors,
  type ByokResolutions,
} from './byok-intent-routes';
import {
  findInCatalog,
  intentDescriptionKey,
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
const SNAPSHOT = createSnapshotIndex().catalog();
const BYOK = resolveByokSelectors(MODEL_INDEX_SNAPSHOT, SNAPSHOT_DATE);
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
    storedPrimary?: ByokProvider | null;
    platformIntents?: Record<ModelIntent, string>;
    offered?: readonly OfferedModel[];
    isSupported?: (id: string) => boolean;
    isPlatformRoutable?: (id: string) => boolean;
    indexRow?: (id: string) => IndexedModel | undefined;
    byok?: ByokResolutions;
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
    indexRow: options.indexRow ?? ((id) => SNAPSHOT.get(id)),
    byok: options.byok ?? BYOK,
  });
}

function resolvedWith(
  replace: (row: IndexedModel) => IndexedModel | null
): ByokResolutions {
  return resolveByokSelectors(
    MODEL_INDEX_SNAPSHOT.flatMap((row) => replace(row) ?? []),
    SNAPSHOT_DATE
  );
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
        descriptionKey: 'aiModels.class.fast',
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

  it('labels an unoffered intent model with its index name and the intent copy', () => {
    expect(
      findInCatalog(
        catalogFor('free', { offered: [] }),
        PLATFORM_INTENTS.balanced
      )
    ).toEqual({
      model: {
        id: PLATFORM_INTENTS.balanced,
        label: 'DeepSeek: DeepSeek V3.2',
        descriptionKey: 'aiModels.class.balanced',
        tier: 'balanced',
      },
      servesIntent: 'balanced',
    });
  });

  it('reads an unoffered intent model’s ladder from its index row', () => {
    const glm = 'openrouter:z-ai/glm-5.2';
    expect(
      findInCatalog(
        catalogFor('free', {
          offered: [],
          platformIntents: { ...PLATFORM_INTENTS, powerful: glm },
        }),
        glm
      )?.model
    ).toEqual({
      id: glm,
      label: 'Z.ai: GLM 5.2',
      descriptionKey: 'aiModels.class.powerful',
      tier: 'powerful',
      reasoning: { levels: ['high', 'xhigh'], mandatory: false },
    });
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

  it('lists a key holder the offered models its keys serve, then every route they reach, billed to the key', () => {
    const catalog = catalogFor('byok', { heldProviders: ['anthropic'] });
    expect(
      catalog.models.map(({ model, servesIntent }) => [model.id, servesIntent])
    ).toEqual([
      ['anthropic:claude-haiku-4-5', 'fast'],
      ['anthropic:claude-sonnet-5', undefined],
      ['anthropic:claude-opus-5', undefined],
      ['anthropic:claude-sonnet-5-5', 'balanced'],
      ['anthropic:claude-opus-5-5', 'powerful'],
    ]);
    expect(catalog.billing).toBe('key');
  });

  it('lists every route an OpenRouter key reaches after its offered rows, the winners serving the intents', () => {
    const catalog = catalogFor('byok', { heldProviders: ['openrouter'] });
    expect(
      catalog.models.map(({ model, servesIntent }) => [model.id, servesIntent])
    ).toEqual([
      ['openrouter:minimax/minimax-m2.5', undefined],
      ['openrouter:deepseek/deepseek-v3.2', undefined],
      ['openrouter:moonshotai/kimi-k2.5', undefined],
      ['openrouter:z-ai/glm-5.2', undefined],
      ['openrouter:anthropic/claude-haiku-4.5', 'fast'],
      ['openrouter:openai/gpt-6-luna', undefined],
      ['openrouter:google/gemini-3.5-flash-lite', undefined],
      ['openrouter:anthropic/claude-sonnet-5.5', 'balanced'],
      ['openrouter:openai/gpt-5.6-terra', undefined],
      ['openrouter:google/gemini-3.8-flash', undefined],
      ['openrouter:anthropic/claude-opus-5.5', 'powerful'],
      ['openrouter:openai/gpt-6.1-sol', undefined],
      ['openrouter:google/gemini-3.1-pro-preview', undefined],
    ]);
  });

  it('labels a route with its index name, the intent copy and its own index ladder', () => {
    const catalog = catalogFor('byok', { heldProviders: ['openrouter'] });
    expect(
      findInCatalog(catalog, 'openrouter:anthropic/claude-sonnet-5.5')
    ).toEqual({
      model: {
        id: 'openrouter:anthropic/claude-sonnet-5.5',
        label: 'Anthropic: Claude Sonnet 5.5',
        descriptionKey: 'aiModels.class.balanced',
        tier: 'balanced',
        reasoning: {
          levels: ['low', 'medium', 'high', 'xhigh', 'max'],
          mandatory: true,
        },
      },
      servesIntent: 'balanced',
    });
    expect(
      findInCatalog(catalog, 'openrouter:openai/gpt-5.6-terra')?.model
    ).toMatchObject({
      label: 'OpenAI: GPT-5.6 Terra',
      descriptionKey: 'aiModels.class.balanced',
      tier: 'balanced',
    });
  });

  it('lists each route of several keys once, in the order the primary provider reaches them', () => {
    const catalog = catalogFor('byok', {
      heldProviders: ['anthropic', 'openrouter'],
      storedPrimary: 'openrouter',
      offered: [],
    });
    expect(ids(catalog)).toEqual([
      'openrouter:anthropic/claude-haiku-4.5',
      'anthropic:claude-haiku-4-5',
      'openrouter:openai/gpt-6-luna',
      'openrouter:google/gemini-3.5-flash-lite',
      'openrouter:anthropic/claude-sonnet-5.5',
      'anthropic:claude-sonnet-5-5',
      'openrouter:openai/gpt-5.6-terra',
      'openrouter:google/gemini-3.8-flash',
      'openrouter:anthropic/claude-opus-5.5',
      'anthropic:claude-opus-5-5',
      'openrouter:openai/gpt-6.1-sol',
      'openrouter:google/gemini-3.1-pro-preview',
    ]);
  });

  it('lists an intent winner from its index row when the catalog drops the offered row of the same id', () => {
    const haiku = 'anthropic:claude-haiku-4-5';
    const catalog = catalogFor('byok', {
      heldProviders: ['anthropic'],
      isSupported: (id) => id !== haiku && supportedAtSnapshot(id),
    });
    expect(intentModelOf(catalog, 'fast')).toBe(haiku);
    expect(findInCatalog(catalog, haiku)).toEqual({
      model: {
        id: haiku,
        label: 'Claude Haiku 4.5 (latest)',
        descriptionKey: 'aiModels.class.fast',
        tier: 'fast',
      },
      servesIntent: 'fast',
    });
  });

  it('lists a route two intents reach once, under the first intent', () => {
    const catalog = catalogFor('byok', {
      heldProviders: ['anthropic'],
      offered: [],
      byok: { ...BYOK, balanced: BYOK.fast },
    });
    expect(
      catalog.models.filter(
        ({ model }) => model.id === 'anthropic:claude-haiku-4-5'
      )
    ).toEqual([
      expect.objectContaining({
        model: expect.objectContaining({ tier: 'fast' }),
      }),
    ]);
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
      byok: resolvedWith((row) => (row.provider === 'openai' ? null : row)),
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

  it('reads a route’s ladder from its own index row, not from a sibling route', () => {
    const routed = 'openrouter:anthropic/claude-opus-5.5';
    const catalog = catalogFor('byok', {
      heldProviders: ['anthropic', 'openrouter'],
      byok: resolvedWith((row) =>
        row.id === routed
          ? {
              ...row,
              reasoning: { levels: ['xhigh', 'high'], mandatory: true },
            }
          : row
      ),
    });
    expect(findInCatalog(catalog, routed)?.model.reasoning).toEqual({
      levels: ['high', 'xhigh'],
      mandatory: true,
    });
    expect(
      findInCatalog(catalog, 'anthropic:claude-opus-5-5')?.model.reasoning
    ).toEqual({
      levels: ['low', 'medium', 'high', 'xhigh', 'max'],
      mandatory: true,
    });
  });

  it('gives a route with no index ladder no effort control', () => {
    const routed = 'openrouter:anthropic/claude-opus-5.5';
    const catalog = catalogFor('byok', {
      heldProviders: ['openrouter'],
      byok: resolvedWith((row) =>
        row.id === routed ? { ...row, reasoning: null } : row
      ),
    });
    const scoped = findInCatalog(catalog, routed);
    expect(scoped?.servesIntent).toBe('powerful');
    expect(scoped && 'reasoning' in scoped.model).toBe(false);
  });
});

describe('intentDescriptionKey', () => {
  it('names the per-intent picker copy', () => {
    expect(MODEL_INTENTS.map(intentDescriptionKey)).toEqual([
      'aiModels.class.fast',
      'aiModels.class.balanced',
      'aiModels.class.powerful',
    ]);
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
      preferredModel: 'anthropic:claude-sonnet-5-5',
      preferredIntent: null,
    };
    expect(
      findInCatalog(catalog, 'anthropic:claude-sonnet-5-5')?.servesIntent
    ).toBe('balanced');
    expect(servedPreference(catalog, stored)).toBe(stored);
  });

  it('leaves a patch that names no model untouched', () => {
    const patch = { preferredIntent: 'fast' as const, ghostTextEnabled: true };
    expect(servedPreference(catalogFor('free'), patch)).toBe(patch);
  });
});
