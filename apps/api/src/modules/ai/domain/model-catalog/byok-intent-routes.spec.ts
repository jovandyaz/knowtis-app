import { describe, expect, it } from 'vitest';

import { MODEL_INTENTS, type ByokProvider } from '@knowtis/shared-types';

import { pricedAtSnapshot } from '../../testing/priced-at-snapshot';
import {
  BYOK_INTENT_CANDIDATES,
  canonicalOf,
  effectivePrimary,
  routeIntent,
} from './byok-intent-routes';

function route(
  intent: 'fast' | 'balanced' | 'powerful',
  held: readonly ByokProvider[],
  isSupported: (id: string) => boolean = pricedAtSnapshot
) {
  return routeIntent(
    BYOK_INTENT_CANDIDATES[intent],
    held,
    effectivePrimary(held),
    isSupported
  );
}

describe('effectivePrimary', () => {
  it('is the first key added', () => {
    expect(effectivePrimary(['openrouter', 'anthropic'])).toBe('openrouter');
  });

  it('is null without keys', () => {
    expect(effectivePrimary([])).toBeNull();
  });
});

describe('routeIntent', () => {
  it('routes every intent over the direct key of an Anthropic-only user', () => {
    expect(
      MODEL_INTENTS.map((intent) => route(intent, ['anthropic'])?.modelId)
    ).toEqual([
      'anthropic:claude-haiku-4-5',
      'anthropic:claude-sonnet-5',
      'anthropic:claude-opus-5',
    ]);
  });

  it('routes every intent over OpenRouter for an OpenRouter-only user, skipping unpriced routes', () => {
    expect(
      MODEL_INTENTS.map((intent) => route(intent, ['openrouter']))
    ).toEqual([
      {
        modelId: 'openrouter:anthropic/claude-haiku-4.5',
        label: 'Haiku 4.5',
        substituted: false,
      },
      {
        modelId: 'openrouter:anthropic/claude-sonnet-4.6',
        label: 'Sonnet 4.6',
        substituted: false,
      },
      {
        modelId: 'openrouter:anthropic/claude-opus-5',
        label: 'Opus 5',
        substituted: false,
      },
    ]);
  });

  it('lets the first servable candidate win even when the primary provider cannot serve it', () => {
    expect(route('balanced', ['openai', 'anthropic'])).toEqual({
      modelId: 'anthropic:claude-sonnet-5',
      label: 'Sonnet 5',
      substituted: true,
    });
  });

  it('lets the primary provider choose between the routes of one candidate', () => {
    expect(route('fast', ['openrouter', 'anthropic'])).toEqual({
      modelId: 'openrouter:anthropic/claude-haiku-4.5',
      label: 'Haiku 4.5',
      substituted: false,
    });
    expect(route('fast', ['anthropic', 'openrouter'])).toEqual({
      modelId: 'anthropic:claude-haiku-4-5',
      label: 'Haiku 4.5',
      substituted: false,
    });
  });

  it('prefers the direct vendor key over OpenRouter when the primary has no route', () => {
    expect(
      route(
        'fast',
        ['google', 'openrouter', 'anthropic'],
        (id) => pricedAtSnapshot(id) && !id.startsWith('google:')
      )
    ).toEqual({
      modelId: 'anthropic:claude-haiku-4-5',
      label: 'Haiku 4.5',
      substituted: true,
    });
  });

  it('returns null when no held key reaches any candidate', () => {
    expect(route('fast', ['openai'], () => false)).toBeNull();
  });
});

describe('BYOK_INTENT_CANDIDATES', () => {
  it('never lets one model serve two intents', () => {
    const ids = MODEL_INTENTS.flatMap((intent) =>
      BYOK_INTENT_CANDIDATES[intent].flatMap((c) => Object.values(c.routes))
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keys every route by the provider that serves it', () => {
    for (const intent of MODEL_INTENTS) {
      for (const candidate of BYOK_INTENT_CANDIDATES[intent]) {
        for (const [provider, id] of Object.entries(candidate.routes)) {
          expect(id.startsWith(`${provider}:`)).toBe(true);
        }
      }
    }
  });

  it('declares an OpenRouter route for every candidate', () => {
    const withoutOpenRouter = MODEL_INTENTS.flatMap((intent) =>
      BYOK_INTENT_CANDIDATES[intent].filter((c) => !c.routes.openrouter)
    ).map((c) => c.slug);
    expect(withoutOpenRouter).toEqual([]);
  });

  it('gates each declared route on the catalog at runtime', () => {
    expect(route('balanced', ['openrouter'])?.modelId).toBe(
      'openrouter:anthropic/claude-sonnet-4.6'
    );
    expect(route('balanced', ['openrouter'], () => true)?.modelId).toBe(
      'openrouter:anthropic/claude-sonnet-5'
    );
  });
});

describe('canonicalOf', () => {
  it('finds the canonical model behind any of its routes', () => {
    expect(canonicalOf('openrouter:anthropic/claude-opus-5')?.slug).toBe(
      'anthropic/claude-opus-5'
    );
    expect(canonicalOf('openrouter:z-ai/glm-5.2')).toBeUndefined();
  });
});
