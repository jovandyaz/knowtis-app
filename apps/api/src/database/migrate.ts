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
      console.log('[migrate] applying pending migrations…');
      await migrate(db, { migrationsFolder });
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
