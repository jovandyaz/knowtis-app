import { databaseDiagnostics, isDatabaseError } from './database-diagnostics';

const UNKNOWN_KIND = 'unknown';

function kindOf(thrown: object): string {
  const name: unknown = Object.getPrototypeOf(thrown)?.constructor?.name;
  return typeof name === 'string' && name !== '' ? name : UNKNOWN_KIND;
}

/**
 * The message of whatever was thrown, for a log line or a report. A database
 * error gives its diagnostics, since its message can quote query values, and
 * any other non-Error object only its class, since it can hold them too.
 * Never throws: it runs inside catch blocks.
 */
export function reasonOf(error: unknown): string {
  if (
    error === null ||
    (typeof error !== 'object' && typeof error !== 'function')
  ) {
    return String(error);
  }
  try {
    if (isDatabaseError(error)) {
      const { errorName, ...facts } = databaseDiagnostics(error);
      const described = Object.entries(facts)
        .map(([field, value]) => `${field}=${value}`)
        .join(', ');
      return `${errorName} (${described})`;
    }
    return error instanceof Error ? error.message : `[${kindOf(error)}]`;
  } catch {
    return `[${UNKNOWN_KIND}]`;
  }
}
