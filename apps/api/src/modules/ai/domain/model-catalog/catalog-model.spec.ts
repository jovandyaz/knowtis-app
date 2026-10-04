import { describe, expect, it } from 'vitest';

import { slugOf } from './catalog-model';

describe('slugOf', () => {
  it.each([
    ['anthropic:claude-sonnet-5', 'claude-sonnet-5'],
    ['openrouter:anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5'],
    ['openrouter:openai/gpt-5.6-sol:batch', 'openai/gpt-5.6-sol:batch'],
  ])('strips the provider of %s', (modelId, slug) => {
    expect(slugOf(modelId)).toBe(slug);
  });
});
