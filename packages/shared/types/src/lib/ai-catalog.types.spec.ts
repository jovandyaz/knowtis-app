import { describe, expect, it } from 'vitest';

import {
  isModelFallbackReason,
  MODEL_FALLBACK_REASONS,
  MODEL_UNAVAILABLE_REASONS,
} from './ai-catalog.types';

describe('model unavailable reasons', () => {
  it('falls back for a retired model, a removed key, a model outside the tier or an intent with no route', () => {
    expect(MODEL_FALLBACK_REASONS).toEqual([
      'model_retired',
      'key_removed',
      'not_in_tier',
      'intent_unavailable',
    ]);
  });

  it('refuses for those reasons and for a tier with no route at all', () => {
    expect(MODEL_UNAVAILABLE_REASONS).toEqual([
      'model_retired',
      'key_removed',
      'not_in_tier',
      'intent_unavailable',
      'no_route',
    ]);
  });
});

describe('isModelFallbackReason', () => {
  it.each(MODEL_FALLBACK_REASONS)('knows %s', (reason) => {
    expect(isModelFallbackReason(reason)).toBe(true);
  });

  it.each(['no_route', 'model_deprecated', '', null, undefined])(
    'does not know %s',
    (value) => {
      expect(isModelFallbackReason(value)).toBe(false);
    }
  );
});
