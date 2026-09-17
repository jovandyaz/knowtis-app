#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_CONSECUTIVE_BLOCKS = 2;

const WORKSPACE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATE_DIR = join(tmpdir(), `knowtis-stop-typecheck-${userInfo().uid}`);
const OUTPUT_LIMIT = 20 * 1024 * 1024;

export function statePath(sessionId, stateDir = STATE_DIR) {
  const key = String(sessionId ?? '').replace(/[^\w-]/g, '_') || 'unknown';
  return join(stateDir, `${key}.count`);
}

export function readBlockCount(file) {
  try {
    const count = Number.parseInt(readFileSync(file, 'utf8'), 10);
    return Number.isInteger(count) && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}

export function writeBlockCount(file, count) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    if (count > 0) writeFileSync(file, String(count));
    else rmSync(file, { force: true });
  } catch {
    // Losing the streak only restarts the cap; it must never abort the hook.
  }
}

/**
 * Maps a typecheck outcome to a Stop-hook exit code. Only exit 2 blocks the turn
 * and hands stderr back to Claude; every other code merely reports to the user.
 * The cap exists because a failure Claude cannot fix — a pre-existing error in a
 * dependent project, or the user's own half-written code — would otherwise block
 * every attempt to end the turn.
 */
export function decide({ failed, previousBlocks }) {
  if (!failed) return { exitCode: 0, blocks: 0, blocked: false };
  if (previousBlocks >= MAX_CONSECUTIVE_BLOCKS) {
    return { exitCode: 1, blocks: 0, blocked: false, exhausted: true };
  }
  return { exitCode: 2, blocks: previousBlocks + 1, blocked: true };
}

export function readHookInput(raw) {
  try {
    const input = JSON.parse(raw);
    return input && typeof input === 'object' && !Array.isArray(input)
      ? input
      : {};
  } catch {
    return {};
  }
}

export function runTypecheck(cwd = WORKSPACE_ROOT) {
  return spawnSync(
    'pnpm',
    ['nx', 'affected', '-t', 'typecheck', '--base=HEAD'],
    {
      cwd,
      encoding: 'utf8',
      maxBuffer: OUTPUT_LIMIT,
      // An inherited NX_WORKSPACE_ROOT_PATH points every nx run at whichever tree
      // exported it, so a worktree would silently typecheck the main checkout.
      env: { ...process.env, NX_WORKSPACE_ROOT_PATH: cwd },
    }
  );
}

/** A null status means the run never produced a verdict: spawn failure, signal, or truncated output. */
export function unusableRun(result) {
  if (result.error) return result.error.message;
  if (result.status === null)
    return `killed by ${result.signal ?? 'an unknown signal'}`;
  return null;
}

export function insideWorkspace(cwd, root = WORKSPACE_ROOT) {
  const resolved = resolve(cwd);
  return resolved === root || resolved.startsWith(root + sep);
}

function main() {
  let stdin = '';
  try {
    stdin = readFileSync(0, 'utf8');
  } catch {
    stdin = '';
  }
  const { session_id: sessionId, cwd } = readHookInput(stdin);
  const file = statePath(sessionId);

  // The hook runs whichever copy of this script its working directory resolves
  // to, so a session outside this tree would typecheck the wrong checkout.
  if (cwd && !insideWorkspace(cwd)) {
    process.stderr.write(
      `Stop typecheck skipped: this copy covers ${WORKSPACE_ROOT} but the session is in ${cwd}\n`
    );
    process.exit(1);
  }

  const result = runTypecheck();
  const unusable = unusableRun(result);
  if (unusable) {
    process.stderr.write(`Stop typecheck could not run: ${unusable}\n`);
    process.exit(1);
  }

  const decision = decide({
    failed: result.status !== 0,
    previousBlocks: readBlockCount(file),
  });
  writeBlockCount(file, decision.blocks);

  if (decision.blocked) {
    process.stderr.write(
      `Typecheck failed for the current working tree. Fix it before finishing.\n\n${result.stdout}${result.stderr}`
    );
  } else if (decision.exhausted) {
    process.stderr.write(
      `Typecheck still failing after ${MAX_CONSECUTIVE_BLOCKS} attempts; letting the turn end.\n`
    );
  }
  process.exit(decision.exitCode);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
