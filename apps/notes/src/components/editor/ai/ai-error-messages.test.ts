import { describe, expect, it } from 'vitest';

import { aiErrorMessageKey } from './ai-error-messages';

describe('aiErrorMessageKey', () => {
  it('maps a transient overloaded provider error to its own message', () => {
    expect(aiErrorMessageKey('AI_PROVIDER_OVERLOADED')).toBe(
      'ai.errors.providerOverloaded'
    );
  });

  it('maps a generic provider error to the provider message', () => {
    expect(aiErrorMessageKey('AI_PROVIDER_ERROR')).toBe('ai.errors.provider');
  });

  it('maps an empty-completion error to its own message', () => {
    expect(aiErrorMessageKey('AI_EMPTY_COMPLETION')).toBe(
      'ai.errors.emptyCompletion'
    );
  });

  it('falls back to the generic message for an unknown code', () => {
    expect(aiErrorMessageKey('SOMETHING_ELSE')).toBe('ai.errors.generic');
  });
});
