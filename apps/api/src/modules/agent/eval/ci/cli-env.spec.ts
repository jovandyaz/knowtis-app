import { afterEach, describe, expect, it } from 'vitest';

import { messageOf, requiredEnv } from './cli-env';

describe('requiredEnv', () => {
  const NAME = 'EVAL_CLI_ENV_TEST';

  afterEach(() => {
    Reflect.deleteProperty(process.env, NAME);
  });

  it('returns the trimmed value', () => {
    process.env[NAME] = '  value  ';
    expect(requiredEnv(NAME)).toBe('value');
  });

  it.each([undefined, '', '   '])('throws when the value is %j', (value) => {
    if (value !== undefined) {
      process.env[NAME] = value;
    }
    expect(() => requiredEnv(NAME)).toThrow(`${NAME} must be set`);
  });
});

describe('messageOf', () => {
  it('reads an error message and stringifies anything else', () => {
    expect(messageOf(new Error('boom'))).toBe('boom');
    expect(messageOf('plain')).toBe('plain');
  });
});
