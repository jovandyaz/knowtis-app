/* eslint-disable no-console */
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { applyWithLockRetry, MAX_MIGRATION_ATTEMPTS } from './migration-retry';

// Stable, app-specific key so concurrent deploys serialize on the same advisory
// lock instead of racing the drizzle journal.
const MIGRATION_LOCK_KEY = 4011989;

const LOCK_TIMEOUT_SECONDS = 5;

async function main(): Promise<void> {
  loadEnv({ path: ['.env.local', '.env'] });

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }

  const migrationsFolder = resolve(__dirname, '../../drizzle');
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    await db.execute(sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
    try {
      // Set after the advisory lock, never before: `lock_timeout` bounds
      // advisory waits too, so a deploy queued behind another would fail
      // instead of waiting its turn.
      await db.execute(
        sql`SELECT set_config('lock_timeout', ${`${LOCK_TIMEOUT_SECONDS}s`}, false)`
      );
      console.log('[migrate] applying pending migrations…');
      await applyWithLockRetry(
        () => migrate(db, { migrationsFolder }),
        (attempt) =>
          console.warn(
            `[migrate] lock timeout after ${LOCK_TIMEOUT_SECONDS}s; another transaction holds a lock on a table being altered. Retrying (${attempt}/${MAX_MIGRATION_ATTEMPTS - 1})…`
          )
      );
      console.log('[migrate] schema up to date.');
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`);
    }
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[migrate] failed:', error);
    process.exit(1);
  });
