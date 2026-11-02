import { describe, expect, it } from 'vitest';

import { deriveCanonical } from './indexed-model';

describe('deriveCanonical', () => {
  it('turns dots between digits into dashes', () => {
    expect(deriveCanonical('anthropic/claude-sonnet-5.5')).toBe(
      'anthropic/claude-sonnet-5-5'
    );
    expect(deriveCanonical('z-ai/glm-5.3')).toBe('z-ai/glm-5-3');
  });

  it('drops the variant suffix', () => {
    expect(deriveCanonical('openai/gpt-5.6-sol-pro:batch')).toBe(
      'openai/gpt-5-6-sol-pro'
    );
  });

  it('lowercases and keeps dots that are not between digits', () => {
    expect(deriveCanonical('Qwen/Qwen3.5-Max.preview')).toBe(
      'qwen/qwen3-5-max.preview'
    );
  });
});
