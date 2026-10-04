import { describe, expect, it } from 'vitest';

import { plainRouteCanonical } from './plain-route';

describe('plainRouteCanonical', () => {
  it.each([
    ['anthropic:claude-sonnet-5', 'anthropic/claude-sonnet-5'],
    ['openrouter:anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5'],
    ['openrouter:openai/gpt-5.6-sol', 'openai/gpt-5-6-sol'],
  ])('accepts %s as a route of %s', (id, canonical) => {
    expect(plainRouteCanonical(id, canonical)).toBe(canonical);
  });

  it.each([
    ['openrouter:openai/gpt-5.6-sol-pro', 'openai/gpt-5-6-sol'],
    ['openrouter:openai/gpt-5.6-sol:batch', 'openai/gpt-5-6-sol'],
    ['openai:gpt-5.6', 'openai/gpt-5-6-sol'],
    ['anthropic:claude-haiku-4-5-20251001', 'anthropic/claude-haiku-4-5'],
  ])('rejects %s as a different SKU of %s', (id, canonical) => {
    expect(plainRouteCanonical(id, canonical)).toBeUndefined();
  });

  it('yields nothing for an id the index does not list', () => {
    expect(plainRouteCanonical('anthropic:claude-unlisted-1', undefined)).toBe(
      undefined
    );
  });
});
