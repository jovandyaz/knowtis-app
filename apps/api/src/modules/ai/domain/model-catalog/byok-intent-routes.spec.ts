import { describe, expect, it } from 'vitest';

import { MODEL_INTENTS, type ByokProvider } from '@knowtis/shared-types';

import { supportedAtSnapshot } from '../../testing/supported-at-snapshot';
import {
  BYOK_INTENT_CANDIDATES,
  canonicalOf,
  effectivePrimary,
  routeIntent,
} from './byok-intent-routes';

function route(
  intent: 'fast' | 'balanced' | 'powerful',
  held: readonly ByokProvider[],
  isSupported: (id: string) => boolean = supportedAtSnapshot
) {
  return routeIntent(
    BYOK_INTENT_CANDIDATES[intent],
    held,
    effectivePrimary(held, null),
    isSupported
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

  it('routes every intent over OpenRouter for an OpenRouter-only user', () => {
    expect(
      MODEL_INTENTS.map((intent) => route(intent, ['openrouter']))
    ).toEqual([
      {
        modelId: 'openrouter:anthropic/claude-haiku-4.5',
        label: 'Haiku 4.5',
        substituted: false,
      },
      {
        modelId: 'openrouter:anthropic/claude-sonnet-5',
        label: 'Sonnet 5',
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
        (id) => supportedAtSnapshot(id) && !id.startsWith('google:')
      )
    ).toEqual({
      modelId: 'anthropic:claude-haiku-4-5',
      label: 'Haiku 4.5',
      substituted: true,
    });
  });

  it('returns null when no held key reaches any candidate', () => {
    expect(route('fast', [])).toBeNull();
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
    expect(
      route(
        'balanced',
        ['openrouter'],
        (id) => id !== 'openrouter:anthropic/claude-sonnet-5'
      )?.modelId
    ).toBe('openrouter:openai/gpt-5.6-terra');
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
