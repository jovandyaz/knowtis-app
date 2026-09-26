import { describe, expect, it } from 'vitest';

import { AIAction, SUPPORTED_AI_ACTIONS } from './ai-action.vo';

describe('AIAction', () => {
  it.each(SUPPORTED_AI_ACTIONS)('should create valid action: %s', (action) => {
    const result = AIAction.create(action);
    expect(result.isOk()).toBe(true);
  });

  it('should fail for an invalid action', () => {
    const result = AIAction.create('fly');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('AI_INVALID_ACTION');
    }
  });

  it('should fail for empty string', () => {
    const result = AIAction.create('');
    expect(result.isErr()).toBe(true);
  });
});
