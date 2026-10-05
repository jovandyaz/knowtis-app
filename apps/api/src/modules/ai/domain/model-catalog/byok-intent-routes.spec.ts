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
} from './byok-intent-routes';
import { BYOK_SELECTORS, resolveByokIntent } from './model-selectors';

const RESOLUTIONS = resolveByokSelectors(MODEL_INDEX_SNAPSHOT, SNAPSHOT_DATE);
const WITHIN_RETIREMENT_WINDOW = '2026-10-20';

function route(
  intent: ModelIntent,
  held: readonly ByokProvider[],
  resolutions: ByokResolutions = RESOLUTIONS
) {
  const chosen = routeIntent(
    resolutions[intent],
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
  return reachableRoutes(RESOLUTIONS[intent], held, primary).map(
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

  it("resolves each selector only on its author's direct provider and OpenRouter", () => {
    expect(
      MODEL_INTENTS.map((intent) =>
        RESOLUTIONS[intent].map((candidate) =>
          Object.fromEntries(
            Object.entries(candidate.routes).map(([provider, row]) => [
              provider,
              row?.id,
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

  it('leaves out a provider on which the selector resolves nothing', () => {
    const withoutGoogle = resolveByokSelectors(
      MODEL_INDEX_SNAPSHOT.filter((row) => row.provider !== 'google'),
      SNAPSHOT_DATE
    );
    expect(Object.keys(withoutGoogle.powerful[2]?.routes ?? {})).toEqual([
      'openrouter',
    ]);
  });

  it('resolves at the given time, so a row inside its retirement window drops out', () => {
    const rows: IndexedModel[] = MODEL_INDEX_SNAPSHOT.map((row) =>
      row.id === 'anthropic:claude-sonnet-5-5'
        ? { ...row, retiresAt: WITHIN_RETIREMENT_WINDOW }
        : row
    );
    expect(
      resolveByokSelectors(rows, SNAPSHOT_DATE).balanced[0]?.routes.anthropic
        ?.id
    ).toBe('anthropic:claude-sonnet-5');
  });

  it('never resolves one row for two intents', () => {
    const ids = MODEL_INTENTS.flatMap((intent) =>
      RESOLUTIONS[intent].flatMap((candidate) =>
        Object.values(candidate.routes).map((row) => row?.id)
      )
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('entitledRoutes', () => {
  it('keeps the candidate order and drops only the routes not entitled', () => {
    const [byAnthropic, byOpenai, byGoogle] = RESOLUTIONS.balanced;
    const dropped = new Set(
      [byAnthropic.routes.anthropic, ...Object.values(byOpenai.routes)].map(
        (row) => row?.id
      )
    );

    expect(
      entitledRoutes(RESOLUTIONS.balanced, (row) => !dropped.has(row.id))
    ).toEqual([
      {
        selector: byAnthropic.selector,
        routes: { openrouter: byAnthropic.routes.openrouter },
      },
      { selector: byOpenai.selector, routes: {} },
      byGoogle,
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
          routeIntent(RESOLUTIONS[intent], [provider], provider)?.row ?? null
        ).toBe(expected);
        if (expected !== null) {
          servedProviders.add(provider);
        }
      }
    }
    expect([...servedProviders]).toEqual([...BYOK_PROVIDERS]);
  });
});
