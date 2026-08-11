import postgres from 'postgres';

const LOCK_NOT_AVAILABLE = '55P03';
const RETRY_DELAY_MS = 3000;

export const MAX_MIGRATION_ATTEMPTS = 3;

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Whether the error, or anything it wraps, is a Postgres lock timeout: drizzle rethrows driver errors nested under `cause`, so the top-level error is never a `PostgresError`. */
export function isLockTimeout(error: unknown): boolean {
  for (
    let cause: unknown = error;
    cause instanceof Error;
    cause = cause.cause
  ) {
    if (
      cause instanceof postgres.PostgresError &&
      cause.code === LOCK_NOT_AVAILABLE
    ) {
      return true;
    }
  }
  return false;
}

/** Runs `apply`, retrying only a lock timeout. Rejects once attempts run out — a failed migration must block the deploy. */
export async function applyWithLockRetry(
  apply: () => Promise<void>,
  onRetry: (attempt: number) => void
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_MIGRATION_ATTEMPTS; attempt += 1) {
    try {
      await apply();
      return;
    } catch (error) {
      if (!isLockTimeout(error) || attempt === MAX_MIGRATION_ATTEMPTS) {
        throw error;
      }
      onRetry(attempt);
      await delay(RETRY_DELAY_MS);
    }
  }
}
