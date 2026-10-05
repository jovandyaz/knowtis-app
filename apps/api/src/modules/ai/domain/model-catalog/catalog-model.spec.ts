import { describe, expect, it } from 'vitest';

import { authorOf, slugOf } from './catalog-model';

describe('slugOf', () => {
  it.each([
    ['anthropic:claude-sonnet-5', 'claude-sonnet-5'],
    ['openrouter:anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5'],
    ['openrouter:openai/gpt-5.6-sol:batch', 'openai/gpt-5.6-sol:batch'],
  ])('strips the provider of %s', (modelId, slug) => {
    expect(slugOf(modelId)).toBe(slug);
  });
});

describe('authorOf', () => {
  it.each([
    ['anthropic:claude-sonnet-5', 'anthropic'],
    ['openrouter:anthropic/claude-sonnet-5', 'anthropic'],
    ['openrouter:z-ai/glm-5.3:batch', 'z-ai'],
  ])('reads the author of %s', (modelId, author) => {
    expect(authorOf(modelId)).toBe(author);
  });

  it('has no author for an OpenRouter slug without a vendor', () => {
    expect(authorOf('openrouter:auto')).toBeNull();
  });

  it('reads an id without a provider separator whole', () => {
    expect(authorOf('anthropicx')).toBe('anthropicx');
  });
});
