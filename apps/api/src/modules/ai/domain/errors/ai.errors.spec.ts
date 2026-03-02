import { describe, expect, it } from 'vitest';

import { AIErrorCodes, AIErrors } from './ai.errors';

describe('AIErrors', () => {
  it('should create a rate limit error without leaking userId', () => {
    const error = AIErrors.rateLimitExceeded();
    expect(error.code).toBe(AIErrorCodes.RATE_LIMIT_EXCEEDED);
    expect(error.message).not.toContain('user');
    expect(error.message).toContain('limit exceeded');
  });

  it('should create a provider error', () => {
    const error = AIErrors.providerError('Connection timeout');
    expect(error.code).toBe(AIErrorCodes.PROVIDER_ERROR);
    expect(error.message).toContain('Connection timeout');
  });

  it('should create a feature disabled error', () => {
    const error = AIErrors.featureDisabled();
    expect(error.code).toBe(AIErrorCodes.FEATURE_DISABLED);
  });

  it('should create an invalid model error', () => {
    const error = AIErrors.invalidModel('gpt-nonexistent');
    expect(error.code).toBe(AIErrorCodes.INVALID_MODEL);
    expect(error.message).toContain('gpt-nonexistent');
  });

  it('should create an invalid action error', () => {
    const error = AIErrors.invalidAction('fly');
    expect(error.code).toBe(AIErrorCodes.INVALID_ACTION);
    expect(error.message).toContain('fly');
  });
});
