import { DrizzleQueryError } from 'drizzle-orm';
import postgres from 'postgres';

const PostgresError = postgres.PostgresError as unknown as new (
  fields: Partial<postgres.PostgresError>
) => postgres.PostgresError;

/** A Postgres error as postgres.js raises it, fields and all; its typings declare no constructor that takes them. */
export function postgresError(
  fields: Partial<postgres.PostgresError>
): postgres.PostgresError {
  return new PostgresError(fields);
}

/** A query drizzle gave up on, quoting `params` in its message the way drizzle does. */
export function failedQuery(
  params: unknown[],
  cause: unknown = postgresError({
    message: 'deadlock detected',
    code: '40P01',
  })
): DrizzleQueryError {
  return new DrizzleQueryError(
    'insert into "fixtures" ("value") values ($1)',
    params,
    cause as Error
  );
}
