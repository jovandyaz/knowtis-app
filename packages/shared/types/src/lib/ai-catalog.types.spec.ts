import { describe, expect, it } from 'vitest';

import {
  MODEL_FALLBACK_REASONS,
  MODEL_UNAVAILABLE_REASONS,
} from './ai-catalog.types';

describe('model unavailable reasons', () => {
  it('falls back only for a retired model, a removed key or a model outside the tier', () => {
    expect(MODEL_FALLBACK_REASONS).toEqual([
      'model_retired',
      'key_removed',
      'not_in_tier',
    ]);
  });

  it('refuses for those three reasons and for a tier with no route at all', () => {
    expect(MODEL_UNAVAILABLE_REASONS).toEqual([
      'model_retired',
      'key_removed',
      'not_in_tier',
      'no_route',
    ]);
  });
});
