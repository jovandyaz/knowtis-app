#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const apiDir = join(repoRoot, 'apps', 'api');
const TEST_DATABASE_NAME = /^[a-z0-9_]+_test$/;
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
// Mirrors apps/api/src/test-support/test-env.ts: postgres.js and libpq let
// these query keys override the database named in the path.
const DATABASE_QUERY_KEYS = ['database', 'dbname'];
// Passed by `pnpm run setup`: scaffoldEnv never rewrites an older .env that lacks the variable.
const SKIP_IF_UNSET = process.argv.includes('--skip-if-unset');

function fail(message) {
  process.stderr.write(`\n✗ ${message}\n`);
  process.exit(1);
}

function readTestUrl() {
  const env = { ...process.env };
  loadEnv({
    path: [join(apiDir, '.env.local'), join(apiDir, '.env')],
    processEnv: env,
    quiet: true,
  });
  const raw = env['DATABASE_URL_TEST']?.trim();
  if (!raw && SKIP_IF_UNSET) {
    process.stdout.write(
      '· Skipped: DATABASE_URL_TEST is unset. Copy DATABASE_URL_TEST and REDIS_URL_TEST from apps/api/.env.example into apps/api/.env, then run pnpm db:test:prepare.\n'
    );
    process.exit(0);
  }
  if (!raw) {
    fail(
      'DATABASE_URL_TEST is not set in apps/api/.env.local or apps/api/.env. Copy it from apps/api/.env.example.'
    );
  }
  return raw;
}

function parseTestUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('DATABASE_URL_TEST is not a valid URL.');
  }
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    fail('DATABASE_URL_TEST must be a postgres:// or postgresql:// URL.');
  }
  const name = url.pathname.slice(1);
  const wrong = [
    name,
    ...DATABASE_QUERY_KEYS.flatMap((key) => url.searchParams.getAll(key)),
  ].find((candidate) => !TEST_DATABASE_NAME.test(candidate));
  if (wrong !== undefined) {
    fail(
      `DATABASE_URL_TEST names database "${wrong}": it must match ${TEST_DATABASE_NAME} so the dev database is never touched.`
    );
  }
  return { url, name };
}

async function ensureDatabase(url, name) {
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  for (const key of DATABASE_QUERY_KEYS) adminUrl.searchParams.delete(key);

  const sql = postgres(adminUrl.href, { max: 1, onnotice: () => {} });
  try {
    const existing =
      await sql`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (existing.length > 0) {
      process.stdout.write(`· ${name} already exists\n`);
      return;
    }
    await sql.unsafe(`CREATE DATABASE "${name}"`);
    process.stdout.write(`✓ created ${name}\n`);
  } finally {
    await sql.end();
  }
}

function migrate(testUrl, name) {
  process.stdout.write(`→ applying migrations to ${name}\n`);
  const result = spawnSync('pnpm', ['exec', 'tsx', 'src/database/migrate.ts'], {
    cwd: apiDir,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
  if (result.error) fail(`Could not run the migrator: ${result.error.message}`);
  if (result.status !== 0) fail(`Migrating ${name} failed.`);
}

const testUrl = readTestUrl();
const { url, name } = parseTestUrl(testUrl);
process.stdout.write(`Test database: ${name} on ${url.host}\n`);

try {
  await ensureDatabase(url, name);
} catch (error) {
  fail(`Could not create ${name} on ${url.host}: ${error.message}`);
}
migrate(testUrl, name);
process.stdout.write(`✓ ${name} is ready\n`);
