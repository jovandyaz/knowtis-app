/* eslint-disable no-console */
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main(): Promise<void> {
  loadEnv({ path: ['.env.local', '.env'] });

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to run migrations.');
    process.exit(1);
  }

  const migrationsFolder = resolve(__dirname, '../../drizzle');
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
    console.log('Migrations applied.');
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error('Failed to run migrations:', error);
  process.exit(1);
});
