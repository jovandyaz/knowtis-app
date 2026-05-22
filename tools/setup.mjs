#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scaffoldEnv } from './setup-env.mjs';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const APP_DIRS = [
  join(repoRoot, 'apps', 'api'),
  join(repoRoot, 'apps', 'notes'),
  join(repoRoot, 'apps', 'mcp'),
];
const POSTGRES_READY_TIMEOUT_MS = 60_000;
const POSTGRES_POLL_INTERVAL_MS = 1000;

function step(message) {
  process.stdout.write(`\n→ ${message}\n`);
}

function fail(message) {
  process.stderr.write(`\n✗ ${message}\n`);
  process.exit(1);
}

function ensureNode22() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (Number.isNaN(major) || major < 22) {
    fail(
      `Node 22.x required (you are on ${process.versions.node}). Install with: nvm install 22 && nvm use 22`
    );
  }
}

function ensureDocker() {
  const result = spawnSync('docker', ['info'], { stdio: 'ignore' });
  if (result.status !== 0) {
    fail('Docker is not running. Start Docker Desktop and re-run pnpm setup.');
  }
}

function scaffoldAllEnvs() {
  for (const dir of APP_DIRS) {
    const result = scaffoldEnv(dir);
    if (result.missingExample) {
      fail(`Missing .env.example in ${dir} — repository is in a bad state.`);
    }
    process.stdout.write(
      result.created
        ? `  ✓ created ${result.path}\n`
        : `  · skipped ${result.path} (already exists)\n`
    );
  }
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...opts,
  });
  if (result.status !== 0) {
    fail(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

function waitForPostgres() {
  const deadline = Date.now() + POSTGRES_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = spawnSync(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'pg_isready'],
      { stdio: 'ignore', cwd: repoRoot }
    );
    if (result.status === 0) return;
    spawnSync('sleep', [String(POSTGRES_POLL_INTERVAL_MS / 1000)]);
  }
  fail(`Postgres did not become ready within ${POSTGRES_READY_TIMEOUT_MS / 1000}s.`);
}

ensureNode22();
ensureDocker();

step('Scaffolding .env files');
scaffoldAllEnvs();

step('Installing dependencies (pnpm install)');
run('pnpm', ['install', '--prefer-frozen-lockfile']);

step('Starting Docker services');
run('pnpm', ['docker:up']);

step('Waiting for Postgres to become ready');
waitForPostgres();

step('Pushing database schema');
run('pnpm', ['db:push']);

process.stdout.write(`
✓ Setup complete. Next:
    pnpm dev:all       # start API + frontend
    pnpm db:studio     # browse the database

Edit apps/api/.env to fill in any provider keys (Anthropic, OpenAI, etc.) you plan to use.
`);
