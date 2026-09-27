import { DrizzleQueryError } from 'drizzle-orm';
import postgres from 'postgres';

const SQLSTATE_PATTERN = /^[A-Z0-9]{5}$/;

type FailureCategory =
  | 'unique_violation'
  | 'connection_failure'
  | 'transaction_conflict'
  | 'unclassified';

/**
 * What a database failure may say in a log line or an error. Only fields that
 * name the failure qualify: drizzle's message quotes every bound parameter,
 * and a Postgres message or detail can echo the rejected input.
 */
export interface DatabaseDiagnostics {
  errorName: string;
  failureCategory: FailureCategory;
  sqlState: string | null;
  table?: string;
  column?: string;
  constraint?: string;
}

const FAILURE_CATEGORY_BY_CODE = new Map<unknown, FailureCategory>([
  ['23505', 'unique_violation'],
  ['08006', 'connection_failure'],
  ['ECONNREFUSED', 'connection_failure'],
  ['55P03', 'transaction_conflict'],
]);

/** Whether the error came from a query, so its message and fields may carry query values. */
export function isDatabaseError(
  error: unknown
): error is DrizzleQueryError | postgres.PostgresError {
  return (
    error instanceof DrizzleQueryError ||
    error instanceof postgres.PostgresError
  );
}

/** The whitelisted facts of whatever a query threw; any other error reports only its name. */
export function databaseDiagnostics(error: unknown): DatabaseDiagnostics {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? cause.code
      : undefined;
  const diagnostics: DatabaseDiagnostics = {
    errorName: error instanceof Error ? error.constructor.name : typeof error,
    failureCategory: FAILURE_CATEGORY_BY_CODE.get(code) ?? 'unclassified',
    sqlState:
      typeof code === 'string' && SQLSTATE_PATTERN.test(code) ? code : null,
  };
  if (!(cause instanceof postgres.PostgresError)) {
    return diagnostics;
  }
  return {
    ...diagnostics,
    ...(cause.table_name && { table: cause.table_name }),
    ...(cause.column_name && { column: cause.column_name }),
    ...(cause.constraint_name && { constraint: cause.constraint_name }),
  };
}
