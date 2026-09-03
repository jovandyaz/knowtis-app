import { describe, expect, it } from 'vitest';

import type { ModelReasoning, ReasoningEffort } from '@knowtis/shared-types';

import { clampEffort, FREE_BOOST_CEILING, freeLevels } from './effort-policy';

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
    const declared = reasoning(['low', 'medium', 'high', 'xhigh']);

    it('honours a requested level the model declares at or below the ceiling', () => {
      expect(clampEffort('low', declared, 'free')).toBe('low');
      expect(clampEffort('medium', declared, 'free')).toBe('medium');
      expect(clampEffort('high', declared, 'free')).toBe('high');
    });

    it('lowers a request above the ceiling to the highest declared level within it', () => {
      expect(clampEffort('xhigh', declared, 'free')).toBe('high');
      expect(clampEffort('max', declared, 'free')).toBe('high');
    });

    it('lowers below the ceiling when the model declares nothing at it', () => {
      expect(clampEffort('max', reasoning(['low', 'medium']), 'free')).toBe(
        'medium'
      );
    });

    it('returns null for a level within the ceiling the model does not declare', () => {
      expect(clampEffort('medium', reasoning(['low', 'high']), 'free')).toBe(
        null
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

describe('freeLevels', () => {
  it('keeps the declared levels at or below the ceiling, in declared order', () => {
    expect(freeLevels(['max', 'high', 'low'])).toEqual(['high', 'low']);
  });

  it('is empty when nothing is within the ceiling', () => {
    expect(freeLevels(['xhigh', 'max'])).toEqual([]);
  });
});
