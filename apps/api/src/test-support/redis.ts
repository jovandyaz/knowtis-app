/**
 * Whether Redis-backed specs can reach a real Redis; gate them with `describe.runIf(REDIS_AVAILABLE)`.
 * test-env.setup.ts has already swapped REDIS_URL for REDIS_URL_TEST, and fails CI when that is unset.
 */
export const REDIS_AVAILABLE = !!process.env['REDIS_URL']?.trim();
