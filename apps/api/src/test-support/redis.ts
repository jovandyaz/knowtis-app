import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env.local', '.env'], quiet: true });

/**
 * Whether Redis-backed specs can reach a real Redis; gate them with `describe.runIf(REDIS_AVAILABLE)`.
 * Importing this in CI without Redis throws, because a silent skip there reports green with zero coverage.
 */
export const REDIS_AVAILABLE = !!process.env['REDIS_URL']?.trim();

if (process.env['CI'] && !REDIS_AVAILABLE) {
  throw new Error(
    'REDIS_URL is unset in CI: redis-backed specs would skip and report green with zero coverage.'
  );
}
