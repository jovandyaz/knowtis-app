import { describe, expect, it } from 'vitest';

import { createTestCatalog } from '../../testing/create-test-catalog';
import { AIModel } from './ai-model.vo';

const catalog = createTestCatalog();

describe('AIModel', () => {
  it('should create a valid default model', () => {
    const result = AIModel.create(
      'anthropic:claude-sonnet-4-20250514',
      catalog
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.value).toBe('anthropic:claude-sonnet-4-20250514');
      expect(result.value.isFast).toBe(false);
    }
  });

  it('should create a valid fast model', () => {
    const result = AIModel.create(
      'anthropic:claude-haiku-4-5-20251001',
      catalog
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isFast).toBe(true);
    }
  });

  it('should fail for an invalid model', () => {
    const result = AIModel.create('gpt-nonexistent', catalog);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('AI_INVALID_MODEL');
    }
  });

  it('should accept google:gemini-2.0-flash', () => {
    const result = AIModel.create('google:gemini-2.0-flash', catalog);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().provider).toBe('google');
    expect(result._unsafeUnwrap().isFast).toBe(true);
  });

  it('should accept google:gemini-2.5-pro', () => {
    const result = AIModel.create('google:gemini-2.5-pro', catalog);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().provider).toBe('google');
    expect(result._unsafeUnwrap().isFast).toBe(false);
  });

  it('should fail for unsupported google model', () => {
    const result = AIModel.create('google:gemini-nonexistent', catalog);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('AI_INVALID_MODEL');
    }
  });

  it('should fail for unsupported model whisper-1', () => {
    const result = AIModel.create('openai:whisper-1', catalog);
    expect(result.isErr()).toBe(true);
  });

  it('should fail for empty string', () => {
    const result = AIModel.create('', catalog);
    expect(result.isErr()).toBe(true);
  });
});
