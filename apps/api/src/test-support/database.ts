import { config as loadEnv } from 'dotenv';

loadEnv({ path: ['.env.local', '.env'] });

/**
 * Whether DB-backed specs can reach a real database; gate them with `describe.runIf(DB_AVAILABLE)`.
 * Importing this in CI without a database throws, because a silent skip there reports green with zero coverage.
 */
export const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();

if (process.env['CI'] && !DB_AVAILABLE) {
  throw new Error(
    'DATABASE_URL is unset in CI: database-backed specs would skip and report green with zero coverage.'
  );
}
