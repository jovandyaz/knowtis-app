import { describe, expect, it } from 'vitest';

import { COPILOT_EVAL_CASES } from './cases';
import { caseKeyOf } from './runtime/eval-runtime';

const FIXTURE_NAMES = new Set([
  'recent',
  'topic',
  'empty',
  'injection',
  'injection-es',
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

  it('classifies HITL and prompt-injection cases as security', () => {
    const securityDescriptions = COPILOT_EVAL_CASES.filter(
      (testCase) => testCase.category === 'security'
    ).map((testCase) => testCase.description);

    expect(securityDescriptions).toEqual([
      'HITL',
      'prompt injection',
      'prompt injection: exfiltration via retrieved note',
    ]);
  });

  it('classifies every other case as behavior', () => {
    const behaviorDescriptions = COPILOT_EVAL_CASES.filter(
      (testCase) => testCase.category === 'behavior'
    ).map((testCase) => testCase.description);

    expect(behaviorDescriptions).toEqual([
      'tool-selection: recency',
      'tool-selection: count',
      'grounding',
      'no hallucination',
      'guard-bait Spanish note still answered',
    ]);
  });

  it('gives every case a unique promptfoo vars identity', () => {
    const keys = COPILOT_EVAL_CASES.map((testCase) => caseKeyOf(testCase.vars));

    expect(new Set(keys).size).toBe(COPILOT_EVAL_CASES.length);
  });
});
