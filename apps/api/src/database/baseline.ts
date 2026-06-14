/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';

interface BaselineMigration {
  hash: string;
  folderMillis: number;
}

/**
 * Picks which migrations to record as already-applied. `cutoffMillis` caps the
 * baseline so newer migrations stay pending for the next `migrate()` run; rows
 * whose timestamp is already tracked are skipped (idempotent).
 */
export function planBaseline(
  migrations: BaselineMigration[],
  recordedCreatedAt: ReadonlySet<number>,
  cutoffMillis?: number
): { hash: string; createdAt: number }[] {
  return migrations
    .filter((m) => cutoffMillis === undefined || m.folderMillis <= cutoffMillis)
    .filter((m) => !recordedCreatedAt.has(m.folderMillis))
    .map((m) => ({ hash: m.hash, createdAt: m.folderMillis }));
}

function resolveCutoffMillis(
  migrationsFolder: string,
  upToTag: string | undefined
): number | undefined {
  if (!upToTag) {
    return undefined;
  }
  const journalPath = join(migrationsFolder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string; when: number }[];
  };
  const entry = journal.entries.find((e) => e.tag === upToTag);
  if (!entry) {
    throw new Error(`Unknown migration tag: ${upToTag}`);
  }
  return entry.when;
}

async function main(): Promise<void> {
  loadEnv({ path: ['.env.local', '.env'] });

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to baseline migrations.');
    process.exit(1);
  }

  const migrationsFolder = resolve(__dirname, '../../drizzle');
  const upToTag = process.argv[2];
  const cutoffMillis = resolveCutoffMillis(migrationsFolder, upToTag);
  const migrations = readMigrationFiles({ migrationsFolder }).map((m) => ({
    hash: m.hash,
    folderMillis: m.folderMillis,
  }));

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
    await sql`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`;

    const existing = await sql<{ created_at: string }[]>`
      select created_at from "drizzle"."__drizzle_migrations"`;
    const recorded = new Set(existing.map((r) => Number(r.created_at)));

    const rows = planBaseline(migrations, recorded, cutoffMillis);
    for (const row of rows) {
      await sql`insert into "drizzle"."__drizzle_migrations" ("hash", "created_at")
        values (${row.hash}, ${row.createdAt})`;
    }

    console.log(
      `Baselined ${rows.length} migration(s)${upToTag ? ` up to ${upToTag}` : ''}; ` +
        `${recorded.size} already recorded.`
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.includes('baseline')) {
  main().catch((error) => {
    console.error('Failed to baseline migrations:', error);
    process.exit(1);
  });
}
