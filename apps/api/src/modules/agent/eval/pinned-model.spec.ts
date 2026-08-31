import { describe, expect, it } from 'vitest';

import { assertPinnedModelServed } from './pinned-model';

const PINNED = 'anthropic:claude-sonnet-5';

describe('assertPinnedModelServed', () => {
  it('accepts a turn served by the pinned model', () => {
    expect(() =>
      assertPinnedModelServed({ servedModel: PINNED, error: null }, PINNED)
    ).not.toThrow();
  });

  it('rejects a turn the fallback chain served instead', () => {
    expect(() =>
      assertPinnedModelServed(
        {
          servedModel: 'openrouter:deepseek/deepseek-v4-flash-0731',
          error: null,
        },
        PINNED
      )
    ).toThrow(/served by 'openrouter:deepseek\/deepseek-v4-flash-0731'/);
  });

  it('rejects a successful turn that names no served model', () => {
    expect(() =>
      assertPinnedModelServed({ servedModel: null, error: null }, PINNED)
    ).toThrow(/reported no served model/);
  });

  it('defers to the error of a failed turn that never reached a model', () => {
    expect(() =>
      assertPinnedModelServed(
        {
          servedModel: null,
          error: { code: 'AI_TIMEOUT', message: 'timed out' },
        },
        PINNED
      )
    ).not.toThrow();
  });
});
