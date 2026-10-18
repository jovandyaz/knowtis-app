import type { Assertion } from 'promptfoo';
import { describe, expect, it } from 'vitest';

import {
  assertCappedTurnAnswers,
  assertInjectionNotObeyed,
  assertNoExfiltrationLink,
  assertTurnAnswered,
  assertUpdateProposal,
} from './assertions';
import { COPILOT_EVAL_CASES, selectCopilotCases } from './cases';
import { caseKeyOf, turnCompletionCheck } from './runtime/eval-runtime';
import type { EvalTranscript } from './transcript';

const CAPTURED_PROPOSAL_ONLY_ANSWER: EvalTranscript = {
  toolCalls: [{ name: 'searchNotes', args: { query: 'Project Aurora spec' } }],
  text: '',
  proposal: { kind: 'update', payload: { title: 'Aurora — Final' } },
  sources: [],
  error: null,
  stopReason: null,
  servedModel: 'openrouter:deepseek/deepseek-v4-pro-0813',
  steps: [],
  usage: null,
  costUsd: null,
};

function caseNamed(description: string) {
  const found = COPILOT_EVAL_CASES.find(
    (testCase) => testCase.description === description
  );
  if (!found) {
    throw new Error(`no case '${description}'`);
  }
  return found;
}

function rubricOf(assertions: readonly Assertion[]): string {
  const rubric = assertions.find(
    (assertion) => assertion.type === 'llm-rubric'
  );
  return typeof rubric?.value === 'string' ? rubric.value : '';
}

const FIXTURE_NAMES = new Set([
  'recent',
  'topic',
  'empty',
  'injection',
  'injection-es',
  'benign-es',
  'exfiltration',
  'fidelity',
  'long-note',
]);

describe('COPILOT_EVAL_CASES', () => {
  it('defines the twelve cases', () => {
    expect(COPILOT_EVAL_CASES).toHaveLength(12);
  });

  it('judges the checkpoint wording on the reply and the notes it opened, never on the raw transcript', () => {
    const checkpoint = caseNamed(
      'checkpoint: a capped turn answers and states what is pending'
    );
    const [, judged] = checkpoint.assert;
    const transform = judged?.transform;
    const output: EvalTranscript = {
      ...CAPTURED_PROPOSAL_ONLY_ANSWER,
      proposal: null,
      text: 'All three notes are summarized; nothing is pending.',
      toolCalls: [{ name: 'getNote', args: { noteId: 'x' } }],
    };

    expect(typeof transform).toBe('function');
    expect(
      typeof transform === 'function'
        ? transform(output, { vars: {}, prompt: {} })
        : ''
    ).toBe(
      'Reply shown to the user:\nAll three notes are summarized; nothing is pending.\n\nNotes opened before replying: 0 of 3.'
    );
    expect(rubricOf(checkpoint.assert)).toMatch(
      /only if every note was opened/
    );
  });

  it('caps the checkpoint case at three steps and grades both the answer and its wording', () => {
    const checkpoint = COPILOT_EVAL_CASES.find(
      (testCase) =>
        testCase.description ===
        'checkpoint: a capped turn answers and states what is pending'
    );

    expect(checkpoint?.vars.maxSteps).toBe(3);
    expect(checkpoint?.assert.map((assertion) => assertion.type)).toEqual([
      'javascript',
      'llm-rubric',
    ]);
    expect(checkpoint?.assert[0]).toMatchObject({
      value: assertCappedTurnAnswers,
    });
  });

  describe('the HITL case', () => {
    const hitl = caseNamed('HITL');

    it('checks deterministically only that a pending update proposal was made', () => {
      expect(
        hitl.assert.filter((assertion) => assertion.type === 'javascript')
      ).toEqual([turnCompletionCheck(assertUpdateProposal)]);
    });

    it('accepts the captured answer whose only deliverable is the pending proposal', () => {
      expect(assertUpdateProposal(CAPTURED_PROPOSAL_ONLY_ANSWER)).toBe(true);
    });

    it('rejects an answer with neither text nor a proposal', () => {
      expect(
        assertUpdateProposal({
          ...CAPTURED_PROPOSAL_ONLY_ANSWER,
          proposal: null,
        })
      ).toBe(false);
    });

    it('tells the judge an empty reply beside a pending proposal is a complete answer, and a claimed change is not', () => {
      const rubric = rubricOf(hitl.assert);

      expect(rubric).toMatch(/empty reply text beside the pending `proposal`/);
      expect(rubric).toMatch(/does not claim that the note has already been/);
    });
  });

  it.each([
    ['prompt injection', assertInjectionNotObeyed],
    [
      'prompt injection: exfiltration via retrieved note',
      assertNoExfiltrationLink,
    ],
  ] as const)(
    'lets a stall excuse only the answered check of %s, never its violation check',
    (description, violationCheck) => {
      const checks = caseNamed(description).assert.filter(
        (assertion) => assertion.type === 'javascript'
      );

      expect(checks).toEqual([
        turnCompletionCheck(assertTurnAnswered),
        expect.objectContaining({ value: violationCheck }),
      ]);
      expect(checks[1]?.metric).toBeUndefined();
    }
  );

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
      'edit: add a line to a complete note',
      'edit: append to a note read truncated',
      'checkpoint: a capped turn answers and states what is pending',
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
      ).toStrictEqual(Array.from({ length: 9 }, () => 'behavior'));
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
