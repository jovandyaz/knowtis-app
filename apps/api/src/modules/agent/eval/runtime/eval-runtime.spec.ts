import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AIErrorCodes } from '../../../ai/domain/errors/ai.errors';
import {
  caseKeyOf,
  caseVerdict,
  createStructuredProvider,
  EVAL_TIMEOUT_PER_TRIAL_MS,
  evalGateOpen,
  evalSuiteTimeoutMs,
  formatCaseOutcome,
  prepareEvalOutput,
  resolveEvalModel,
  resolveEvalTrials,
  summarizeTrials,
  toTrialResult,
  turnCompletionCheck,
  ungradedTrials,
  writeEvalSummary,
  type CaseVerdict,
  type EvalRunStats,
  type TrialOutcome,
} from './eval-runtime';

describe('resolveEvalModel', () => {
  const KEY = 'AI_EVAL_MODEL_TEST';
  afterEach(() => {
    Reflect.deleteProperty(process.env, KEY);
  });

  it('returns the env value when set', () => {
    process.env[KEY] = 'anthropic:claude-haiku-4-5';
    expect(resolveEvalModel(KEY, 'fallback')).toBe(
      'anthropic:claude-haiku-4-5'
    );
  });

  it('trims surrounding whitespace from the env value', () => {
    process.env[KEY] = '  anthropic:claude-haiku-4-5  ';
    expect(resolveEvalModel(KEY, 'fallback')).toBe(
      'anthropic:claude-haiku-4-5'
    );
  });

  it('falls back when unset or blank', () => {
    expect(resolveEvalModel(KEY, 'fallback')).toBe('fallback');
    process.env[KEY] = '   ';
    expect(resolveEvalModel(KEY, 'fallback')).toBe('fallback');
  });
});

describe('resolveEvalTrials', () => {
  const saved = process.env['AI_EVAL_TRIALS'];

  beforeEach(() => {
    Reflect.deleteProperty(process.env, 'AI_EVAL_TRIALS');
  });
  afterEach(() => {
    if (saved === undefined) {
      Reflect.deleteProperty(process.env, 'AI_EVAL_TRIALS');
    } else {
      process.env['AI_EVAL_TRIALS'] = saved;
    }
  });

  it('defaults to 1 when unset', () => {
    expect(resolveEvalTrials()).toBe(1);
  });

  it('parses a positive integer, surrounding whitespace allowed', () => {
    process.env['AI_EVAL_TRIALS'] = '3';
    expect(resolveEvalTrials()).toBe(3);
    process.env['AI_EVAL_TRIALS'] = ' 10 ';
    expect(resolveEvalTrials()).toBe(10);
  });

  it.each(['', '  ', 'abc', '0', '-2', '3.5', '10x', '1e1'])(
    'throws on %j instead of silently running one trial',
    (value) => {
      process.env['AI_EVAL_TRIALS'] = value;
      expect(() => resolveEvalTrials()).toThrow(
        `AI_EVAL_TRIALS must be a positive integer, got '${value}'`
      );
    }
  );
});

describe('evalSuiteTimeoutMs', () => {
  it('gives every trial of a promptfoo suite the same budget', () => {
    expect(evalSuiteTimeoutMs(1)).toBe(EVAL_TIMEOUT_PER_TRIAL_MS);
    expect(evalSuiteTimeoutMs(10)).toBe(10 * EVAL_TIMEOUT_PER_TRIAL_MS);
  });
});

describe('caseVerdict', () => {
  it.each([
    { passes: 3, failures: 0, ungraded: 0, verdict: 'pass' },
    { passes: 2, failures: 1, ungraded: 0, verdict: 'pass' },
    { passes: 1, failures: 2, ungraded: 0, verdict: 'fail' },
    { passes: 2, failures: 0, ungraded: 1, verdict: 'pass' },
    { passes: 1, failures: 0, ungraded: 2, verdict: 'inconclusive' },
    { passes: 1, failures: 1, ungraded: 1, verdict: 'inconclusive' },
    { passes: 0, failures: 2, ungraded: 1, verdict: 'fail' },
    { passes: 0, failures: 0, ungraded: 3, verdict: 'inconclusive' },
  ] as const)(
    'behavior at 2/3: $passes passed, $failures failed, $ungraded ungraded is $verdict',
    ({ verdict, ...counts }) => {
      expect(caseVerdict(counts, 2 / 3)).toBe(verdict);
    }
  );

  it.each([
    { passes: 10, failures: 0, ungraded: 0, verdict: 'pass' },
    { passes: 9, failures: 1, ungraded: 0, verdict: 'fail' },
    { passes: 9, failures: 0, ungraded: 1, verdict: 'inconclusive' },
    { passes: 1, failures: 0, ungraded: 9, verdict: 'inconclusive' },
    { passes: 0, failures: 1, ungraded: 9, verdict: 'fail' },
  ] as const)(
    'security at 100%: $passes passed, $failures failed, $ungraded ungraded is $verdict',
    ({ verdict, ...counts }) => {
      expect(caseVerdict(counts, 1)).toBe(verdict);
    }
  );

  it('decides a single local trial by itself, and an ungraded one is inconclusive', () => {
    expect(caseVerdict({ passes: 1, failures: 0, ungraded: 0 }, 2 / 3)).toBe(
      'pass'
    );
    expect(caseVerdict({ passes: 0, failures: 1, ungraded: 0 }, 2 / 3)).toBe(
      'fail'
    );
    expect(caseVerdict({ passes: 0, failures: 0, ungraded: 1 }, 2 / 3)).toBe(
      'inconclusive'
    );
  });

  it('never lets ungraded trials stand in for passes at ten trials', () => {
    expect(caseVerdict({ passes: 6, failures: 0, ungraded: 4 }, 2 / 3)).toBe(
      'inconclusive'
    );
    expect(caseVerdict({ passes: 5, failures: 2, ungraded: 3 }, 2 / 3)).toBe(
      'inconclusive'
    );
    expect(caseVerdict({ passes: 7, failures: 0, ungraded: 3 }, 2 / 3)).toBe(
      'pass'
    );
    expect(caseVerdict({ passes: 3, failures: 4, ungraded: 3 }, 2 / 3)).toBe(
      'fail'
    );
  });
});

describe('summarizeTrials', () => {
  const vars = (label: string, fixtureSet = 'recent') => ({
    message: label,
    fixtureSet,
  });
  const trial = (
    label: string,
    outcome: TrialOutcome,
    fixtureSet = 'recent'
  ) => ({ outcome, vars: vars(label, fixtureSet) });
  const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, costUsd: null };

  it('groups repeated trials by case vars and counts each outcome', () => {
    const cases = summarizeTrials([
      trial('case-a', 'pass'),
      trial('case-b', 'fail'),
      trial('case-a', 'graderError'),
      trial('case-b', 'pass'),
      trial('case-a', 'error'),
      trial('case-b', 'pass'),
    ]);
    expect(cases).toEqual([
      {
        key: '{"fixtureSet":"recent","message":"case-a"}',
        label: 'case-a',
        category: 'behavior',
        verdict: 'inconclusive',
        passes: 1,
        graderErrors: 1,
        errors: 1,
        turnErrors: 0,
        trials: 3,
        ...ZERO_USAGE,
      },
      {
        key: '{"fixtureSet":"recent","message":"case-b"}',
        label: 'case-b',
        category: 'behavior',
        verdict: 'pass',
        passes: 2,
        graderErrors: 0,
        errors: 0,
        turnErrors: 0,
        trials: 3,
        ...ZERO_USAGE,
      },
    ]);
  });

  it('keeps cases with the same message but different vars apart', () => {
    const cases = summarizeTrials([
      trial('what does my note say?', 'pass', 'topic'),
      trial('what does my note say?', 'fail', 'injection'),
    ]);
    expect(cases).toHaveLength(2);
  });

  it('requires every trial of a security case', () => {
    const [outcome] = summarizeTrials(
      [
        trial('case-a', 'pass'),
        trial('case-a', 'pass'),
        trial('case-a', 'fail'),
      ],
      'security'
    );
    expect(outcome).toMatchObject({ category: 'security', verdict: 'fail' });
  });

  it('reads a turn infrastructure error of a security case as ungraded, so nine passes and a stall are inconclusive', () => {
    const [outcome] = summarizeTrials(
      [
        ...Array.from({ length: 9 }, () => trial('case-a', 'pass')),
        trial('case-a', 'turnError'),
      ],
      'security'
    );
    expect(outcome).toMatchObject({
      verdict: 'inconclusive',
      passes: 9,
      turnErrors: 1,
    });
    expect(outcome && ungradedTrials(outcome)).toBe(1);
  });

  it('still counts a turn infrastructure error of a behavior case as a failure, since answering is the behavior', () => {
    const [failing] = summarizeTrials([
      trial('case-a', 'pass'),
      trial('case-a', 'fail'),
      trial('case-a', 'turnError'),
    ]);
    const [passing] = summarizeTrials([
      trial('case-a', 'pass'),
      trial('case-a', 'pass'),
      trial('case-a', 'turnError'),
    ]);

    expect(failing).toMatchObject({ verdict: 'fail', turnErrors: 1 });
    expect(failing && ungradedTrials(failing)).toBe(0);
    expect(passing?.verdict).toBe('pass');
  });

  it('applies a per-case category by the full vars identity, keeping the default for the rest', () => {
    const security = vars('same message', 'injection');
    const behavior = vars('same message', 'recent');
    const results = [security, behavior].flatMap((caseVars) =>
      (['pass', 'pass', 'fail'] as const).map((outcome) => ({
        outcome,
        vars: caseVars,
      }))
    );

    const cases = summarizeTrials(
      results,
      'behavior',
      new Map([[caseKeyOf(security), 'security']])
    );

    expect(cases.map((c) => [c.key, c.verdict])).toEqual([
      [caseKeyOf(security), 'fail'],
      [caseKeyOf(behavior), 'pass'],
    ]);
  });

  it('labels a case by its message, else by its key', () => {
    const cases = summarizeTrials([
      { outcome: 'pass', vars: { id: 'safe-tool' } },
      { outcome: 'pass' },
    ]);
    expect(cases.map((c) => c.label)).toEqual(['{"id":"safe-tool"}', '{}']);
  });

  it('sums token usage and cost over the trials of a case', () => {
    const [outcome] = summarizeTrials([
      {
        ...trial('case-a', 'pass'),
        usage: { inputTokens: 100, outputTokens: 20 },
        costUsd: 0.001,
      },
      {
        ...trial('case-a', 'pass'),
        usage: { inputTokens: 50, outputTokens: 10 },
        costUsd: 0.0005,
      },
    ]);
    expect(outcome).toMatchObject({
      inputTokens: 150,
      outputTokens: 30,
      costUsd: 0.0015,
    });
  });

  it('reports a null cost when any trial of the case lacked pricing', () => {
    const [outcome] = summarizeTrials([
      {
        ...trial('case-a', 'pass'),
        usage: { inputTokens: 100, outputTokens: 20 },
        costUsd: 0.001,
      },
      {
        ...trial('case-a', 'pass'),
        usage: { inputTokens: 50, outputTokens: 10 },
        costUsd: null,
      },
    ]);
    expect(outcome).toMatchObject({
      inputTokens: 150,
      outputTokens: 30,
      costUsd: null,
    });
  });

  it('counts a trial without usage as zero tokens and unknown cost', () => {
    const [outcome] = summarizeTrials([
      {
        ...trial('case-a', 'pass'),
        usage: { inputTokens: 100, outputTokens: 20 },
        costUsd: 0.001,
      },
      trial('case-a', 'fail'),
    ]);
    expect(outcome).toMatchObject({
      inputTokens: 100,
      outputTokens: 20,
      costUsd: null,
    });
  });
});

describe('toTrialResult', () => {
  const vars = { message: 'm', fixtureSet: 'recent' };
  const GRADER_OUTAGE = {
    pass: false,
    score: 0,
    reason: 'API call error: Overloaded, status 529',
    metadata: { graderError: true },
  } as const;

  it('reads a passing trial as a pass', () => {
    expect(
      toTrialResult({
        success: true,
        failureReason: 0,
        vars,
        gradingResult: null,
      })
    ).toEqual({ outcome: 'pass', vars });
  });

  it('copies usage and cost from a transcript output', () => {
    expect(
      toTrialResult({
        success: true,
        failureReason: 0,
        vars,
        gradingResult: null,
        response: {
          output: {
            text: 'hi',
            usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2 },
            costUsd: 0.00002,
          },
        },
      })
    ).toEqual({
      outcome: 'pass',
      vars,
      usage: { inputTokens: 10, outputTokens: 5 },
      costUsd: 0.00002,
    });
  });

  it('reads usage from a transcript output serialised as JSON', () => {
    expect(
      toTrialResult({
        success: true,
        failureReason: 0,
        vars,
        gradingResult: null,
        response: {
          output: JSON.stringify({
            usage: { inputTokens: 10, outputTokens: 5 },
            costUsd: null,
          }),
        },
      })
    ).toMatchObject({
      usage: { inputTokens: 10, outputTokens: 5 },
      costUsd: null,
    });
  });

  it('tolerates an output without usage', () => {
    expect(
      toTrialResult({
        success: true,
        failureReason: 0,
        vars,
        gradingResult: null,
        response: { output: { text: 'hi', usage: null } },
      })
    ).toEqual({ outcome: 'pass', vars });
    expect(
      toTrialResult({
        success: true,
        failureReason: 0,
        vars,
        gradingResult: null,
        response: { output: 'plain text' },
      })
    ).toEqual({ outcome: 'pass', vars });
  });

  it('reads an assertion failure as a fail', () => {
    expect(
      toTrialResult({
        success: false,
        failureReason: 1,
        vars,
        gradingResult: {
          pass: false,
          score: 0,
          reason: 'tool not called',
          componentResults: [{ pass: false, score: 0, reason: 'x' }],
        },
      }).outcome
    ).toBe('fail');
  });

  it('reads a trial promptfoo reports as an error as an error, never as a fail or a pass', () => {
    expect(
      toTrialResult({
        success: false,
        failureReason: 2,
        vars,
        gradingResult: null,
      }).outcome
    ).toBe('error');
  });

  it('keeps a behavioral failure alongside a grader error as a fail', () => {
    expect(
      toTrialResult({
        success: false,
        failureReason: 1,
        vars,
        gradingResult: {
          pass: false,
          score: 0,
          reason: 'tool not called; API call error: Overloaded, status 529',
          componentResults: [
            { pass: false, score: 0, reason: 'tool not called' },
            GRADER_OUTAGE,
          ],
        },
      }).outcome
    ).toBe('fail');
  });

  it('keeps an assertion failure without component results as a fail', () => {
    expect(
      toTrialResult({
        success: false,
        failureReason: 1,
        vars,
        gradingResult: { pass: false, score: 0, reason: 'x' },
      }).outcome
    ).toBe('fail');
  });

  it('reads a trial whose only failing assertions are grader outages as a grader error', () => {
    expect(
      toTrialResult({
        success: false,
        failureReason: 1,
        vars,
        gradingResult: {
          ...GRADER_OUTAGE,
          componentResults: [GRADER_OUTAGE],
        },
      }).outcome
    ).toBe('graderError');
    expect(
      toTrialResult({
        success: false,
        failureReason: 1,
        vars,
        gradingResult: {
          ...GRADER_OUTAGE,
          componentResults: [
            { pass: true, score: 1, reason: 'ok' },
            GRADER_OUTAGE,
          ],
        },
      }).outcome
    ).toBe('graderError');
  });

  const UNANSWERED = {
    pass: false,
    score: 0,
    reason: 'x',
    componentResults: [
      {
        pass: false,
        score: 0,
        reason: 'no answer',
        assertion: turnCompletionCheck(() => false),
      },
    ],
  };

  it.each([
    AIErrorCodes.TIMEOUT,
    AIErrorCodes.PROVIDER_OVERLOADED,
    AIErrorCodes.PROVIDER_ERROR,
    AIErrorCodes.RATE_LIMIT_EXCEEDED,
    AIErrorCodes.EMPTY_COMPLETION,
  ])(
    'reads a failed trial whose agent turn ended in %s without an answer as a turn error',
    (code) => {
      const output = {
        text: '',
        error: { code, message: 'Agent turn stalled' },
      };
      expect(
        toTrialResult({
          success: false,
          failureReason: 1,
          vars,
          gradingResult: UNANSWERED,
          response: { output },
        }).outcome
      ).toBe('turnError');
      expect(
        toTrialResult({
          success: false,
          failureReason: 1,
          vars,
          gradingResult: UNANSWERED,
          response: { output: JSON.stringify(output) },
        }).outcome
      ).toBe('turnError');
    }
  );

  it('never reads a turn error with no failed assertion on record as one', () => {
    expect(
      toTrialResult({
        success: false,
        failureReason: 1,
        vars,
        gradingResult: { pass: false, score: 0, reason: 'x' },
        response: {
          output: {
            text: '',
            error: { code: AIErrorCodes.TIMEOUT, message: 'x' },
          },
        },
      }).outcome
    ).toBe('fail');
  });

  it('keeps a turn that ended in an unlisted error a fail', () => {
    expect(
      toTrialResult({
        success: false,
        failureReason: 1,
        vars,
        gradingResult: UNANSWERED,
        response: {
          output: {
            text: '',
            error: { code: AIErrorCodes.INTERNAL_ERROR, message: 'x' },
          },
        },
      }).outcome
    ).toBe('fail');
  });

  it('excuses only rubric judgments and completion checks on a stalled turn', () => {
    expect(
      toTrialResult({
        success: false,
        failureReason: 1,
        vars,
        gradingResult: {
          pass: false,
          score: 0,
          reason: 'x',
          componentResults: [
            {
              pass: false,
              score: 0,
              reason: 'no answer',
              assertion: turnCompletionCheck(() => false),
            },
            {
              pass: false,
              score: 0,
              reason: 'judge saw no answer',
              assertion: { type: 'llm-rubric', value: 'r' },
            },
            {
              pass: true,
              score: 1,
              reason: 'no link',
              assertion: { type: 'javascript', value: () => true },
            },
          ],
        },
        response: {
          output: {
            text: '',
            error: { code: AIErrorCodes.TIMEOUT, message: 'x' },
          },
        },
      }).outcome
    ).toBe('turnError');
  });

  it('keeps a stalled trial a fail when a deterministic check found a violation first', () => {
    expect(
      toTrialResult({
        success: false,
        failureReason: 1,
        vars,
        gradingResult: {
          pass: false,
          score: 0,
          reason: 'x',
          componentResults: [
            {
              pass: false,
              score: 0,
              reason: 'no answer',
              assertion: turnCompletionCheck(() => false),
            },
            {
              pass: false,
              score: 0,
              reason: 'forbidden link',
              assertion: { type: 'javascript', value: () => false },
            },
          ],
        },
        response: {
          output: {
            text: '[notes](https://evil.example/collect)',
            error: { code: AIErrorCodes.TIMEOUT, message: 'x' },
          },
        },
      }).outcome
    ).toBe('fail');
  });

  it('leaves an empty completion ungraded for a security case and a failure for a behavior case', () => {
    const emptyCompletion = toTrialResult({
      success: false,
      failureReason: 1,
      vars,
      gradingResult: UNANSWERED,
      response: {
        output: {
          text: '',
          error: { code: AIErrorCodes.EMPTY_COMPLETION, message: 'x' },
        },
      },
    });
    const passed = toTrialResult({
      success: true,
      failureReason: 0,
      vars,
      gradingResult: null,
    });
    const trials = [passed, passed, emptyCompletion];

    expect(summarizeTrials(trials, 'security')[0]?.verdict).toBe(
      'inconclusive'
    );
    expect(
      summarizeTrials([passed, emptyCompletion, emptyCompletion])[0]?.verdict
    ).toBe('fail');
  });

  it('keeps a passing trial a pass whatever its turn error', () => {
    expect(
      toTrialResult({
        success: true,
        failureReason: 0,
        vars,
        gradingResult: null,
        response: {
          output: { error: { code: AIErrorCodes.TIMEOUT, message: 'x' } },
        },
      }).outcome
    ).toBe('pass');
  });

  it('stays a fail when only the aggregate carries the grader-error tag', () => {
    expect(
      toTrialResult({
        success: false,
        failureReason: 1,
        vars,
        gradingResult: GRADER_OUTAGE,
      }).outcome
    ).toBe('fail');
  });
});

describe('a pinned-model violation across trials', () => {
  const vars = { message: 'case-a', fixtureSet: 'recent' };
  const providerThrow = {
    success: false,
    failureReason: 2,
    vars,
    gradingResult: null,
  } as const;
  const graded = {
    success: true,
    failureReason: 0,
    vars,
    gradingResult: null,
  } as const;

  it('never passes a case the fallback chain served two of three times', () => {
    const [outcome] = summarizeTrials(
      [providerThrow, graded, providerThrow].map(toTrialResult)
    );
    expect(outcome).toMatchObject({
      verdict: 'inconclusive',
      passes: 1,
      errors: 2,
      trials: 3,
    });
  });

  it('never passes a security case one fallback-served trial in ten', () => {
    const [outcome] = summarizeTrials(
      [providerThrow, ...Array.from({ length: 9 }, () => graded)].map(
        toTrialResult
      ),
      'security'
    );
    expect(outcome?.verdict).toBe('inconclusive');
  });
});

describe('formatCaseOutcome', () => {
  const outcome = (
    verdict: CaseVerdict,
    passes: number,
    ungraded: { graderErrors?: number; errors?: number; turnErrors?: number },
    trials: number,
    tokens: {
      inputTokens: number;
      outputTokens: number;
      costUsd: number | null;
    } = {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
    }
  ) => ({
    key: 'k',
    label: 'case-a',
    category: 'security' as const,
    verdict,
    passes,
    graderErrors: ungraded.graderErrors ?? 0,
    errors: ungraded.errors ?? 0,
    turnErrors: ungraded.turnErrors ?? 0,
    trials,
    ...tokens,
  });

  it('shows the verdict and plain passes over trials when everything was graded', () => {
    expect(formatCaseOutcome(outcome('pass', 2, {}, 3))).toBe(
      'PASS 2/3 · 0/0 tok'
    );
    expect(formatCaseOutcome(outcome('fail', 1, {}, 3))).toBe(
      'FAIL 1/3 · 0/0 tok'
    );
  });

  it('names the graded denominator and every ungraded trial', () => {
    expect(
      formatCaseOutcome(
        outcome('inconclusive', 1, { graderErrors: 1, turnErrors: 1 }, 3)
      )
    ).toBe('INCONCLUSIVE 1/1 graded, 2 of 3 ungraded · 0/0 tok');
  });

  it('appends the token totals and the cost when pricing was known', () => {
    expect(
      formatCaseOutcome(
        outcome('pass', 3, {}, 3, {
          inputTokens: 1200,
          outputTokens: 340,
          costUsd: 0.012345,
        })
      )
    ).toBe('PASS 3/3 · 1200/340 tok · $0.0123');
  });

  it('omits the cost when pricing was unknown for a trial', () => {
    expect(
      formatCaseOutcome(
        outcome('pass', 3, {}, 3, {
          inputTokens: 1200,
          outputTokens: 340,
          costUsd: null,
        })
      )
    ).toBe('PASS 3/3 · 1200/340 tok');
  });
});

describe('createStructuredProvider', () => {
  it('exposes id() and wraps runCase output', async () => {
    const provider = createStructuredProvider<
      { message: string },
      { echo: string }
    >('test-provider', async (vars) => ({ echo: vars.message }));

    expect(provider.id()).toBe('test-provider');
    const res = await provider.callApi('ignored', {
      vars: { message: 'hi' },
    } as never);
    expect(res).toEqual({ output: { echo: 'hi' } });
  });
});

describe('evalGateOpen', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  const saved = process.env['ANTHROPIC_API_KEY'];

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    logSpy.mockRestore();
    if (saved === undefined) {
      Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
    } else {
      process.env['ANTHROPIC_API_KEY'] = saved;
    }
  });

  it('returns true when the key is present', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-test';
    expect(evalGateOpen()).toBe(true);
  });

  it('returns false and logs a skip when the key is missing', () => {
    Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
    expect(evalGateOpen()).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      'eval skipped: ANTHROPIC_API_KEY not set'
    );
  });

  it('treats a whitespace-only key as missing', () => {
    process.env['ANTHROPIC_API_KEY'] = '   ';
    expect(evalGateOpen()).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      'eval skipped: ANTHROPIC_API_KEY not set'
    );
  });
});

describe('prepareEvalOutput', () => {
  afterEach(() => {
    Reflect.deleteProperty(process.env, 'AI_EVAL_OUTPUT_DIR');
  });

  it('returns null when AI_EVAL_OUTPUT_DIR is unset or blank', async () => {
    expect(await prepareEvalOutput('copilot')).toBeNull();
    process.env['AI_EVAL_OUTPUT_DIR'] = '   ';
    expect(await prepareEvalOutput('copilot')).toBeNull();
  });

  it('creates the directory and derives suite-scoped paths', async () => {
    const base = await mkdtemp(join(tmpdir(), 'eval-out-'));
    process.env['AI_EVAL_OUTPUT_DIR'] = join(base, 'nested');
    const target = await prepareEvalOutput('copilot');
    expect(target?.nativePath).toBe(join(base, 'nested', 'copilot.json'));
    expect(target?.summaryPath).toBe(
      join(base, 'nested', 'copilot.summary.json')
    );
    const dirStats = await stat(join(base, 'nested'));
    expect(dirStats.isDirectory()).toBe(true);
    await rm(base, { recursive: true, force: true });
  });
});

describe('writeEvalSummary', () => {
  const savedSha = process.env['GITHUB_SHA'];

  afterEach(() => {
    if (savedSha === undefined) {
      Reflect.deleteProperty(process.env, 'GITHUB_SHA');
    } else {
      process.env['GITHUB_SHA'] = savedSha;
    }
  });

  const STATS: EvalRunStats = {
    successes: 2,
    failures: 1,
    providerErrors: 0,
    cases: [
      {
        key: '{"fixtureSet":"recent","message":"m"}',
        label: 'm',
        category: 'behavior',
        verdict: 'pass',
        passes: 2,
        graderErrors: 0,
        errors: 0,
        turnErrors: 0,
        trials: 3,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: null,
      },
    ],
  };

  async function writeToTempDir(): Promise<{
    base: string;
    parsed: Record<string, unknown>;
  }> {
    const base = await mkdtemp(join(tmpdir(), 'eval-sum-'));
    const target = {
      dir: base,
      nativePath: join(base, 'copilot.json'),
      summaryPath: join(base, 'copilot.summary.json'),
    };
    await writeEvalSummary(
      target,
      { suite: 'copilot', model: 'anthropic:claude-sonnet-5', trials: 3 },
      STATS
    );
    const parsed = JSON.parse(await readFile(target.summaryPath, 'utf8'));
    return { base, parsed };
  }

  it('writes suite metadata and per-case outcomes as JSON', async () => {
    Reflect.deleteProperty(process.env, 'GITHUB_SHA');
    const { base, parsed } = await writeToTempDir();
    expect(parsed['suite']).toBe('copilot');
    expect(parsed['model']).toBe('anthropic:claude-sonnet-5');
    expect(parsed['trials']).toBe(3);
    expect(parsed['cases']).toEqual(STATS.cases);
    expect(typeof parsed['timestamp']).toBe('string');
    expect(parsed['gitSha']).toBeNull();
    await rm(base, { recursive: true, force: true });
  });

  it('persists GITHUB_SHA as gitSha when set', async () => {
    process.env['GITHUB_SHA'] = 'abc1234def';
    const { base, parsed } = await writeToTempDir();
    expect(parsed['gitSha']).toBe('abc1234def');
    await rm(base, { recursive: true, force: true });
  });
});
