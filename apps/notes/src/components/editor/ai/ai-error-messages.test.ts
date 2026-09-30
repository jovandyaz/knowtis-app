import { describe, expect, it } from 'vitest';

import { aiErrorMessageKey } from './ai-error-messages';

describe('aiErrorMessageKey', () => {
  it('maps a transient overloaded provider error to its own message', () => {
    expect(aiErrorMessageKey({ code: 'AI_PROVIDER_OVERLOADED' })).toBe(
      'ai.errors.providerOverloaded'
    );
  });

  it('maps a generic provider error to the provider message', () => {
    expect(aiErrorMessageKey({ code: 'AI_PROVIDER_ERROR' })).toBe(
      'ai.errors.provider'
    );
  });

  it('maps an empty-completion error to its own message', () => {
    expect(aiErrorMessageKey({ code: 'AI_EMPTY_COMPLETION' })).toBe(
      'ai.errors.emptyCompletion'
    );
  });

  it('names the verified-email gate the copilot share hits instead of a generic failure', () => {
    expect(aiErrorMessageKey({ code: 'AGENT_EMAIL_NOT_VERIFIED' })).toBe(
      'ai.errors.emailNotVerified'
    );
  });

  it('maps an unavailable model to its own copy', () => {
    expect(aiErrorMessageKey({ code: 'AI_MODEL_UNAVAILABLE' })).toBe(
      'ai.errors.modelUnavailable'
    );
  });

  it.each([
    ['auth', 'ai.errors.byokKeyFailed.auth'],
    ['credit', 'ai.errors.byokKeyFailed.credit'],
    ['permission', 'ai.errors.byokKeyFailed.permission'],
  ])('names what the provider refused about a BYOK key (%s)', (kind, key) => {
    expect(aiErrorMessageKey({ code: 'AI_BYOK_KEY_FAILED', kind })).toBe(key);
  });

  it('falls back to the generic message for a refused key of unknown kind', () => {
    expect(aiErrorMessageKey({ code: 'AI_BYOK_KEY_FAILED' })).toBe(
      'ai.errors.generic'
    );
    expect(
      aiErrorMessageKey({ code: 'AI_BYOK_KEY_FAILED', kind: 'mystery' })
    ).toBe('ai.errors.generic');
  });

  it('falls back to the generic message without an error', () => {
    expect(aiErrorMessageKey(null)).toBe('ai.errors.generic');
  });

  it('falls back to the generic message for an unknown code', () => {
    expect(aiErrorMessageKey({ code: 'SOMETHING_ELSE' })).toBe(
      'ai.errors.generic'
    );
  });
});
