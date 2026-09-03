#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

// A standalone `nx serve <project>` that outlives its terminal keeps the Nx task
// lock, so the next run stalls on "Waiting for <project>:serve in another nx
// process" with the port free. Match only that shape: a live run-many worker
// reads as "<project>:serve:development" and is never touched.
const PROJECTS = ['notes', 'api', 'backoffice', 'mcp'];

function sh(cmd, args) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function kill(pid, extraArgs = []) {
  spawnSync('kill', [...extraArgs, String(pid)], { stdio: 'ignore' });
}

let stopped = 0;

for (const project of PROJECTS) {
  const pids = sh('pgrep', ['-f', `nx\\.js serve ${project}`])
    .split('\n')
    .filter(Boolean);
  for (const pid of pids) {
    process.stdout.write(
      `Stale 'nx serve ${project}' (pid ${pid}) holds the Nx lock — stopping it\n`
    );
    const parent = sh('ps', ['-o', 'ppid=', '-p', pid]).trim();
    if (
      parent &&
      sh('ps', ['-o', 'command=', '-p', parent]).includes(`nx serve ${project}`)
    ) {
      kill(parent);
    }
    spawnSync('pkill', ['-P', pid], { stdio: 'ignore' });
    kill(pid);
    stopped += 1;
  }
}

process.stdout.write(
  stopped === 0
    ? 'No stale serve locks found\n'
    : `Stopped ${stopped} stale serve process(es)\n`
);
