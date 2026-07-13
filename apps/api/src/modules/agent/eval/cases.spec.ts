import { describe, expect, it } from 'vitest';

import { COPILOT_EVAL_CASES } from './cases';

const FIXTURE_NAMES = new Set([
  'recent',
  'topic',
  'empty',
  'injection',
  'benign-es',
  'exfiltration',
]);

describe('COPILOT_EVAL_CASES', () => {
  it('defines the eight behavior cases', () => {
    expect(COPILOT_EVAL_CASES).toHaveLength(8);
  });

  it('every case has a message, a known fixtureSet, and at least one assertion', () => {
    for (const testCase of COPILOT_EVAL_CASES) {
      expect(typeof testCase.vars.message).toBe('string');
      expect(testCase.vars.message.length).toBeGreaterThan(0);
      expect(FIXTURE_NAMES.has(testCase.vars.fixtureSet)).toBe(true);
      expect(testCase.assert.length).toBeGreaterThan(0);
    }
  });

  it('has unique descriptions', () => {
    const descriptions = COPILOT_EVAL_CASES.map((c) => c.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});
