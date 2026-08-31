import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createStructuredProvider,
  evalGateOpen,
  resolveEvalModel,
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
