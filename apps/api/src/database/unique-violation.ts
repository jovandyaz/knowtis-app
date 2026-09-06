const UNIQUE_VIOLATION_CODE = '23505';

interface DriverError {
  readonly code?: string;
  readonly constraint_name?: string;
}

/**
 * Drizzle wraps the driver error, so the Postgres code and the constraint name
 * live on `cause` rather than on the error it throws.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = (error as { cause?: DriverError } | null)?.cause;
  return (
    cause?.code === UNIQUE_VIOLATION_CODE &&
    cause.constraint_name === constraint
  );
}
