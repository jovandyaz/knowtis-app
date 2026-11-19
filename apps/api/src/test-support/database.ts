/**
 * Whether DB-backed specs can reach a real database; gate them with `describe.runIf(DB_AVAILABLE)`.
 * test-env.setup.ts has already swapped DATABASE_URL for DATABASE_URL_TEST, and fails CI when that is unset.
 */
export const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();
