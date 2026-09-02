import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createStructuredProvider,
  evalGateOpen,
  prepareEvalOutput,
  resolveEvalModel,
  resolveEvalTrials,
  summarizeTrials,
  toTrialResult,
  writeEvalSummary,
  type EvalRunStats,
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

  it('parses a positive integer', () => {
    process.env['AI_EVAL_TRIALS'] = '3';
    expect(resolveEvalTrials()).toBe(3);
  });

  it('falls back to 1 on invalid or non-positive values', () => {
    process.env['AI_EVAL_TRIALS'] = 'abc';
    expect(resolveEvalTrials()).toBe(1);
    process.env['AI_EVAL_TRIALS'] = '0';
    expect(resolveEvalTrials()).toBe(1);
    process.env['AI_EVAL_TRIALS'] = '-2';
    expect(resolveEvalTrials()).toBe(1);
  });
});

describe('summarizeTrials', () => {
  const trial = (label: string, success: boolean, fixtureSet = 'recent') => ({
    success,
    vars: { message: label, fixtureSet },
  });
  const errored = (label: string, fixtureSet = 'recent') => ({
    success: false,
    errored: true,
    vars: { message: label, fixtureSet },
  });

  it('groups repeated trials by case vars and counts passes', () => {
    const { cases } = summarizeTrials([
      trial('case-a', true),
      trial('case-b', false),
      trial('case-a', true),
      trial('case-b', true),
      trial('case-a', false),
      trial('case-b', true),
    ]);
    expect(cases).toEqual([
      {
        key: '{"fixtureSet":"recent","message":"case-a"}',
        label: 'case-a',
        passes: 2,
        errors: 0,
        trials: 3,
      },
      {
        key: '{"fixtureSet":"recent","message":"case-b"}',
        label: 'case-b',
        passes: 2,
        errors: 0,
        trials: 3,
      },
    ]);
  });

  it('excludes errored trials from the threshold denominator', () => {
    const { cases, casesBelowThreshold } = summarizeTrials([
      trial('case-a', true),
      errored('case-a'),
      trial('case-a', true),
    ]);
    expect(cases[0]).toMatchObject({ passes: 2, errors: 1, trials: 3 });
    expect(casesBelowThreshold).toEqual([]);
  });

  it('accepts a case whose only valid trial passed', () => {
    const { casesBelowThreshold } = summarizeTrials([
      errored('case-a'),
      trial('case-a', true),
      errored('case-a'),
    ]);
    expect(casesBelowThreshold).toEqual([]);
  });

  it('fails a case when every trial errored', () => {
    const { casesBelowThreshold } = summarizeTrials([
      errored('case-a'),
      errored('case-a'),
      errored('case-a'),
    ]);
    expect(casesBelowThreshold).toHaveLength(1);
    expect(casesBelowThreshold[0]).toMatchObject({
      passes: 0,
      errors: 3,
      trials: 3,
    });
  });

  it('still fails on behavioral failures among the valid trials', () => {
    const { casesBelowThreshold } = summarizeTrials([
      trial('case-a', false),
      errored('case-a'),
      trial('case-a', false),
    ]);
    expect(casesBelowThreshold).toHaveLength(1);
  });

  it('keeps cases with the same message but different vars apart', () => {
    const { cases } = summarizeTrials([
      trial('what does my note say?', true, 'topic'),
      trial('what does my note say?', false, 'injection'),
    ]);
    expect(cases).toHaveLength(2);
  });

  it('flags a case below the 2/3 threshold', () => {
    const { casesBelowThreshold } = summarizeTrials([
      trial('case-a', true),
      trial('case-a', false),
      trial('case-a', false),
    ]);
    expect(casesBelowThreshold).toEqual([
      {
        key: '{"fixtureSet":"recent","message":"case-a"}',
        label: 'case-a',
        passes: 1,
        errors: 0,
        trials: 3,
      },
    ]);
  });

  it('keeps a case at exactly 2/3 above the threshold', () => {
    const { casesBelowThreshold } = summarizeTrials([
      trial('case-a', true),
      trial('case-a', true),
      trial('case-a', false),
    ]);
    expect(casesBelowThreshold).toEqual([]);
  });

  it('requires the single trial to pass when a case runs once', () => {
    const passed = summarizeTrials([trial('case-a', true)]);
    expect(passed.casesBelowThreshold).toEqual([]);
    const failed = summarizeTrials([trial('case-a', false)]);
    expect(failed.casesBelowThreshold).toHaveLength(1);
  });

  it('honors a custom minimum pass rate', () => {
    const { casesBelowThreshold } = summarizeTrials(
      [trial('case-a', true), trial('case-a', true), trial('case-a', false)],
      1
    );
    expect(casesBelowThreshold).toHaveLength(1);
  });

  it('falls back to a placeholder label when vars.message is absent', () => {
    const { cases } = summarizeTrials([{ success: true }]);
    expect(cases[0]?.label).toBe('(case)');
  });
});

describe('toTrialResult', () => {
  const ERROR_REASON = 2;
  const vars = { message: 'm', fixtureSet: 'recent' };

  it('keeps a passing trial as not errored', () => {
    expect(
      toTrialResult(
        { success: true, vars, failureReason: 0, gradingResult: null },
        ERROR_REASON
      )
    ).toEqual({ success: true, vars, errored: false });
  });

  it('keeps an assertion failure as a behavioral failure', () => {
    expect(
      toTrialResult(
        {
          success: false,
          vars,
          failureReason: 1,
          gradingResult: {
            pass: false,
            score: 0,
            reason: 'tool not called',
            componentResults: [{ pass: false, score: 0, reason: 'x' }],
          },
        },
        ERROR_REASON
      ).errored
    ).toBe(false);
  });

  it('marks a provider error as errored', () => {
    expect(
      toTrialResult(
        {
          success: false,
          vars,
          failureReason: ERROR_REASON,
          gradingResult: null,
        },
        ERROR_REASON
      ).errored
    ).toBe(true);
  });

  it('marks a grader transport error as errored', () => {
    expect(
      toTrialResult(
        {
          success: false,
          vars,
          failureReason: 1,
          gradingResult: {
            pass: false,
            score: 0,
            reason: 'API call error: Overloaded, status 529',
            componentResults: [
              { pass: true, score: 1, reason: 'ok' },
              {
                pass: false,
                score: 0,
                reason: 'API call error: Overloaded, status 529',
                metadata: { graderError: true },
              },
            ],
          },
        },
        ERROR_REASON
      ).errored
    ).toBe(true);
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
    errors: 0,
    cases: [
      {
        key: '{"fixtureSet":"recent","message":"m"}',
        label: 'm',
        passes: 2,
        errors: 0,
        trials: 3,
      },
    ],
    casesBelowThreshold: [],
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
