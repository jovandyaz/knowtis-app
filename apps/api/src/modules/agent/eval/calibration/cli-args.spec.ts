import { afterEach, describe, expect, it } from 'vitest';

import { argValue } from './cli-args';

const ORIGINAL_ARGV = process.argv;

afterEach(() => {
  process.argv = ORIGINAL_ARGV;
});

describe('argValue', () => {
  it('returns the token following the flag', () => {
    process.argv = ['node', 'cli.ts', '--dir', '/tmp/results'];
    expect(argValue('--dir')).toBe('/tmp/results');
  });

  it('returns undefined when the flag is absent', () => {
    process.argv = ['node', 'cli.ts'];
    expect(argValue('--dir')).toBeUndefined();
  });

  it('rejects a flag with no value', () => {
    process.argv = ['node', 'cli.ts', '--dir'];
    expect(() => argValue('--dir')).toThrow('--dir requires a value');
  });

  it('rejects a value that is another flag', () => {
    process.argv = ['node', 'cli.ts', '--dir', '--out'];
    expect(() => argValue('--dir')).toThrow('--dir requires a value');
  });
});
