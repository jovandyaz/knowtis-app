import { DrizzleQueryError } from 'drizzle-orm';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import { stackOf } from './stack-of';

const SECRET_PARAM = '$argon2id$v=19$m=65536,t=3,p=4$sentinel-hash';

const PostgresError = postgres.PostgresError as unknown as new (
  fields: Partial<postgres.PostgresError>
) => postgres.PostgresError;

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
    const failedQuery = new DrizzleQueryError(
      'update "users" set "password_hash" = $1 where "users"."id" = $2',
      [`${SECRET_PARAM}\n    at injected (fake.ts:1:1)`, 'user-id'],
      new PostgresError({ message: 'deadlock detected', code: '40P01' })
    );

    const stack = stackOf(failedQuery);

    expect(stack).not.toContain(SECRET_PARAM);
    expect(stack).not.toContain('injected');
    expect(stack.split('\n')[0]).toBe(
      'DrizzleQueryError (failureCategory=unclassified, sqlState=40P01)'
    );
    expect(stack).toContain('stack-of.spec.ts');
  });

  it('heads a raw Postgres error with its diagnostics, whatever name its stack was captured under', () => {
    const rejectedInput = throwFromHere(
      new PostgresError({
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
    const failedQuery = new DrizzleQueryError('select $1', [SECRET_PARAM]);
    failedQuery.stack = `Error: rewritten ${SECRET_PARAM}\n    at somewhere (x.ts:1:1)`;

    expect(stackOf(failedQuery)).toBe(
      'DrizzleQueryError (failureCategory=unclassified, sqlState=null)'
    );
  });
});
