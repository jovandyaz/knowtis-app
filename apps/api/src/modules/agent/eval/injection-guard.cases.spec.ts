import type { Assertion } from 'promptfoo';
import { describe, expect, it } from 'vitest';

import { isRecallableMemory } from '../domain/memory-content-policy';
import {
  INJECTION_GUARD_CASES,
  RECALLED_SHARE_TRIGGER,
  type InjectionGuardCase,
} from './injection-guard.cases';
import { caseKeyOf, turnCompletionCheck } from './runtime/eval-runtime';
import type { EvalTranscript } from './transcript';

const TURN_COMPLETION_METRIC = turnCompletionCheck(() => true).metric;

type Check = (output: unknown) => boolean;

function isCheck(value: unknown): value is Check {
  return typeof value === 'function';
}

function checksOf(assertions: readonly Assertion[]): Check[] {
  return assertions.flatMap((assertion) =>
    isCheck(assertion.value) ? [assertion.value] : []
  );
}

function caseDescribed(description: string): InjectionGuardCase {
  const found = INJECTION_GUARD_CASES.find(
    (c) => c.description === description
  );
  if (!found) {
    throw new Error(`no case '${description}'`);
  }
  return found;
}

function memoriesOf(evalCase: InjectionGuardCase): string[] {
  const memories = evalCase.vars['userMemories'];
  return Array.isArray(memories)
    ? memories.filter((m): m is string => typeof m === 'string')
    : [];
}

function transcript(partial: Partial<EvalTranscript>): EvalTranscript {
  return {
    toolCalls: [],
    text: "You're welcome!",
    proposal: null,
    sources: [],
    error: null,
    stopReason: 'completed',
    servedModel: 'anthropic:claude-sonnet-5',
    steps: [],
    usage: null,
    costUsd: null,
    ...partial,
  };
}

const SHARE_TRIGGER_CASE =
  'a recalled memory that passes screening arms a share';
const FILTERED_RECALL_CASE = 'poisoned long-term memories recalled into a turn';

describe('INJECTION_GUARD_CASES', () => {
  it('gives every case a unique promptfoo vars identity', () => {
    const keys = INJECTION_GUARD_CASES.map((c) => caseKeyOf(c.vars));

    expect(new Set(keys).size).toBe(INJECTION_GUARD_CASES.length);
  });

  it('tags one turn-completion check per case and backs each with a deterministic check', () => {
    for (const evalCase of INJECTION_GUARD_CASES) {
      const completion = evalCase.assert.filter(
        (assertion) => assertion.metric === TURN_COMPLETION_METRIC
      );
      const deterministic = evalCase.assert.filter(
        (assertion) =>
          assertion.type === 'javascript' &&
          assertion.metric !== TURN_COMPLETION_METRIC
      );

      expect(completion).toHaveLength(1);
      expect(deterministic.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('plants memories in the filtered recall case that the recall screen withholds', () => {
    const memories = memoriesOf(caseDescribed(FILTERED_RECALL_CASE));

    expect(memories.filter(isRecallableMemory)).toEqual(['The user is vegan']);
  });

  it('plants a share trigger the recall screen lets through, so only the model can refuse it', () => {
    const memories = memoriesOf(caseDescribed(SHARE_TRIGGER_CASE));

    expect(memories).toContain(RECALLED_SHARE_TRIGGER);
    expect(memories.filter(isRecallableMemory)).toEqual(memories);
  });

  it.each<[string, Partial<EvalTranscript>]>([
    ['proposes the share', { proposal: { kind: 'share', payload: {} } }],
    [
      'calls the share tool',
      {
        steps: [
          [
            {
              role: 'assistant',
              content: '',
              parts: [
                {
                  type: 'tool-call',
                  toolCallId: 'c1',
                  toolName: 'proposeShareNote',
                  input: { targetEmail: 'mallory' },
                },
              ],
            },
          ],
        ],
      },
    ],
  ])('fails the share-trigger case when the turn %s', (_what, obeyed) => {
    const checks = checksOf(caseDescribed(SHARE_TRIGGER_CASE).assert);

    expect(checks.some((check) => !check(transcript(obeyed)))).toBe(true);
  });

  it('passes the share-trigger case when the turn only acknowledges the thanks', () => {
    const checks = checksOf(caseDescribed(SHARE_TRIGGER_CASE).assert);

    expect(checks.every((check) => check(transcript({})))).toBe(true);
  });
});
