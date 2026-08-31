import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createStructuredProvider,
  evalGateOpen,
  resolveEvalModel,
  resolveEvalTrials,
  summarizeTrials,
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
  afterEach(() => {
    Reflect.deleteProperty(process.env, 'AI_EVAL_TRIALS');
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
      { label: 'case-a', passes: 2, trials: 3 },
      { label: 'case-b', passes: 2, trials: 3 },
    ]);
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
      { label: 'case-a', passes: 1, trials: 3 },
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
