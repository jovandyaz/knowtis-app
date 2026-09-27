import { DrizzleQueryError } from 'drizzle-orm';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import { databaseDiagnostics, isDatabaseError } from './database-diagnostics';

const SECRET_PARAM = '$argon2id$v=19$m=65536,t=3,p=4$sentinel-hash';

const PostgresError = postgres.PostgresError as unknown as new (
  fields: Partial<postgres.PostgresError>
) => postgres.PostgresError;

const uniqueViolation = new PostgresError({
  message:
    'duplicate key value violates unique constraint "users_email_unique"',
  code: '23505',
  schema_name: 'public',
  table_name: 'users',
  constraint_name: 'users_email_unique',
  detail: `Key (email)=(${SECRET_PARAM}) already exists.`,
});

function failedQuery(cause: unknown) {
  return new DrizzleQueryError(
    'insert into "users" ("email", "password_hash") values ($1, $2)',
    ['someone@example.com', SECRET_PARAM],
    cause as Error
  );
}

describe('databaseDiagnostics', () => {
  it('names the SQLSTATE and the schema objects of the Postgres error a failed query wraps', () => {
    const diagnostics = databaseDiagnostics(failedQuery(uniqueViolation));

    expect(diagnostics).toStrictEqual({
      errorName: 'DrizzleQueryError',
      failureCategory: 'unique_violation',
      sqlState: '23505',
      table: 'users',
      constraint: 'users_email_unique',
    });
    expect(JSON.stringify(diagnostics)).not.toContain(SECRET_PARAM);
  });

  it('names the column of a raw Postgres error that reports one', () => {
    const notNull = new PostgresError({
      message:
        'null value in column "password_hash" of relation "users" violates not-null constraint',
      code: '23502',
      table_name: 'users',
      column_name: 'password_hash',
    });

    expect(databaseDiagnostics(notNull)).toStrictEqual({
      errorName: 'PostgresError',
      failureCategory: 'unclassified',
      sqlState: '23502',
      table: 'users',
      column: 'password_hash',
    });
  });

  it.each([
    ['23505', 'unique_violation', '23505'],
    ['08006', 'connection_failure', '08006'],
    ['ECONNREFUSED', 'connection_failure', null],
    ['55P03', 'transaction_conflict', '55P03'],
    [SECRET_PARAM, 'unclassified', null],
  ])(
    'classifies the driver code %s without echoing it unless it is a SQLSTATE',
    (code, failureCategory, sqlState) => {
      const cause = Object.assign(new Error(SECRET_PARAM), {
        code,
        detail: SECRET_PARAM,
        constraint_name: SECRET_PARAM,
      });

      const diagnostics = databaseDiagnostics(failedQuery(cause));

      expect(diagnostics).toStrictEqual({
        errorName: 'DrizzleQueryError',
        failureCategory,
        sqlState,
      });
      expect(JSON.stringify(diagnostics)).not.toContain(SECRET_PARAM);
    }
  );

  it('reports only the name of an error that never reached the driver', () => {
    expect(databaseDiagnostics(new TypeError(SECRET_PARAM))).toStrictEqual({
      errorName: 'TypeError',
      failureCategory: 'unclassified',
      sqlState: null,
    });
    expect(databaseDiagnostics(SECRET_PARAM)).toStrictEqual({
      errorName: 'string',
      failureCategory: 'unclassified',
      sqlState: null,
    });
  });
});

describe('isDatabaseError', () => {
  it('recognizes a failed query and a raw Postgres error', () => {
    expect(isDatabaseError(failedQuery(uniqueViolation))).toBe(true);
    expect(isDatabaseError(uniqueViolation)).toBe(true);
  });

  it('leaves every other error alone', () => {
    expect(isDatabaseError(new Error('connect ECONNREFUSED'))).toBe(false);
    expect(isDatabaseError('timeout')).toBe(false);
  });
});
