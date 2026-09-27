import { describe, expect, it } from 'vitest';

import { failedQuery, postgresError } from '../../test-support/database-errors';
import { stackOf } from './stack-of';

const SECRET_PARAM = '$argon2id$v=19$m=65536,t=3,p=4$sentinel-hash';

function throwFromHere(error: Error): Error {
  Error.captureStackTrace(error, throwFromHere);
  return error;
}

describe('stackOf', () => {
  it('keeps the stack of an ordinary error as is', () => {
    const error = new TypeError('cannot read properties of undefined');

    expect(stackOf(error)).toBe(error.stack);
  });

  it('stringifies anything else that was thrown', () => {
    expect(stackOf('timeout')).toBe('timeout');
  });

  it('heads a failed query with its diagnostics and keeps its frames, never its parameters', () => {
    const rejected = failedQuery([
      `${SECRET_PARAM}\n    at injected (fake.ts:1:1)`,
      'user-id',
    ]);

    const stack = stackOf(rejected);

    expect(stack).not.toContain(SECRET_PARAM);
    expect(stack).not.toContain('injected');
    expect(stack.split('\n')[0]).toBe(
      'DrizzleQueryError (failureCategory=unclassified, sqlState=40P01)'
    );
    expect(stack).toContain('stack-of.spec.ts');
  });

  it('heads a raw Postgres error with its diagnostics, whatever name its stack was captured under', () => {
    const rejectedInput = throwFromHere(
      postgresError({
        message: `invalid input syntax for type uuid: "${SECRET_PARAM}"`,
        code: '22P02',
      })
    );

    const stack = stackOf(rejectedInput);

    expect(stack).not.toContain(SECRET_PARAM);
    expect(stack.split('\n')[0]).toBe(
      'PostgresError (failureCategory=unclassified, sqlState=22P02)'
    );
    expect(stack).toContain('stack-of.spec.ts');
  });

  it('drops the frames of a database error whose stack does not quote its message', () => {
    const rejected = failedQuery([SECRET_PARAM]);
    rejected.stack = `Error: rewritten ${SECRET_PARAM}\n    at somewhere (x.ts:1:1)`;

    expect(stackOf(rejected)).toBe(
      'DrizzleQueryError (failureCategory=unclassified, sqlState=40P01)'
    );
  });

  it('heads an error wrapping a failed query with the diagnostics and keeps the wrapper frames', () => {
    const wrapped = new Error(`Lookup failed: ${SECRET_PARAM}`, {
      cause: failedQuery([SECRET_PARAM]),
    });

    const stack = stackOf(wrapped);

    expect(stack).not.toContain(SECRET_PARAM);
    expect(stack.split('\n')[0]).toBe(
      'Error (failureCategory=unclassified, sqlState=40P01)'
    );
    expect(stack).toContain('stack-of.spec.ts');
  });

  it('keeps the frames of a wrapper that has no message of its own', () => {
    const wrapped = new Error('', { cause: failedQuery([SECRET_PARAM]) });

    const lines = stackOf(wrapped).split('\n');

    expect(lines[0]).toBe(
      'Error (failureCategory=unclassified, sqlState=40P01)'
    );
    expect(lines[1]).toMatch(/^\s+at /);
  });
});
