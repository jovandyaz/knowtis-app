import { describe, expect, it } from 'vitest';

import { MODEL_INDEX_SNAPSHOT, type IndexedModel } from '@knowtis/ai-gateway';
import {
  BYOK_PROVIDERS,
  MODEL_INTENTS,
  type ByokProvider,
  type ModelIntent,
} from '@knowtis/shared-types';

import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import {
  effectivePrimary,
  entitledRoutes,
  reachableRoutes,
  resolveByokSelectors,
  routeIntent,
  type ByokResolutions,
  type SelectorRoutes,
} from './byok-intent-routes';
import {
  BYOK_SELECTORS,
  rankSelector,
  resolveByokIntent,
} from './model-selectors';

const RESOLUTIONS = resolveByokSelectors(MODEL_INDEX_SNAPSHOT, SNAPSHOT_DATE);
const WITHIN_RETIREMENT_WINDOW = '2026-10-20';
const ENTITLED_TO_ALL = () => true;

function newestRoutes(
  intent: ModelIntent,
  resolutions: ByokResolutions = RESOLUTIONS
): SelectorRoutes[] {
  return entitledRoutes(resolutions[intent], ENTITLED_TO_ALL);
}

function route(
  intent: ModelIntent,
  held: readonly ByokProvider[],
  resolutions: ByokResolutions = RESOLUTIONS
) {
  const chosen = routeIntent(
    newestRoutes(intent, resolutions),
    held,
    effectivePrimary(held, null)
  );
  return chosen && { id: chosen.row.id, substituted: chosen.substituted };
}

function reachableIds(
  intent: ModelIntent,
  held: readonly ByokProvider[],
  primary: ByokProvider | null
): string[] {
  return reachableRoutes(newestRoutes(intent), held, primary).map(
    (row) => row.id
  );
}

describe('effectivePrimary', () => {
  it('is the stored provider while the caller still holds its key', () => {
    expect(effectivePrimary(['anthropic', 'openai'], 'openai')).toBe('openai');
  });

  it('falls back to the first key added when the stored provider has no key', () => {
    expect(effectivePrimary(['anthropic', 'openai'], 'google')).toBe(
      'anthropic'
    );
  });

  it('is the first key added when nothing is stored', () => {
    expect(effectivePrimary(['openrouter', 'anthropic'], null)).toBe(
      'openrouter'
    );
  });

  it('is null without keys', () => {
    expect(effectivePrimary([], 'openai')).toBeNull();
  });
});

describe('resolveByokSelectors', () => {
  it('keeps one entry per BYOK selector, in selector order', () => {
    for (const intent of MODEL_INTENTS) {
      expect(
        RESOLUTIONS[intent].map((candidate) => candidate.selector)
      ).toEqual(BYOK_SELECTORS[intent]);
    }
  });

  it("ranks each selector only on its author's direct provider and OpenRouter, the newest row first", () => {
    expect(
      MODEL_INTENTS.map((intent) =>
        RESOLUTIONS[intent].map((candidate) =>
          Object.fromEntries(
            Object.entries(candidate.ranked).map(([provider, rows]) => [
              provider,
              rows?.[0]?.id,
            ])
          )
        )
      )
    ).toEqual([
      [
        {
          anthropic: 'anthropic:claude-haiku-4-5',
          openrouter: 'openrouter:anthropic/claude-haiku-4.5',
        },
        {
          openai: 'openai:gpt-6-luna',
          openrouter: 'openrouter:openai/gpt-6-luna',
        },
        {
          google: 'google:gemini-3.5-flash-lite',
          openrouter: 'openrouter:google/gemini-3.5-flash-lite',
        },
      ],
      [
        {
          anthropic: 'anthropic:claude-sonnet-5-5',
          openrouter: 'openrouter:anthropic/claude-sonnet-5.5',
        },
        {
          openai: 'openai:gpt-5.6-terra',
          openrouter: 'openrouter:openai/gpt-5.6-terra',
        },
        {
          google: 'google:gemini-3.8-flash',
          openrouter: 'openrouter:google/gemini-3.8-flash',
        },
      ],
      [
        {
          anthropic: 'anthropic:claude-opus-5-5',
          openrouter: 'openrouter:anthropic/claude-opus-5.5',
        },
        {
          openai: 'openai:gpt-6.1-sol',
          openrouter: 'openrouter:openai/gpt-6.1-sol',
        },
        {
          google: 'google:gemini-3.1-pro-preview',
          openrouter: 'openrouter:google/gemini-3.1-pro-preview',
        },
      ],
    ]);
  });

  it('leaves out a provider on which the selector ranks nothing', () => {
    const withoutGoogle = resolveByokSelectors(
      MODEL_INDEX_SNAPSHOT.filter((row) => row.provider !== 'google'),
      SNAPSHOT_DATE
    );
    expect(Object.keys(withoutGoogle.powerful[2]?.ranked ?? {})).toEqual([
      'openrouter',
    ]);
  });

  it('ranks at the given time, so a row inside its retirement window drops out', () => {
    const rows: IndexedModel[] = MODEL_INDEX_SNAPSHOT.map((row) =>
      row.id === 'anthropic:claude-sonnet-5-5'
        ? { ...row, retiresAt: WITHIN_RETIREMENT_WINDOW }
        : row
    );
    expect(
      resolveByokSelectors(rows, SNAPSHOT_DATE).balanced[0]?.ranked
        .anthropic?.[0]?.id
    ).toBe('anthropic:claude-sonnet-5');
  });

  it('keeps every ranked row of a provider, as the selector ranks it there', () => {
    for (const intent of MODEL_INTENTS) {
      for (const { selector, ranked } of RESOLUTIONS[intent]) {
        for (const provider of BYOK_PROVIDERS) {
          expect(ranked[provider] ?? []).toEqual(
            rankSelector(
              selector,
              provider,
              MODEL_INDEX_SNAPSHOT,
              SNAPSHOT_DATE
            )
          );
        }
      }
    }
  });

  it('never ranks one row under two intents', () => {
    const ids = MODEL_INTENTS.flatMap((intent) =>
      RESOLUTIONS[intent].flatMap((candidate) =>
        Object.values(candidate.ranked).flatMap(
          (rows) => rows?.map((row) => row.id) ?? []
        )
      )
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('entitledRoutes', () => {
  const [byAnthropic, byOpenai, byGoogle] = RESOLUTIONS.balanced;

  it("routes each provider to the selector's newest row when every row is entitled", () => {
    expect(entitledRoutes(RESOLUTIONS.balanced, ENTITLED_TO_ALL)).toStrictEqual(
      RESOLUTIONS.balanced.map(({ selector, ranked }) => ({
        selector,
        routes: Object.fromEntries(
          Object.entries(ranked).map(([provider, rows]) => [
            provider,
            rows?.[0],
          ])
        ),
      }))
    );
  });

  it("keeps a provider's newest entitled row when its newest is not", () => {
    const [newest, older] = byAnthropic.ranked.anthropic ?? [];

    const [routed] = entitledRoutes(
      RESOLUTIONS.balanced,
      (row) => row !== newest
    );

    expect(older).toBeDefined();
    expect(routed?.routes.anthropic).toBe(older);
  });

  it('keeps the candidate order and drops a provider only when none of its ranked rows is entitled', () => {
    const dropped = new Set([
      ...(byAnthropic.ranked.anthropic ?? []),
      ...Object.values(byOpenai.ranked).flat(),
    ]);

    expect(
      entitledRoutes(RESOLUTIONS.balanced, (row) => !dropped.has(row))
    ).toStrictEqual([
      {
        selector: byAnthropic.selector,
        routes: { openrouter: byAnthropic.ranked.openrouter?.[0] },
      },
      { selector: byOpenai.selector, routes: {} },
      {
        selector: byGoogle.selector,
        routes: {
          google: byGoogle.ranked.google?.[0],
          openrouter: byGoogle.ranked.openrouter?.[0],
        },
      },
    ]);
  });
});

describe('reachableRoutes', () => {
  it('lists every candidate a lone OpenRouter key reaches, in selector order', () => {
    expect(reachableIds('balanced', ['openrouter'], 'openrouter')).toEqual([
      'openrouter:anthropic/claude-sonnet-5.5',
      'openrouter:openai/gpt-5.6-terra',
      'openrouter:google/gemini-3.8-flash',
    ]);
  });

  it("orders each candidate's routes primary first, then direct keys in add order, OpenRouter last", () => {
    expect(
      reachableIds('fast', ['openrouter', 'google', 'anthropic'], 'anthropic')
    ).toEqual([
      'anthropic:claude-haiku-4-5',
      'openrouter:anthropic/claude-haiku-4.5',
      'openrouter:openai/gpt-6-luna',
      'google:gemini-3.5-flash-lite',
      'openrouter:google/gemini-3.5-flash-lite',
    ]);
    expect(
      reachableIds('fast', ['anthropic', 'openrouter'], 'openrouter')
    ).toEqual([
      'openrouter:anthropic/claude-haiku-4.5',
      'anthropic:claude-haiku-4-5',
      'openrouter:openai/gpt-6-luna',
      'openrouter:google/gemini-3.5-flash-lite',
    ]);
  });

  it('reaches nothing without keys', () => {
    expect(reachableIds('fast', [], null)).toEqual([]);
  });
});

describe('routeIntent', () => {
  it('routes every intent over the direct key of an Anthropic-only user', () => {
    expect(
      MODEL_INTENTS.map((intent) => route(intent, ['anthropic'])?.id)
    ).toEqual([
      'anthropic:claude-haiku-4-5',
      'anthropic:claude-sonnet-5-5',
      'anthropic:claude-opus-5-5',
    ]);
  });

  it('routes every intent over OpenRouter for an OpenRouter-only user', () => {
    expect(
      MODEL_INTENTS.map((intent) => route(intent, ['openrouter']))
    ).toEqual([
      { id: 'openrouter:anthropic/claude-haiku-4.5', substituted: false },
      { id: 'openrouter:anthropic/claude-sonnet-5.5', substituted: false },
      { id: 'openrouter:anthropic/claude-opus-5.5', substituted: false },
    ]);
  });

  it('routes every intent over the direct key of a Google-only user', () => {
    expect(
      MODEL_INTENTS.map((intent) => route(intent, ['google'])?.id)
    ).toEqual([
      'google:gemini-3.5-flash-lite',
      'google:gemini-3.8-flash',
      'google:gemini-3.1-pro-preview',
    ]);
  });

  it('lets the first servable candidate win even when the primary provider cannot serve it', () => {
    expect(route('balanced', ['openai', 'anthropic'])).toEqual({
      id: 'anthropic:claude-sonnet-5-5',
      substituted: true,
    });
  });

  it('lets the primary provider choose between the routes of one candidate', () => {
    expect(route('fast', ['openrouter', 'anthropic'])).toEqual({
      id: 'openrouter:anthropic/claude-haiku-4.5',
      substituted: false,
    });
    expect(route('fast', ['anthropic', 'openrouter'])).toEqual({
      id: 'anthropic:claude-haiku-4-5',
      substituted: false,
    });
  });

  it('prefers the direct vendor key over OpenRouter when the primary has no route', () => {
    const withoutGoogle = resolveByokSelectors(
      MODEL_INDEX_SNAPSHOT.filter((row) => row.provider !== 'google'),
      SNAPSHOT_DATE
    );
    expect(
      route('fast', ['google', 'openrouter', 'anthropic'], withoutGoogle)
    ).toEqual({ id: 'anthropic:claude-haiku-4-5', substituted: true });
  });

  it('returns null when no held key reaches any candidate', () => {
    expect(route('fast', [])).toBeNull();
  });

  it("serves a lone key exactly that provider's BYOK resolution of each intent", () => {
    const servedProviders = new Set<ByokProvider>();
    for (const provider of BYOK_PROVIDERS) {
      for (const intent of MODEL_INTENTS) {
        const expected = resolveByokIntent(
          intent,
          provider,
          MODEL_INDEX_SNAPSHOT,
          SNAPSHOT_DATE
        );
        expect(
          routeIntent(newestRoutes(intent), [provider], provider)?.row ?? null
        ).toBe(expected);
        if (expected !== null) {
          servedProviders.add(provider);
        }
      }
    }
    expect([...servedProviders]).toEqual([...BYOK_PROVIDERS]);
  });
});
