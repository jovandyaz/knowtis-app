import { describe, expect, it } from 'vitest';

import { AIModel } from './ai-model.vo';

describe('AIModel', () => {
  it('should create a valid default model', () => {
    const result = AIModel.create('anthropic:claude-sonnet-4-5-20250929');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.value).toBe('anthropic:claude-sonnet-4-5-20250929');
      expect(result.value.isFast).toBe(false);
    }
  });

  it('should create a valid fast model', () => {
    const result = AIModel.create('anthropic:claude-haiku-4-5-20251001');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isFast).toBe(true);
    }
  });

  it('should fail for an invalid model', () => {
    const result = AIModel.create('gpt-nonexistent');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('AI_INVALID_MODEL');
    }
  });

  it('should fail for empty string', () => {
    const result = AIModel.create('');
    expect(result.isErr()).toBe(true);
  });
});
