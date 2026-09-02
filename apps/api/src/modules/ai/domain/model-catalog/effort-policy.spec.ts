import { describe, expect, it } from 'vitest';

import type { ModelReasoning, ReasoningEffort } from '@knowtis/shared-types';

import { clampEffort, FREE_BOOST_CEILING } from './effort-policy';

function reasoning(levels: readonly ReasoningEffort[]): ModelReasoning {
  return { levels, mandatory: false };
}

describe('clampEffort', () => {
  it('caps the free boost at high', () => {
    expect(FREE_BOOST_CEILING).toBe('high');
  });

  describe('byok audience against declared [low, high, max]', () => {
    const declared = reasoning(['low', 'high', 'max']);
    const matrix: readonly [ReasoningEffort, ReasoningEffort | null][] = [
      ['low', 'low'],
      ['medium', null],
      ['high', 'high'],
      ['xhigh', null],
      ['max', 'max'],
    ];

    it.each(matrix)('requesting %s resolves to %s', (requested, expected) => {
      expect(clampEffort(requested, declared, 'byok')).toBe(expected);
    });
  });

  describe('free audience', () => {
    it('clamps to the highest declared level at or below the ceiling regardless of the request', () => {
      const declared = reasoning(['low', 'medium', 'high', 'xhigh']);
      expect(clampEffort('high', declared, 'free')).toBe('high');
      expect(clampEffort('max', declared, 'free')).toBe('high');
      expect(clampEffort('low', declared, 'free')).toBe('high');
    });

    it('clamps below the ceiling when the model declares nothing at it', () => {
      expect(clampEffort('high', reasoning(['low', 'medium']), 'free')).toBe(
        'medium'
      );
    });

    it('returns null when every declared level exceeds the ceiling', () => {
      expect(clampEffort('high', reasoning(['xhigh', 'max']), 'free')).toBe(
        null
      );
    });
  });

  describe('undeclared reasoning', () => {
    it('returns null for a null declaration', () => {
      expect(clampEffort('high', null, 'byok')).toBe(null);
      expect(clampEffort('high', null, 'free')).toBe(null);
    });

    it('returns null for an undefined declaration', () => {
      expect(clampEffort('high', undefined, 'byok')).toBe(null);
    });

    it('returns null for an empty level list', () => {
      expect(clampEffort('high', reasoning([]), 'free')).toBe(null);
    });
  });
});
