#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const plugins = [
  'nx@nx-claude-plugins',
  'domain@knowtis-plugins',
  'db-ops@knowtis-plugins',
  'delivery@knowtis-plugins',
  'standards@knowtis-plugins',
];

function run(args, capture = false) {
  const result = spawnSync('claude', ['plugin', ...args], {
    cwd: repoRoot,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error?.code === 'ENOENT') {
    process.stderr.write(
      'Claude Code is required: https://code.claude.com/docs/en/setup\n'
    );
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
}

const installed = JSON.parse(run(['list', '--json'], true));
for (const plugin of plugins) {
  const projectInstall = installed.some(
    (entry) =>
      entry.id === plugin &&
      entry.scope === 'project' &&
      entry.projectPath &&
      resolve(entry.projectPath) === repoRoot
  );
  run([projectInstall ? 'update' : 'install', plugin, '--scope', 'project']);
}

process.stdout.write(
  'Claude Code project plugins are installed. Restart Claude Code to load updates.\n'
);
