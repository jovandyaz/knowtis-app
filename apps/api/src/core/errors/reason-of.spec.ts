import { DrizzleQueryError } from 'drizzle-orm';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import { reasonOf } from './reason-of';

const SECRET_PARAM = '$argon2id$v=19$m=65536,t=3,p=4$sentinel-hash';

const PostgresError = postgres.PostgresError as unknown as new (
  fields: Partial<postgres.PostgresError>
) => postgres.PostgresError;

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
    const failedQuery = new DrizzleQueryError(
      'insert into "users" ("email", "password_hash") values ($1, $2)',
      ['someone@example.com', SECRET_PARAM],
      new PostgresError({
        message:
          'duplicate key value violates unique constraint "users_email_unique"',
        code: '23505',
        table_name: 'users',
        constraint_name: 'users_email_unique',
        detail: `Key (email)=(someone@example.com) already exists.`,
      })
    );

    const reason = reasonOf(failedQuery);

    expect(reason).toBe(
      'DrizzleQueryError (failureCategory=unique_violation, sqlState=23505, table=users, constraint=users_email_unique)'
    );
    expect(reason).not.toContain(SECRET_PARAM);
    expect(reason).not.toContain('someone@example.com');
  });

  it('keeps the input a raw Postgres error echoes out of its reason', () => {
    const rejectedInput = new PostgresError({
      message: `invalid input syntax for type uuid: "${SECRET_PARAM}"`,
      code: '22P02',
    });

    expect(reasonOf(rejectedInput)).toBe(
      'PostgresError (failureCategory=unclassified, sqlState=22P02)'
    );
  });
});
