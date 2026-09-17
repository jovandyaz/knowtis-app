import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  decide,
  insideWorkspace,
  MAX_CONSECUTIVE_BLOCKS,
  readBlockCount,
  readHookInput,
  runTypecheck,
  statePath,
  unusableRun,
  writeBlockCount,
} from '../claude-stop-typecheck.mjs';

const SCRIPT = fileURLToPath(
  new URL('../claude-stop-typecheck.mjs', import.meta.url)
);
const dirs = [];
after(() =>
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }))
);

function scratch(prefix = 'stop-typecheck-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** Puts a scripted `pnpm` ahead of the real one so the hook can be driven end to end. */
function fakePnpm(body) {
  const dir = scratch('stop-typecheck-bin-');
  const bin = join(dir, 'pnpm');
  writeFileSync(bin, `#!/bin/sh\n${body}\n`);
  chmodSync(bin, 0o755);
  return dir;
}

function runHook({ pnpmBody, sessionId = 's-1', pathDir }) {
  const bin = pathDir ?? fakePnpm(pnpmBody);
  return spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ session_id: sessionId, hook_event_name: 'Stop' }),
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
  });
}

test('a passing typecheck lets the turn end and clears the streak', () => {
  assert.deepEqual(decide({ failed: false, previousBlocks: 1 }), {
    exitCode: 0,
    blocks: 0,
    blocked: false,
  });
});

test('a failing typecheck blocks with exit 2, the only code Claude sees', () => {
  assert.deepEqual(decide({ failed: true, previousBlocks: 0 }), {
    exitCode: 2,
    blocks: 1,
    blocked: true,
  });
});

test('a second failure still blocks and advances the streak', () => {
  assert.deepEqual(decide({ failed: true, previousBlocks: 1 }), {
    exitCode: 2,
    blocks: 2,
    blocked: true,
  });
});

test('the cap releases the turn with exit 1 so the user still hears about it', () => {
  assert.deepEqual(
    decide({ failed: true, previousBlocks: MAX_CONSECUTIVE_BLOCKS }),
    {
      exitCode: 1,
      blocks: 0,
      blocked: false,
      exhausted: true,
    }
  );
});

test('a streak already past the cap still releases', () => {
  assert.deepEqual(decide({ failed: true, previousBlocks: 99 }), {
    exitCode: 1,
    blocks: 0,
    blocked: false,
    exhausted: true,
  });
});

test('each session keeps its own streak', () => {
  const dir = scratch();
  assert.notEqual(statePath('abc', dir), statePath('def', dir));
});

test('a session id cannot escape the state directory', () => {
  const dir = scratch();
  assert.equal(
    statePath('../../etc/passwd', dir),
    join(dir, '______etc_passwd.count')
  );
});

test('an absent, empty or non-string session id resolves to one stable file', () => {
  const dir = scratch();
  const fallback = join(dir, 'unknown.count');
  for (const id of [undefined, null, '']) {
    assert.equal(statePath(id, dir), fallback, `for ${JSON.stringify(id)}`);
  }
  assert.equal(statePath(7, dir), join(dir, '7.count'));
  assert.equal(statePath('///', dir), join(dir, '___.count'));
  assert.equal(statePath({}, dir), join(dir, '_object_Object_.count'));
});

test('the streak survives a round trip and zero deletes the file', () => {
  const file = statePath('roundtrip', scratch());
  assert.equal(readBlockCount(file), 0);
  writeBlockCount(file, 2);
  assert.equal(readBlockCount(file), 2);
  writeBlockCount(file, 0);
  assert.equal(readBlockCount(file), 0);
});

test('the state directory is created on first write', () => {
  const file = statePath('nested', join(scratch(), 'not', 'yet', 'there'));
  writeBlockCount(file, 1);
  assert.equal(readFileSync(file, 'utf8'), '1');
});

test('an unwritable state directory never aborts the hook', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'sub'), '');
  assert.doesNotThrow(() =>
    writeBlockCount(statePath('denied', join(dir, 'sub')), 1)
  );
});

test('a corrupt or negative state file reads as no streak', () => {
  const dir = scratch();
  const file = join(dir, 'corrupt.count');
  for (const contents of ['', 'nope', '-3', '0']) {
    writeFileSync(file, contents);
    assert.equal(readBlockCount(file), 0, `for ${JSON.stringify(contents)}`);
  }
});

test('unusable hook input degrades to an empty payload', () => {
  for (const raw of ['', 'not json', 'null', '[]', '"text"', '7']) {
    assert.deepEqual(readHookInput(raw), {}, `for ${JSON.stringify(raw)}`);
  }
});

test('a well-formed payload yields its session id', () => {
  assert.equal(readHookInput('{"session_id":"s-1"}').session_id, 's-1');
});

test('a run that never produced a verdict is not a type error', () => {
  assert.equal(unusableRun({ status: 0 }), null);
  assert.equal(unusableRun({ status: 1 }), null);
  assert.match(unusableRun({ error: new Error('spawn ENOENT') }), /ENOENT/);
  assert.match(unusableRun({ status: null, signal: 'SIGTERM' }), /SIGTERM/);
  assert.match(unusableRun({ status: null, signal: null }), /unknown signal/);
});

test('the typecheck runs from the given tree and pins nx to it', () => {
  const dir = fakePnpm(
    'printf "%s|%s|%s" "$PWD" "$NX_WORKSPACE_ROOT_PATH" "$*"'
  );
  const tree = realpathSync(scratch('stop-typecheck-tree-'));
  const path = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${path}`;
  const result = runTypecheck(tree);
  process.env.PATH = path;
  const [cwd, nxRoot, args] = result.stdout.split('|');
  assert.equal(cwd, tree);
  assert.equal(nxRoot, tree);
  assert.equal(args, 'nx affected -t typecheck --base=HEAD');
});

test('a session inside the tree is covered, one beside it is not', () => {
  const root = '/repo/main';
  for (const cwd of [
    '/repo/main',
    '/repo/main/apps/api',
    '/repo/main/./apps',
  ]) {
    assert.equal(insideWorkspace(cwd, root), true, `for ${cwd}`);
  }
  for (const cwd of ['/repo', '/repo/main-wt', '/repo/other', '/']) {
    assert.equal(insideWorkspace(cwd, root), false, `for ${cwd}`);
  }
  for (const cwd of [7, {}, [], true, null, undefined]) {
    assert.equal(
      insideWorkspace(cwd, root),
      false,
      `for ${JSON.stringify(cwd)}`
    );
  }
});

test('end to end: a session in another tree is skipped, not typechecked', () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ session_id: 'e2e-foreign', cwd: tmpdir() }),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakePnpm('exit 0')}${delimiter}${process.env.PATH}`,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /skipped/);
});

test('end to end: a non-string cwd is refused, not crashed on', () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    input: '{"session_id":"e2e-badcwd","cwd":7}',
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakePnpm('exit 0')}${delimiter}${process.env.PATH}`,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /skipped/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});

test('end to end: a green typecheck exits 0 and says nothing', () => {
  const result = runHook({ pnpmBody: 'exit 0', sessionId: 'e2e-green' });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

test('end to end: a red typecheck exits 2 and hands the output back', () => {
  rmSync(statePath('e2e-red'), { force: true });
  after(() => rmSync(statePath('e2e-red'), { force: true }));
  const result = runHook({
    pnpmBody: 'echo "TS2322: Type string is not assignable to number"; exit 1',
    sessionId: 'e2e-red',
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Fix it before finishing/);
  assert.match(result.stderr, /TS2322/);
});

test('end to end: the third consecutive failure releases the turn with exit 1', () => {
  const bin = fakePnpm('echo "TS2322"; exit 1');
  const session = `e2e-cap-${process.pid}`;
  rmSync(statePath(session), { force: true });
  after(() => rmSync(statePath(session), { force: true }));

  const runs = [1, 2, 3].map(() =>
    runHook({ pathDir: bin, sessionId: session })
  );
  assert.deepEqual(
    runs.map((run) => run.status),
    [2, 2, 1]
  );
  assert.match(runs[2].stderr, /still failing after 2 attempts/);

  const recovered = runHook({
    pathDir: fakePnpm('exit 0'),
    sessionId: session,
  });
  assert.equal(recovered.status, 0);
});

test('end to end: a typecheck that cannot run is reported as such, not as a type error', () => {
  const bin = fakePnpm('exit 0');
  rmSync(join(bin, 'pnpm'), { force: true });
  const result = spawnSync(process.execPath, [SCRIPT], {
    input: '{"session_id":"e2e-missing"}',
    encoding: 'utf8',
    env: { ...process.env, PATH: bin },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not run/);
});
