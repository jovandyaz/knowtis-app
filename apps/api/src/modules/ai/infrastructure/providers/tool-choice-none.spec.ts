import { describe, expect, it } from 'vitest';

import { honoursToolChoiceNone } from './tool-choice-none';

describe('honoursToolChoiceNone', () => {
  it.each([
    'anthropic:claude-sonnet-5',
    'anthropic:claude-haiku-4-5',
    'openrouter:deepseek/deepseek-v3.2',
    'openrouter:anthropic/claude-sonnet-5',
    'openrouter:openai/gpt-5.5',
  ])('is false for %s, whose tool-free call must go without tools', (model) => {
    expect(honoursToolChoiceNone(model)).toBe(false);
  });

  it.each(['openai:gpt-5.5', 'openai:gpt-4o-mini', 'google:gemini-2.0-flash'])(
    'is true for %s, which keeps its tools under a native none',
    (model) => {
      expect(honoursToolChoiceNone(model)).toBe(true);
    }
  );
});
