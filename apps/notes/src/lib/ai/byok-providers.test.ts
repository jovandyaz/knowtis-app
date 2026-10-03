import { describe, expect, it } from 'vitest';

import type { ByokProvider, ProviderKeyInfo } from '@knowtis/shared-types';

import {
  effectivePrimaryProvider,
  keysInAddedOrder,
  providerOfModel,
} from './byok-providers';

describe('providerOfModel', () => {
  it.each([
    ['anthropic:claude-haiku-4-5', 'anthropic'],
    ['openrouter:anthropic/claude-haiku-4.5', 'openrouter'],
    ['google:gemini-3.7-flash', 'google'],
    ['openai:gpt-6', 'openai'],
  ])('reads %s as served by the %s key', (modelId, provider) => {
    expect(providerOfModel(modelId)).toBe(provider);
  });

  it.each(['z-ai:glm-5.3', 'openai', ':gpt-6', ''])(
    'reads %j as served by no BYOK key',
    (modelId) => {
      expect(providerOfModel(modelId)).toBeNull();
    }
  );
});

function key(provider: ByokProvider, createdAt: string): ProviderKeyInfo {
  return { provider, keyPrefix: 'sk-***', lastUsedAt: null, createdAt };
}

const OLDER = '2026-01-01T00:00:00.000Z';
const NEWER = '2026-03-01T00:00:00.000Z';

describe('keysInAddedOrder', () => {
  it('lists the oldest key first and breaks a tie by provider, as the server routes them', () => {
    expect(
      keysInAddedOrder([
        key('openrouter', NEWER),
        key('openai', OLDER),
        key('anthropic', OLDER),
      ]).map((k) => k.provider)
    ).toEqual(['anthropic', 'openai', 'openrouter']);
  });
});

describe('effectivePrimaryProvider', () => {
  const keys = [key('openrouter', NEWER), key('google', OLDER)];

  it('answers the stored primary while its key is held', () => {
    expect(
      effectivePrimaryProvider({ primaryProvider: 'openrouter' }, keys)
    ).toBe('openrouter');
  });

  it.each([null, 'openai' as const])(
    'answers the first key added when the stored primary is %s',
    (primaryProvider) => {
      expect(effectivePrimaryProvider({ primaryProvider }, keys)).toBe(
        'google'
      );
    }
  );

  it('answers the first key added while preferences are unknown', () => {
    expect(effectivePrimaryProvider(undefined, keys)).toBe('google');
  });

  it('answers null without keys', () => {
    expect(
      effectivePrimaryProvider({ primaryProvider: 'openai' }, [])
    ).toBeNull();
  });
});
