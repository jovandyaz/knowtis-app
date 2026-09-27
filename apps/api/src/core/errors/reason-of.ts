import { databaseDiagnostics, isDatabaseError } from './database-diagnostics';

/** The message of whatever was thrown, for a log line or a report; a database error gives its diagnostics instead, since its message can quote query values. */
export function reasonOf(error: unknown): string {
  if (isDatabaseError(error)) {
    const { errorName, ...facts } = databaseDiagnostics(error);
    const described = Object.entries(facts)
      .map(([field, value]) => `${field}=${value}`)
      .join(', ');
    return `${errorName} (${described})`;
  }
  return error instanceof Error ? error.message : String(error);
}
