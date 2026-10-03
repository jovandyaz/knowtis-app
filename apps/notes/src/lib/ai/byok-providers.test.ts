import { describe, expect, it } from 'vitest';

import { providerOfModel } from './byok-providers';

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
