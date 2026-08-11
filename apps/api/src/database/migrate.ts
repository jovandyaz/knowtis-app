/* eslint-disable no-console */
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Stable, app-specific key so concurrent deploys serialize on the same advisory
// lock instead of racing the drizzle journal.
const MIGRATION_LOCK_KEY = 4011989;

const LOCK_TIMEOUT = '5s';
const LOCK_NOT_AVAILABLE = '55P03';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

type Db = ReturnType<typeof drizzle>;

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

function isLockTimeout(error: unknown): boolean {
  return (
    error instanceof postgres.PostgresError && error.code === LOCK_NOT_AVAILABLE
  );
}

/** Applies pending migrations, retrying a lock timeout and nothing else. Rejects once attempts run out — a failed migration must block the deploy. */
async function applyPending(db: Db, migrationsFolder: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await migrate(db, { migrationsFolder });
      return;
    } catch (error) {
      if (!isLockTimeout(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      console.warn(
        `[migrate] lock timeout after ${LOCK_TIMEOUT}; another transaction holds a lock on a table being altered. Retrying (${attempt}/${MAX_ATTEMPTS - 1})…`
      );
      await delay(RETRY_DELAY_MS);
    }
  }
}

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
      await db.execute(sql`SET lock_timeout = ${sql.raw(`'${LOCK_TIMEOUT}'`)}`);
      console.log('[migrate] applying pending migrations…');
      await applyPending(db, migrationsFolder);
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
