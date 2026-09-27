import { describe, expect, it } from 'vitest';

import { failedQuery, postgresError } from '../../test-support/database-errors';
import { reasonOf } from './reason-of';

const SECRET_PARAM = '$argon2id$v=19$m=65536,t=3,p=4$sentinel-hash';

describe('reasonOf', () => {
  it('reads the message of an Error', () => {
    expect(reasonOf(new TypeError('connection reset'))).toBe(
      'connection reset'
    );
  });

  it('stringifies anything else that was thrown', () => {
    expect(reasonOf('timeout')).toBe('timeout');
    expect(reasonOf(undefined)).toBe('undefined');
  });

  it('describes a failed query by its diagnostics, never by its bound parameters', () => {
    const rejected = failedQuery(
      ['someone@example.com', SECRET_PARAM],
      postgresError({
        message:
          'duplicate key value violates unique constraint "users_email_unique"',
        code: '23505',
        table_name: 'users',
        constraint_name: 'users_email_unique',
        detail: `Key (email)=(someone@example.com) already exists.`,
      })
    );

    const reason = reasonOf(rejected);

    expect(reason).toBe(
      'DrizzleQueryError (failureCategory=unique_violation, sqlState=23505, table=users, constraint=users_email_unique)'
    );
    expect(reason).not.toContain(SECRET_PARAM);
    expect(reason).not.toContain('someone@example.com');
  });

  it('keeps the input a raw Postgres error echoes out of its reason', () => {
    const rejectedInput = postgresError({
      message: `invalid input syntax for type uuid: "${SECRET_PARAM}"`,
      code: '22P02',
    });

    expect(reasonOf(rejectedInput)).toBe(
      'PostgresError (failureCategory=unclassified, sqlState=22P02)'
    );
  });

  it('describes an error wrapping a failed query by that query, never by its own message or the parameters', () => {
    const wrapped = new Error(`Lookup failed: ${SECRET_PARAM}`, {
      cause: failedQuery([SECRET_PARAM]),
    });

    expect(reasonOf(wrapped)).toBe(
      'Error (failureCategory=unclassified, sqlState=40P01)'
    );
  });
});
