import { describe, expect, it } from 'vitest';

import {
  REASONING_EFFORTS,
  type ModelReasoning,
  type ReasoningEffort,
} from '@knowtis/shared-types';

import {
  clampEffort,
  FREE_BOOST_CEILING,
  freeLevels,
  nearestEffort,
  TOOL_FREE_REASONING_EFFORT,
  toolFreeEffort,
} from './effort-policy';

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

describe('nearestEffort', () => {
  it('keeps a level the ladder lists', () => {
    expect(nearestEffort('medium', ['low', 'medium', 'high'])).toBe('medium');
  });

  it('raises a level below the ladder to its lowest level', () => {
    expect(nearestEffort('medium', ['xhigh', 'high'])).toBe('high');
  });

  it('lowers a level above the ladder to its highest level', () => {
    expect(nearestEffort('high', ['medium', 'low'])).toBe('medium');
  });

  it('settles a tie on the lower level', () => {
    expect(nearestEffort('medium', ['high', 'low'])).toBe('low');
  });

  it('is undefined for an empty ladder', () => {
    expect(nearestEffort('medium', [])).toBeUndefined();
  });
});

describe('TOOL_FREE_REASONING_EFFORT', () => {
  it('is the lowest effort level, so lowering a turn to it never raises one', () => {
    expect(TOOL_FREE_REASONING_EFFORT).toBe(REASONING_EFFORTS[0]);
  });
});

describe('toolFreeEffort', () => {
  it('lowers to the tool-free level when the ladder lists it', () => {
    expect(toolFreeEffort(['high', 'low', 'max'])).toBe(
      TOOL_FREE_REASONING_EFFORT
    );
  });

  it('runs at the lowest listed level when the ladder lacks the tool-free level', () => {
    expect(toolFreeEffort(['xhigh', 'high'])).toBe('high');
  });

  it('keeps the tool-free level for an unknown ladder', () => {
    expect(toolFreeEffort(undefined)).toBe(TOOL_FREE_REASONING_EFFORT);
    expect(toolFreeEffort([])).toBe(TOOL_FREE_REASONING_EFFORT);
  });
});
