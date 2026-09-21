import { describe, expect, it } from 'vitest';

import { COPILOT_EVAL_CASES, selectCopilotCases } from './cases';
import { caseKeyOf } from './runtime/eval-runtime';

const FIXTURE_NAMES = new Set([
  'recent',
  'topic',
  'empty',
  'injection',
  'injection-es',
  'benign-es',
  'exfiltration',
  'fidelity',
]);

describe('COPILOT_EVAL_CASES', () => {
  it('defines the nine cases', () => {
    expect(COPILOT_EVAL_CASES).toHaveLength(9);
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
      'edit fidelity: an unrelated change preserves the rest',
    ]);
  });

  it('gives every case a unique promptfoo vars identity', () => {
    const keys = COPILOT_EVAL_CASES.map((testCase) => caseKeyOf(testCase.vars));

    expect(new Set(keys).size).toBe(COPILOT_EVAL_CASES.length);
  });

  describe('selectCopilotCases', () => {
    it('returns every case when no category is requested', () => {
      expect(selectCopilotCases(undefined)).toStrictEqual(COPILOT_EVAL_CASES);
      expect(selectCopilotCases('  ')).toStrictEqual(COPILOT_EVAL_CASES);
    });

    it('keeps only the requested category', () => {
      expect(
        selectCopilotCases('security').map((testCase) => testCase.description)
      ).toStrictEqual([
        'HITL',
        'prompt injection',
        'prompt injection: exfiltration via retrieved note',
      ]);
      expect(
        selectCopilotCases(' behavior ').map((testCase) => testCase.category)
      ).toStrictEqual(Array.from({ length: 6 }, () => 'behavior'));
    });

    it.each(['securty', 'Security'])(
      'rejects %s instead of running the wrong cases',
      (requested) => {
        expect(() => selectCopilotCases(requested)).toThrow(
          `AI_EVAL_CATEGORY '${requested}' is not one of: behavior, security`
        );
      }
    );
  });
});
